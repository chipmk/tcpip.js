import type {
  HttpHeadersEvent,
  HttpParserRuntime,
  HttpParserType,
  ParsedHttpMessage,
} from './types.js';

type PendingMessage = {
  resolve(message: ParsedHttpMessage): void;
  reject(error: Error): void;
};

export class HttpParser {
  readonly handle: number;

  #runtime: HttpParserRuntime;
  #messages: ParsedHttpMessage[] = [];
  #pendingMessages: PendingMessage[] = [];
  #currentBodyController?: ReadableStreamDefaultController<Uint8Array>;
  #freed = false;
  #closed = false;

  get closed() {
    return this.#closed;
  }

  constructor(runtime: HttpParserRuntime, type: HttpParserType) {
    this.#runtime = runtime;
    this.handle = runtime.createParser(type, {
      headers: (event) => this.#onHeaders(event),
      body: (chunk) => this.#onBody(chunk),
      complete: () => this.#onComplete(),
      error: (error) => this.#onError(error),
    });
  }

  write(chunk: Uint8Array) {
    if (this.#closed) {
      throw new Error('http parser is closed');
    }

    this.#runtime.executeParser(this.handle, chunk);
  }

  finish() {
    if (!this.#closed) {
      this.#runtime.finishParser(this.handle);
    }
  }

  close() {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.#free();
  }

  #free() {
    if (this.#freed) {
      return;
    }

    this.#freed = true;
    this.#runtime.freeParser(this.handle);
  }

  #freeSoon() {
    this.#closed = true;
    queueMicrotask(() => this.#free());
  }

  nextMessage() {
    const message = this.#messages.shift();
    if (message) {
      return Promise.resolve(message);
    }

    return new Promise<ParsedHttpMessage>((resolve, reject) => {
      this.#pendingMessages.push({ resolve, reject });
    });
  }

  #onHeaders(event: HttpHeadersEvent) {
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.#currentBodyController = controller;
      },
    });

    const headers = new Headers(event.headers);

    let message: ParsedHttpMessage;
    if (event.parserType === 'request') {
      if (!event.method) {
        this.#onError(new Error('http request is missing method'));
        return;
      }
      if (!event.url) {
        this.#onError(new Error('http request is missing url'));
        return;
      }

      message = {
        type: 'request',
        method: event.method,
        url: event.url,
        httpMajor: event.httpMajor,
        httpMinor: event.httpMinor,
        headers,
        body,
        shouldKeepAlive: event.shouldKeepAlive,
        upgrade: event.upgrade,
      };
    } else {
      if (event.statusCode === undefined) {
        this.#onError(new Error('http response is missing status code'));
        return;
      }

      message = {
        type: 'response',
        statusCode: event.statusCode,
        statusText: event.statusText ?? '',
        httpMajor: event.httpMajor,
        httpMinor: event.httpMinor,
        headers,
        body,
        shouldKeepAlive: event.shouldKeepAlive,
        upgrade: event.upgrade,
      };
    }

    const pending = this.#pendingMessages.shift();
    if (pending) {
      pending.resolve(message);
    } else {
      this.#messages.push(message);
    }
  }

  #onBody(chunk: Uint8Array) {
    this.#currentBodyController?.enqueue(chunk);
  }

  #onComplete() {
    this.#currentBodyController?.close();
    this.#currentBodyController = undefined;
    this.#freeSoon();
  }

  #onError(error: Error) {
    this.#currentBodyController?.error(error);
    this.#currentBodyController = undefined;

    for (const pending of this.#pendingMessages) {
      pending.reject(error);
    }

    this.#pendingMessages = [];
    this.#freeSoon();
  }
}
