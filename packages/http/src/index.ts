import type { NetworkStack } from 'tcpip/types';
import { createFetch } from './fetch.js';
import { serveHttp } from './serve.js';
import type {
  CreateHttpOptions,
  HttpApi,
  HttpRequestHandler,
  ServeHandlerOptions,
  ServeOptions,
} from './types.js';
import { LlhttpBindings } from './wasm/bindings.js';

export type {
  CreateHttp,
  CreateHttpOptions,
  HttpApi,
  HttpFetch,
  HttpRequestHandler,
  HttpServer,
  ServeHandlerOptions,
  ServeOptions,
} from './types.js';

const defaultServeOptions: ServeOptions = {
  port: 80,
};

function normalizeServeArgs(
  first: HttpRequestHandler | ServeOptions | ServeHandlerOptions,
  second?: HttpRequestHandler
) {
  if (typeof first === 'function') {
    return {
      options: defaultServeOptions,
      handler: first,
    };
  }

  if ('handler' in first) {
    const { handler, ...options } = first;
    return {
      options: {
        ...defaultServeOptions,
        ...options,
      },
      handler,
    };
  }

  if (!second) {
    throw new TypeError('serve options require a handler');
  }

  return {
    options: first,
    handler: second,
  };
}

export async function createHttp(
  stack: NetworkStack,
  options: CreateHttpOptions = {}
): Promise<HttpApi> {
  const parser = options.parser ?? new LlhttpBindings();
  await parser.ready?.();

  const serve = (async (
    first: HttpRequestHandler | ServeOptions | ServeHandlerOptions,
    second?: HttpRequestHandler
  ) => {
    const { options: serveOptions, handler } = normalizeServeArgs(
      first,
      second
    );
    return serveHttp(stack, parser, serveOptions, handler);
  }) satisfies HttpApi['serve'];

  return {
    fetch: createFetch(stack, parser),
    serve,
  };
}
