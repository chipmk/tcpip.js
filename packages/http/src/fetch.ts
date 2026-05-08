import type { NetworkStack } from 'tcpip/types';
import { unsupportedProtocol } from './errors.js';
import { HttpParser } from './parser.js';
import {
  type SerializableHttpBody,
  serializeHttpRequest,
  statusAllowsBody,
} from './serialize.js';
import type { HttpFetch, HttpParserRuntime } from './types.js';

function bytesToStream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function knownBytesToBody(bytes: Uint8Array): SerializableHttpBody {
  return {
    stream: bytesToStream(bytes),
    length: bytes.length,
  };
}

function bodyToSerializableBody(
  body: BodyInit | null | undefined
): SerializableHttpBody {
  if (body === undefined || body === null) {
    return null;
  }

  if (body instanceof ReadableStream) {
    return body as ReadableStream<Uint8Array>;
  }

  if (typeof body === 'string') {
    return knownBytesToBody(new TextEncoder().encode(body));
  }

  if (body instanceof URLSearchParams) {
    return knownBytesToBody(new TextEncoder().encode(body.toString()));
  }

  if (body instanceof Blob) {
    return {
      stream: body.stream() as ReadableStream<Uint8Array>,
      length: body.size,
    };
  }

  if (body instanceof ArrayBuffer) {
    return knownBytesToBody(new Uint8Array(body));
  }

  if (ArrayBuffer.isView(body)) {
    return knownBytesToBody(
      new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
    );
  }

  return null;
}

function closeConnectionWithBody(
  body: ReadableStream<Uint8Array>,
  close: () => Promise<void>
) {
  const reader = body.getReader();
  const closeConnection = () => {
    close().catch((error) => {
      console.error('error closing http connection:', error);
    });
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        reader.releaseLock();
        controller.close();
        closeConnection();
        return;
      }

      controller.enqueue(value);
    },
    async cancel() {
      reader.releaseLock();
      closeConnection();
    },
  });
}

function canHaveResponseBody(request: Request, status: number) {
  return request.method !== 'HEAD' && statusAllowsBody(status);
}

async function feedParser(
  readable: ReadableStream<Uint8Array>,
  parser: HttpParser
) {
  const reader = readable.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        parser.finish();
        break;
      }
      parser.write(value);
    }
  } catch (error) {
    if (
      !(error instanceof Error && error.message === 'tcp connection closed')
    ) {
      throw error;
    }
    parser.finish();
  } finally {
    reader.releaseLock();
  }
}

export function createFetch(
  stack: NetworkStack,
  parserRuntime: HttpParserRuntime
): HttpFetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const body =
      init?.body !== undefined
        ? bodyToSerializableBody(init.body)
        : request.body;
    const url = new URL(request.url);

    if (url.protocol !== 'http:') {
      throw unsupportedProtocol(url.protocol);
    }

    const connection = await stack.connectTcp({
      host: url.hostname,
      port: Number(url.port || 80),
    });

    const parser = new HttpParser(parserRuntime, 'response');
    const responsePromise = parser.nextMessage();

    const requestWrite = serializeHttpRequest(request, body).pipeTo(
      connection.writable,
      { preventClose: true }
    );
    const responseRead = feedParser(connection.readable, parser);

    await requestWrite;

    const message = await responsePromise;

    if (message.type !== 'response') {
      throw new Error('expected http response');
    }

    responseRead.catch((error) => {
      console.error('error reading http response:', error);
    });

    if (!canHaveResponseBody(request, message.statusCode)) {
      connection.close().catch((error) => {
        console.error('error closing http connection:', error);
      });
      return new Response(null, {
        status: message.statusCode,
        statusText: message.statusText,
        headers: message.headers,
      });
    }

    return new Response(
      closeConnectionWithBody(message.body, () => connection.close()),
      {
        status: message.statusCode,
        statusText: message.statusText,
        headers: message.headers,
      }
    );
  };
}
