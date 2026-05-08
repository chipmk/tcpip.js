import { createStack } from 'tcpip';
import type { NetworkStack, TcpConnection } from 'tcpip/types';
import { describe, expect, test } from 'vitest';
import { createHttp } from './index.js';

async function nextValue<T>(iterator: AsyncIterable<T>) {
  const { value } = await iterator[Symbol.asyncIterator]().next();
  return value!;
}

async function readUntil(connection: TcpConnection, expected: string) {
  const decoder = new TextDecoder();
  const reader = connection.readable.getReader();
  let text = '';

  try {
    while (!text.includes(expected)) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  return text;
}

function trackConnectionClose(
  stack: NetworkStack,
  connection: TcpConnection
): NetworkStack {
  let closeCount = 0;
  const trackedConnection = {
    ...connection,
    async close() {
      closeCount++;
      await connection.close();
    },
    [Symbol.asyncIterator]: () => connection[Symbol.asyncIterator](),
  } satisfies TcpConnection;

  return {
    ...stack,
    connectTcp: async () => trackedConnection,
    get closeCount() {
      return closeCount;
    },
  } as NetworkStack & { readonly closeCount: number };
}

describe('fetch', () => {
  test('fetches from an HTTP server on loopback', async () => {
    const stack = await createStack();
    const listener = await stack.listenTcp({
      host: '127.0.0.1',
      port: 8081,
    });

    const serverDone = (async () => {
      const connection = await nextValue(listener);
      const reader = connection.readable.getReader();
      await reader.read();
      reader.releaseLock();
      const writer = connection.writable.getWriter();
      await writer.write(
        new TextEncoder().encode(
          'HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\ncontent-length: 5\r\nconnection: close\r\n\r\nhello'
        )
      );
      writer.releaseLock();
      return connection;
    })();

    const { fetch } = await createHttp(stack);
    const response = await fetch('http://127.0.0.1:8081/test');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
    await expect(response.text()).resolves.toBe('hello');

    const serverConnection = await serverDone;
    await serverConnection.close();
  });

  test('sends content length for known init bodies', async () => {
    const stack = await createStack();
    const listener = await stack.listenTcp({
      host: '127.0.0.1',
      port: 8087,
    });

    const serverDone = (async () => {
      const connection = await nextValue(listener);
      const request = await readUntil(connection, '\r\n\r\nname=tcpip');
      const writer = connection.writable.getWriter();
      await writer.write(
        new TextEncoder().encode(
          'HTTP/1.1 204 No Content\r\ncontent-length: 0\r\nconnection: close\r\n\r\n'
        )
      );
      writer.releaseLock();
      return { connection, request };
    })();

    const { fetch } = await createHttp(stack);
    const response = await fetch('http://127.0.0.1:8087/form', {
      method: 'POST',
      body: 'name=tcpip',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
    });

    expect(response.status).toBe(204);

    const { connection, request } = await serverDone;
    expect(request).toContain('content-length: 10\r\n');
    expect(request).not.toContain('transfer-encoding: chunked');
    expect(request.endsWith('\r\n\r\nname=tcpip')).toBe(true);
    await connection.close();
  });

  test('closes the TCP connection after the response body is consumed', async () => {
    const stack = await createStack();
    const listener = await stack.listenTcp({
      host: '127.0.0.1',
      port: 8086,
    });
    const serverConnectionPromise = nextValue(listener);

    const rawConnection = await stack.connectTcp({
      host: '127.0.0.1',
      port: 8086,
    });
    const trackedStack = trackConnectionClose(
      stack,
      rawConnection
    ) as NetworkStack & {
      readonly closeCount: number;
    };

    const serverDone = (async () => {
      const connection = await serverConnectionPromise;
      const reader = connection.readable.getReader();
      await reader.read();
      reader.releaseLock();
      const writer = connection.writable.getWriter();
      await writer.write(
        new TextEncoder().encode(
          'HTTP/1.1 200 OK\r\ncontent-length: 5\r\nconnection: close\r\n\r\nhello'
        )
      );
      writer.releaseLock();
      return connection;
    })();

    const { fetch } = await createHttp(trackedStack);
    const response = await fetch('http://127.0.0.1:8086/test');

    expect(trackedStack.closeCount).toBe(0);
    await expect(response.text()).resolves.toBe('hello');
    expect(trackedStack.closeCount).toBe(1);

    const serverConnection = await serverDone;
    await serverConnection.close();
  });

  test('rejects https URLs until TLS exists', async () => {
    const stack = await createStack();
    const { fetch } = await createHttp(stack);

    await expect(fetch('https://example.com/')).rejects.toThrow(
      'unsupported protocol: https:'
    );
  });

  test('fetch can call serve on the same stack', async () => {
    const stack = await createStack();
    const { fetch, serve } = await createHttp(stack);

    await serve({ host: '127.0.0.1', port: 8084 }, async (request) => {
      return Response.json({
        method: request.method,
        path: new URL(request.url).pathname,
        body: await request.text(),
      });
    });

    const response = await fetch('http://127.0.0.1:8084/items', {
      method: 'POST',
      body: 'abc',
    });

    await expect(response.json()).resolves.toStrictEqual({
      method: 'POST',
      path: '/items',
      body: 'abc',
    });
  });
});
