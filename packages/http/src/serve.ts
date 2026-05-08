import type { NetworkStack, TcpConnection } from 'tcpip/types';
import { HttpParser } from './parser.js';
import { serializeHttpResponse } from './serialize.js';
import type {
  HttpParserRuntime,
  HttpRequestHandler,
  HttpServer,
  ServeOptions,
} from './types.js';

function requestUrl(path: string, headers: Headers) {
  const host = headers.get('host') ?? 'localhost';
  return `http://${host}${path}`;
}

const supportsStreamingRequestBodies = detectStreamingRequestBodies();

function detectStreamingRequestBodies() {
  try {
    const body = new ReadableStream<Uint8Array>();
    const request = new Request('http://localhost/', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    return request.body === body;
  } catch {
    return false;
  }
}

async function handleConnection(
  connection: TcpConnection,
  parserRuntime: HttpParserRuntime,
  handler: HttpRequestHandler
) {
  const parser = new HttpParser(parserRuntime, 'request');
  const messagePromise = parser.nextMessage();
  const reader = connection.readable.getReader();

  const readPromise = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        parser.write(value);
        if (parser.closed) {
          break;
        }
      }
      if (!parser.closed) {
        parser.finish();
      }
    } catch (error) {
      if (
        !(error instanceof Error && error.message === 'tcp connection closed')
      ) {
        throw error;
      }
      parser.finish();
    }
  })().finally(() => {
    reader.releaseLock();
  });
  readPromise.catch((error) => {
    console.error('error reading http request:', error);
  });

  const message = await messagePromise;

  if (message.type !== 'request') {
    throw new Error('expected http request');
  }

  const requestInit: RequestInit & { duplex?: 'half' } = {
    method: message.method,
    headers: message.headers,
  };

  if (message.method !== 'GET' && message.method !== 'HEAD') {
    if (supportsStreamingRequestBodies) {
      requestInit.body = message.body;
      requestInit.duplex = 'half';
    } else {
      requestInit.body = await new Response(message.body).arrayBuffer();
    }
  }

  const request = new Request(
    requestUrl(message.url, message.headers),
    requestInit
  );

  const response = await handler(request);
  await serializeHttpResponse(response).pipeTo(connection.writable, {
    preventClose: true,
  });

  const writer = connection.writable.getWriter();
  try {
    await writer.close();
  } finally {
    writer.releaseLock();
  }
}

export async function serveHttp(
  stack: NetworkStack,
  parserRuntime: HttpParserRuntime,
  options: ServeOptions,
  handler: HttpRequestHandler
): Promise<HttpServer> {
  const listener = await stack.listenTcp(options);
  let closed = false;

  const loop = (async () => {
    for await (const connection of listener) {
      if (closed) {
        await connection.close();
        continue;
      }

      handleConnection(connection, parserRuntime, handler).catch((error) => {
        console.error('error handling http connection:', error);
      });
    }
  })();

  loop.catch((error) => {
    if (!closed) {
      console.error('error in http server loop:', error);
    }
  });

  return {
    async close() {
      closed = true;
    },
  };
}
