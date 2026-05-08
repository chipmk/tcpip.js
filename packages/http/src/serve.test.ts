import { createStack } from 'tcpip';
import { describe, expect, test } from 'vitest';
import { createHttp } from './index.js';

async function readHttpResponseText(readable: ReadableStream<Uint8Array>) {
  const reader = readable.getReader();
  let buffer = new Uint8Array();

  while (true) {
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await reader.read();
    } catch (error) {
      if (buffer.length > 0) {
        break;
      }
      throw error;
    }

    const { done, value } = result;
    if (done) {
      break;
    }
    buffer = concat(buffer, value);

    const headerEnd = findHeaderEnd(buffer);
    if (headerEnd === -1) {
      continue;
    }

    const head = new TextDecoder().decode(buffer.slice(0, headerEnd));
    const bodyStart = headerEnd + 4;

    if (isChunked(head)) {
      const totalLength = findChunkedEnd(buffer, bodyStart);
      if (totalLength !== -1) {
        reader.releaseLock();
        return new TextDecoder().decode(buffer.slice(0, totalLength));
      }
      continue;
    }

    const contentLength = contentLengthFromHead(head);
    const totalLength = bodyStart + contentLength;

    if (buffer.length >= totalLength) {
      reader.releaseLock();
      return new TextDecoder().decode(buffer.slice(0, totalLength));
    }
  }

  reader.releaseLock();
  return new TextDecoder().decode(buffer);
}

async function readToEof(readable: ReadableStream<Uint8Array>) {
  const reader = readable.getReader();
  let buffer = new Uint8Array();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return new TextDecoder().decode(buffer);
      }
      buffer = concat(buffer, value);
    }
  } finally {
    reader.releaseLock();
  }
}

function concat(a: Uint8Array, b: Uint8Array) {
  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}

function findHeaderEnd(buffer: Uint8Array) {
  for (let i = 0; i <= buffer.length - 4; i++) {
    if (
      buffer[i] === 13 &&
      buffer[i + 1] === 10 &&
      buffer[i + 2] === 13 &&
      buffer[i + 3] === 10
    ) {
      return i;
    }
  }
  return -1;
}

function findLineEnd(buffer: Uint8Array, offset: number) {
  for (let i = offset; i <= buffer.length - 2; i++) {
    if (buffer[i] === 13 && buffer[i + 1] === 10) {
      return i;
    }
  }
  return -1;
}

function findChunkedEnd(buffer: Uint8Array, bodyStart: number) {
  let offset = bodyStart;

  while (offset < buffer.length) {
    const lineEnd = findLineEnd(buffer, offset);
    if (lineEnd === -1) {
      return -1;
    }

    const sizeLine = new TextDecoder().decode(buffer.slice(offset, lineEnd));
    const size = Number.parseInt(sizeLine, 16);
    if (Number.isNaN(size)) {
      return -1;
    }

    if (size === 0) {
      const messageEnd = lineEnd + 4;
      return buffer.length >= messageEnd ? messageEnd : -1;
    }

    offset = lineEnd + 2 + size + 2;
    if (buffer.length < offset) {
      return -1;
    }
  }

  return -1;
}

function isChunked(head: string) {
  for (const line of head.split('\r\n').slice(1)) {
    const index = line.indexOf(':');
    const name = line.slice(0, index).toLowerCase();
    const value = line
      .slice(index + 1)
      .trim()
      .toLowerCase();
    if (name === 'transfer-encoding' && value.includes('chunked')) {
      return true;
    }
  }
  return false;
}

function contentLengthFromHead(head: string) {
  for (const line of head.split('\r\n').slice(1)) {
    const index = line.indexOf(':');
    const name = line.slice(0, index).toLowerCase();
    const value = line.slice(index + 1).trim();
    if (name === 'content-length') {
      return Number(value);
    }
  }
  return 0;
}

