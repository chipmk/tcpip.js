import { describe, expect, test } from 'vitest';
import { serializeHttpRequest, serializeHttpResponse } from './serialize.js';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function requestHasReadableBody(request: Request) {
  return request.body instanceof ReadableStream;
}

function streamFromText(text: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

async function readAll(readable: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  const reader = readable.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }

  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return decoder.decode(result);
}

describe('serializeHttpRequest', () => {
  test('serializes a GET request with host and connection close', async () => {
    const request = new Request('http://example.com/path?q=1');

    await expect(readAll(serializeHttpRequest(request))).resolves.toBe(
      'GET /path?q=1 HTTP/1.1\r\nhost: example.com\r\nconnection: close\r\n\r\n'
    );
  });

  test('serializes root targets with non-default and IPv6 hosts', async () => {
    const withPort = new Request('http://example.com:8080/');
    const ipv6 = new Request('http://[2001:db8::1]:8080/');

    await expect(readAll(serializeHttpRequest(withPort))).resolves.toBe(
      'GET / HTTP/1.1\r\nhost: example.com:8080\r\nconnection: close\r\n\r\n'
    );
    await expect(readAll(serializeHttpRequest(ipv6))).resolves.toBe(
      'GET / HTTP/1.1\r\nhost: [2001:db8::1]:8080\r\nconnection: close\r\n\r\n'
    );
  });

  test('preserves encoded path and query bytes in request target', async () => {
    const request = new Request('http://example.com/a%20b?q=x%20y');

    await expect(readAll(serializeHttpRequest(request))).resolves.toBe(
      'GET /a%20b?q=x%20y HTTP/1.1\r\nhost: example.com\r\nconnection: close\r\n\r\n'
    );
  });

  test('serializes a POST request with content length when body size is known', async () => {
    const body = 'name=tcpip';
    const request = new Request('http://example.com/form', {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
    });

    await expect(
      readAll(
        serializeHttpRequest(request, {
          stream: request.body ?? streamFromText(body),
          length: encoder.encode(body).length,
        })
      )
    ).resolves.toBe(
      'POST /form HTTP/1.1\r\ncontent-type: application/x-www-form-urlencoded\r\nhost: example.com\r\nconnection: close\r\ncontent-length: 10\r\n\r\nname=tcpip'
    );
  });

  test('serializes URLSearchParams bodies with content length', async () => {
    const body = new URLSearchParams([
      ['name', 'tcpip'],
      ['mode', 'virtual network'],
    ]);
    const text = body.toString();
    const request = new Request('http://example.com/form', {
      method: 'POST',
      body,
    });

    await expect(
      readAll(
        serializeHttpRequest(request, {
          stream: request.body ?? streamFromText(text),
          length: encoder.encode(text).length,
        })
      )
    ).resolves.toBe(
      'POST /form HTTP/1.1\r\ncontent-type: application/x-www-form-urlencoded;charset=UTF-8\r\nhost: example.com\r\nconnection: close\r\ncontent-length: 31\r\n\r\nname=tcpip&mode=virtual+network'
    );
  });

  test('does not chunk known-size request bodies', async () => {
    const request = new Request('http://example.com/upload', {
      method: 'POST',
      body: 'abc',
      headers: {
        'content-length': '3',
      },
    });

    const serialized = await readAll(
      serializeHttpRequest(request, {
        stream: request.body ?? streamFromText('abc'),
        length: 3,
      })
    );

    expect(serialized).toMatch(
      /^POST \/upload HTTP\/1\.1\r\n[\s\S]*\r\n\r\nabc$/
    );
    expect(serialized.match(/^content-length: 3$/gm)).toHaveLength(1);
    expect(serialized).not.toContain('transfer-encoding: chunked');
  });

  test('serializes FormData bodies with multipart boundaries', async () => {
    const form = new FormData();
    form.set('name', 'tcpip');
    form.set('file', new Blob(['hello']), 'hello.txt');

    const request = new Request('http://example.com/upload', {
      method: 'POST',
      body: form,
    });

    const serialized = await readAll(serializeHttpRequest(request));

    expect(serialized).toMatch(
      /^POST \/upload HTTP\/1\.1\r\ncontent-type: multipart\/form-data; boundary=[^\r\n]+\r\nhost: example\.com\r\nconnection: close/
    );
    if (!requestHasReadableBody(request)) {
      return;
    }
    expect(serialized).toContain('transfer-encoding: chunked\r\n\r\n');
    expect(serialized).toContain('Content-Disposition: form-data; name="name"');
    expect(serialized).toContain('tcpip');
    expect(serialized).toContain(
      'Content-Disposition: form-data; name="file"; filename="hello.txt"'
    );
    expect(serialized).toContain('Content-Type: application/octet-stream');
    expect(serialized).toContain('hello');
    expect(serialized.endsWith('\r\n0\r\n\r\n')).toBe(true);
  });

  test('streams request headers before reading the body', async () => {
    let bodyController: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        bodyController = controller;
      },
    });
    const request = new Request('http://example.com/upload', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    if (!requestHasReadableBody(request)) {
      return;
    }

    const reader = serializeHttpRequest(request).getReader();
    const first = await Promise.race([
      reader.read(),
      new Promise<'timeout'>((resolve) => setTimeout(resolve, 10, 'timeout')),
    ]);

    expect(first).not.toBe('timeout');
    expect(
      decoder.decode((first as ReadableStreamReadResult<Uint8Array>).value)
    ).toBe(
      'POST /upload HTTP/1.1\r\nhost: example.com\r\nconnection: close\r\ntransfer-encoding: chunked\r\n\r\n'
    );

    bodyController!.enqueue(encoder.encode('abc'));
    await expect(reader.read()).resolves.toMatchObject({
      done: false,
      value: encoder.encode('3\r\nabc\r\n'),
    });

    bodyController!.close();
    await expect(reader.read()).resolves.toMatchObject({
      done: false,
      value: encoder.encode('0\r\n\r\n'),
    });
    await expect(reader.read()).resolves.toStrictEqual({
      done: true,
      value: undefined,
    });
  });

  test('serializes multiple request body chunks', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('hello'));
        controller.enqueue(encoder.encode(' world'));
        controller.enqueue(new Uint8Array());
        controller.close();
      },
    });
    const request = new Request('http://example.com/upload', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    if (!requestHasReadableBody(request)) {
      return;
    }

    await expect(readAll(serializeHttpRequest(request))).resolves.toBe(
      'POST /upload HTTP/1.1\r\nhost: example.com\r\nconnection: close\r\ntransfer-encoding: chunked\r\n\r\n5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n'
    );
  });
});

