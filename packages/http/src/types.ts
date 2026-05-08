import type { NetworkStack } from 'tcpip/types';

export type HttpFetch = typeof globalThis.fetch;

export type ServeOptions = {
  /**
   * The local host to bind to.
   *
   * If not provided, the server binds to all available interfaces.
   */
  host?: string;
  port: number;
};

export type ServeHandlerOptions = Partial<ServeOptions> & {
  handler: HttpRequestHandler;
};

export type HttpServer = {
  close(): Promise<void>;
};

export type HttpRequestHandler = (
  request: Request
) => Response | Promise<Response>;

export type CreateHttpOptions = {
  /**
   * Parser runtime override used by tests.
   */
  parser?: HttpParserRuntime;
};

export type HttpApi = {
  fetch: HttpFetch;
  serve(handler: HttpRequestHandler): Promise<HttpServer>;
  serve(
    options: ServeOptions,
    handler: HttpRequestHandler
  ): Promise<HttpServer>;
  serve(options: ServeHandlerOptions): Promise<HttpServer>;
};

export type CreateHttp = (
  stack: NetworkStack,
  options?: CreateHttpOptions
) => Promise<HttpApi>;

export type HttpParserType = 'request' | 'response';

export type HttpHeadersEvent = {
  parserType: HttpParserType;
  method?: string;
  url?: string;
  statusCode?: number;
  statusText?: string;
  httpMajor: number;
  httpMinor: number;
  headers: [string, string][];
  shouldKeepAlive: boolean;
  upgrade: boolean;
};

export type ParsedHttpRequest = {
  type: 'request';
  method: string;
  url: string;
  httpMajor: number;
  httpMinor: number;
  headers: Headers;
  body: ReadableStream<Uint8Array>;
  shouldKeepAlive: boolean;
  upgrade: boolean;
};

export type ParsedHttpResponse = {
  type: 'response';
  statusCode: number;
  statusText: string;
  httpMajor: number;
  httpMinor: number;
  headers: Headers;
  body: ReadableStream<Uint8Array>;
  shouldKeepAlive: boolean;
  upgrade: boolean;
};

export type ParsedHttpMessage = ParsedHttpRequest | ParsedHttpResponse;

export type HttpParserRuntime = {
  ready?: () => Promise<void>;
  createParser(type: HttpParserType, parser: HttpParserCallbacks): number;
  executeParser(handle: number, chunk: Uint8Array): void;
  finishParser(handle: number): void;
  freeParser(handle: number): void;
};

export type HttpParserCallbacks = {
  headers(event: HttpHeadersEvent): void;
  body(chunk: Uint8Array): void;
  complete(): void;
  error(error: Error): void;
};
