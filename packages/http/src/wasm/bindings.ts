import { ConsoleStdout, File, OpenFile, WASI } from '@bjorn3/browser_wasi_shim';
import type {
  HttpHeadersEvent,
  HttpParserCallbacks,
  HttpParserRuntime,
  HttpParserType,
} from '../types.js';
import { fetchFile } from './fetch-file.js';
import type { LlhttpExports, LlhttpImports, Pointer } from './types.js';

const HTTP_REQUEST = 0;
const HTTP_RESPONSE = 1;

const decoder = new TextDecoder();

export class LlhttpBindings implements HttpParserRuntime {
  #exports?: LlhttpExports;
  #parsers = new Map<Pointer, HttpParserCallbacks>();

  imports: LlhttpImports = {
    parsed_http_headers: (
      handle,
      parserType,
      methodPtr,
      methodLength,
      urlPtr,
      urlLength,
      statusCode,
      statusPtr,
      statusLength,
      httpMajor,
      httpMinor,
      headersPtr,
      headersLength,
      shouldKeepAlive,
      upgrade
    ) => {
      const callbacks = this.#getCallbacks(handle);
      callbacks.headers({
        parserType: parserType === HTTP_REQUEST ? 'request' : 'response',
        method: this.#readString(methodPtr, methodLength) || undefined,
        url: this.#readString(urlPtr, urlLength) || undefined,
        statusCode: parserType === HTTP_RESPONSE ? statusCode : undefined,
        statusText: this.#readString(statusPtr, statusLength) || undefined,
        httpMajor,
        httpMinor,
        headers: this.#readHeaders(headersPtr, headersLength),
        shouldKeepAlive: shouldKeepAlive === 1,
        upgrade: upgrade === 1,
      } satisfies HttpHeadersEvent);
    },
    parsed_http_body: (handle, chunkPtr, chunkLength) => {
      const callbacks = this.#getCallbacks(handle);
      callbacks.body(this.copyFromMemory(chunkPtr, chunkLength));
    },
    completed_http_message: (handle) => {
      this.#getCallbacks(handle).complete();
    },
    failed_http_parse: (handle, code, reasonPtr) => {
      this.#getCallbacks(handle).error(
        new Error(
          `http parse failed with code ${code}: ${this.#readCString(reasonPtr)}`
        )
      );
    },
  };

  get exports() {
    if (!this.#exports) {
      throw new Error('llhttp exports were not registered');
    }
    return this.#exports;
  }

  async ready() {
    const wasi = new WASI(
      [],
      [],
      [
        new OpenFile(new File([])),
        ConsoleStdout.lineBuffered((msg) =>
          console.log(`[WASI stdout] ${msg}`)
        ),
        ConsoleStdout.lineBuffered((msg) =>
          console.warn(`[WASI stderr] ${msg}`)
        ),
      ]
    );
    const { instance } = await WebAssembly.instantiateStreaming(
      this.#source(),
      {
        wasi_snapshot_preview1: wasi.wasiImport,
        env: this.imports,
      }
    );
    this.#exports = (instance as unknown as { exports: LlhttpExports }).exports;
    wasi.initialize(instance as unknown as { exports: LlhttpExports });
  }

  async #source() {
    // Source tests run from src/wasm; published builds run from dist. Try both
    // relative paths back to the package-root wasm asset.
    const urls = [
      new URL('../../http_parser.wasm', import.meta.url),
      new URL('../http_parser.wasm', import.meta.url),
    ];

    let lastError: unknown;
    for (const url of urls) {
      try {
        const response = await fetchFile(url, 'application/wasm');
        if (response.ok) {
          return response;
        }
        lastError = new Error(`failed to fetch ${url}: ${response.status}`);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  createParser(type: HttpParserType, callbacks: HttpParserCallbacks) {
    const handle = this.exports.create_http_parser(
      type === 'request' ? HTTP_REQUEST : HTTP_RESPONSE
    );
    this.#parsers.set(handle, callbacks);
    return handle;
  }

  executeParser(handle: number, chunk: Uint8Array) {
    const chunkPtr = this.copyToMemory(chunk);
    try {
      const result = this.exports.execute_http_parser(
        handle,
        chunkPtr,
        chunk.length
      );
      if (result !== 0) {
        throw new Error(`http parse failed with code ${result}`);
      }
    } finally {
      this.exports.free(chunkPtr);
    }
  }

  finishParser(handle: number) {
    const result = this.exports.finish_http_parser(handle);
    if (result !== 0) {
      throw new Error(`http parser finish failed with code ${result}`);
    }
  }

  freeParser(handle: number) {
    this.exports.free_http_parser(handle);
    this.#parsers.delete(handle);
  }

  copyToMemory(data: Uint8Array) {
    const ptr = this.exports.malloc(data.length);
    this.viewFromMemory(ptr, data.length).set(data);
    return ptr;
  }

  copyFromMemory(ptr: number, length: number) {
    const buffer = this.exports.memory.buffer.slice(ptr, ptr + length);
    return new Uint8Array(buffer);
  }

  viewFromMemory(ptr: number, length: number) {
    return new Uint8Array(this.exports.memory.buffer, ptr, length);
  }

  #getCallbacks(handle: Pointer) {
    const callbacks = this.#parsers.get(handle);
    if (!callbacks) {
      throw new Error(`unknown http parser handle: ${handle}`);
    }
    return callbacks;
  }

  #readString(ptr: number, length: number) {
    if (ptr === 0 || length === 0) {
      return '';
    }
    return decoder.decode(this.copyFromMemory(ptr, length));
  }

  #readCString(ptr: number) {
    if (ptr === 0) {
      return '';
    }

    const memory = new Uint8Array(this.exports.memory.buffer);
    let end = ptr;
    while (memory[end] !== 0) {
      end++;
    }
    return decoder.decode(memory.slice(ptr, end));
  }

  #readHeaders(ptr: number, length: number) {
    const text = this.#readString(ptr, length);
    if (!text) {
      return [];
    }

    return text
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf(':');
        return [line.slice(0, index), line.slice(index + 1)] satisfies [
          string,
          string,
        ];
      });
  }
}