describe('serializeHttpResponse', () => {
  test('serializes a text response with chunked transfer encoding', async () => {
    const response = new Response('hello', {
      status: 201,
      statusText: 'Created',
      headers: {
        'x-test': 'yes',
      },
    });

    await expect(readAll(serializeHttpResponse(response))).resolves.toBe(
      'HTTP/1.1 201 Created\r\ncontent-type: text/plain;charset=UTF-8\r\nx-test: yes\r\nconnection: close\r\ntransfer-encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\n\r\n'
    );
  });

  test('streams response headers before reading the body', async () => {
    let bodyController: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        bodyController = controller;
      },
    });
    const response = new Response(body);

    const reader = serializeHttpResponse(response).getReader();
    const first = await Promise.race([
      reader.read(),
      new Promise<'timeout'>((resolve) => setTimeout(resolve, 10, 'timeout')),
    ]);

    expect(first).not.toBe('timeout');
    expect(
      decoder.decode((first as ReadableStreamReadResult<Uint8Array>).value)
    ).toBe(
      'HTTP/1.1 200 OK\r\nconnection: close\r\ntransfer-encoding: chunked\r\n\r\n'
    );

    bodyController!.enqueue(encoder.encode('hello'));
    await expect(reader.read()).resolves.toMatchObject({
      done: false,
      value: encoder.encode('5\r\nhello\r\n'),
    });

    bodyController!.close();
    await expect(reader.read()).resolves.toMatchObject({
      done: false,
      value: encoder.encode('0\r\n\r\n'),
    });
    await expect(reader.read()).resolves.toStrictEqual({
      done: true,
      value: undefined,
    });
  });

  test('omits body for 204 responses', async () => {
    const response = new Response(null, { status: 204 });

    await expect(readAll(serializeHttpResponse(response))).resolves.toBe(
      'HTTP/1.1 204 No Content\r\nconnection: close\r\n\r\n'
    );
  });

  test('omits body for 205 and 304 responses', async () => {
    const reset = new Response(null, { status: 205 });
    const notModified = new Response(null, { status: 304 });

    await expect(readAll(serializeHttpResponse(reset))).resolves.toBe(
      'HTTP/1.1 205 Reset Content\r\nconnection: close\r\n\r\n'
    );
    await expect(readAll(serializeHttpResponse(notModified))).resolves.toBe(
      'HTTP/1.1 304 Not Modified\r\nconnection: close\r\n\r\n'
    );
  });

  test('uses standard status text fallbacks', async () => {
    await expect(
      readAll(serializeHttpResponse(new Response(null, { status: 404 })))
    ).resolves.toBe('HTTP/1.1 404 Not Found\r\nconnection: close\r\n\r\n');
  });

  test('uses unknown for unrecognized status text fallback', async () => {
    await expect(
      readAll(serializeHttpResponse(new Response(null, { status: 599 })))
    ).resolves.toBe('HTTP/1.1 599 unknown\r\nconnection: close\r\n\r\n');
  });

  test('serializes multiple response body chunks', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('hello'));
        controller.enqueue(encoder.encode(' world'));
        controller.enqueue(new Uint8Array());
        controller.close();
      },
    });

    await expect(
      readAll(serializeHttpResponse(new Response(body)))
    ).resolves.toBe(
      'HTTP/1.1 200 OK\r\nconnection: close\r\ntransfer-encoding: chunked\r\n\r\n5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n'
    );
  });
});