describe('serve', () => {
  test('handler-only overload listens on the default HTTP port', async () => {
    const stack = await createStack();
    const { serve } = await createHttp(stack);

    await serve(async (request) => {
      expect(new URL(request.url).pathname).toBe('/default');
      return new Response('ok');
    });

    const connection = await stack.connectTcp({
      host: '127.0.0.1',
      port: 80,
    });

    const writer = connection.writable.getWriter();
    await writer.write(
      new TextEncoder().encode(
        'GET /default HTTP/1.1\r\nhost: example.test\r\nconnection: close\r\n\r\n'
      )
    );
    writer.releaseLock();

    const response = await readHttpResponseText(connection.readable);

    expect(response).toBe(
      'HTTP/1.1 200 OK\r\ncontent-type: text/plain;charset=UTF-8\r\nconnection: close\r\ntransfer-encoding: chunked\r\n\r\n2\r\nok\r\n0\r\n\r\n'
    );
  });

  test('responds to a raw TCP HTTP request', async () => {
    const stack = await createStack();
    const { serve } = await createHttp(stack);

    await serve({ host: '127.0.0.1', port: 8082 }, async (request) => {
      expect(request.method).toBe('GET');
      expect(new URL(request.url).pathname).toBe('/hello');
      return new Response('world', {
        headers: {
          'content-type': 'text/plain',
        },
      });
    });

    const connection = await stack.connectTcp({
      host: '127.0.0.1',
      port: 8082,
    });

    const writer = connection.writable.getWriter();
    await writer.write(
      new TextEncoder().encode(
        'GET /hello HTTP/1.1\r\nhost: 127.0.0.1:8082\r\nconnection: close\r\n\r\n'
      )
    );
    writer.releaseLock();

    const response = await readHttpResponseText(connection.readable);

    expect(response).toBe(
      'HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\nconnection: close\r\ntransfer-encoding: chunked\r\n\r\n5\r\nworld\r\n0\r\n\r\n'
    );
  });

  test('closes the TCP readable after sending a response', async () => {
    const stack = await createStack();
    const { serve } = await createHttp(stack);

    await serve({ host: '127.0.0.1', port: 8086 }, async () => {
      return new Response('closed');
    });

    const connection = await stack.connectTcp({
      host: '127.0.0.1',
      port: 8086,
    });

    const writer = connection.writable.getWriter();
    await writer.write(
      new TextEncoder().encode(
        'GET /closed HTTP/1.1\r\nhost: 127.0.0.1:8086\r\nconnection: close\r\n\r\n'
      )
    );
    writer.releaseLock();

    await expect(readToEof(connection.readable)).resolves.toBe(
      'HTTP/1.1 200 OK\r\ncontent-type: text/plain;charset=UTF-8\r\nconnection: close\r\ntransfer-encoding: chunked\r\n\r\n6\r\nclosed\r\n0\r\n\r\n'
    );
  });

  test('options-object overload accepts an inline handler', async () => {
    const stack = await createStack();
    const { serve } = await createHttp(stack);

    await serve({
      host: '127.0.0.1',
      port: 8085,
      handler: async () => new Response('inline'),
    });

    const connection = await stack.connectTcp({
      host: '127.0.0.1',
      port: 8085,
    });

    const writer = connection.writable.getWriter();
    await writer.write(
      new TextEncoder().encode(
        'GET / HTTP/1.1\r\nhost: 127.0.0.1:8085\r\nconnection: close\r\n\r\n'
      )
    );
    writer.releaseLock();

    const response = await readHttpResponseText(connection.readable);

    expect(response).toBe(
      'HTTP/1.1 200 OK\r\ncontent-type: text/plain;charset=UTF-8\r\nconnection: close\r\ntransfer-encoding: chunked\r\n\r\n6\r\ninline\r\n0\r\n\r\n'
    );
  });

  test('streams request body to handler', async () => {
    const stack = await createStack();
    const { serve } = await createHttp(stack);

    await serve({ host: '127.0.0.1', port: 8083 }, async (request) => {
      return new Response(await request.text());
    });

    const connection = await stack.connectTcp({
      host: '127.0.0.1',
      port: 8083,
    });

    const writer = connection.writable.getWriter();
    await writer.write(
      new TextEncoder().encode(
        'POST /echo HTTP/1.1\r\nhost: 127.0.0.1:8083\r\ncontent-length: 7\r\nconnection: close\r\n\r\npayload'
      )
    );
    writer.releaseLock();

    const response = await readHttpResponseText(connection.readable);

    expect(response).toBe(
      'HTTP/1.1 200 OK\r\ncontent-type: text/plain;charset=UTF-8\r\nconnection: close\r\ntransfer-encoding: chunked\r\n\r\n7\r\npayload\r\n0\r\n\r\n'
    );
  });
});
