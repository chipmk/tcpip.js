export type Pointer = number;

export type LlhttpImports = {
  parsed_http_headers(
    handle: Pointer,
    parserType: number,
    methodPtr: number,
    methodLength: number,
    urlPtr: number,
    urlLength: number,
    statusCode: number,
    statusPtr: number,
    statusLength: number,
    httpMajor: number,
    httpMinor: number,
    headersPtr: number,
    headersLength: number,
    shouldKeepAlive: number,
    upgrade: number
  ): void;
  parsed_http_body(
    handle: Pointer,
    chunkPtr: number,
    chunkLength: number
  ): void;
  completed_http_message(handle: Pointer): void;
  failed_http_parse(handle: Pointer, code: number, reasonPtr: number): void;
};

export type LlhttpExports = {
  memory: WebAssembly.Memory;
  _initialize(): unknown;
  malloc(size: number): number;
  free(ptr: number): void;
  create_http_parser(type: number): Pointer;
  execute_http_parser(
    handle: Pointer,
    chunkPtr: number,
    chunkLength: number
  ): number;
  finish_http_parser(handle: Pointer): number;
  free_http_parser(handle: Pointer): void;
};

export type LlhttpWasmInstance = {
  exports: LlhttpExports;
};
