import { describe, expect, test } from 'vitest';
import { HttpParser } from './parser.js';
import type {
  HttpHeadersEvent,
  HttpParserCallbacks,
  HttpParserRuntime,
  HttpParserType,
} from './types.js';

class TrackingRuntime implements HttpParserRuntime {
  callbacks = new Map<number, HttpParserCallbacks>();
  freed: number[] = [];
  nextHandle = 1;

  createParser(_type: HttpParserType, callbacks: HttpParserCallbacks) {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callbacks);
    return handle;
  }

  executeParser(_handle: number, _chunk: Uint8Array) {}

  finishParser(_handle: number) {}

  freeParser(handle: number) {
    this.freed.push(handle);
    this.callbacks.delete(handle);
  }
}

const responseHeaders = {
  parserType: 'response',
  statusCode: 200,
  statusText: 'OK',
  httpMajor: 1,
  httpMinor: 1,
  headers: [],
  shouldKeepAlive: false,
  upgrade: false,
} satisfies HttpHeadersEvent;

describe('HttpParser', () => {
  test('frees its runtime parser handle when a message completes', async () => {
    const runtime = new TrackingRuntime();
    const parser = new HttpParser(runtime, 'response');
    const messagePromise = parser.nextMessage();
    const callbacks = runtime.callbacks.get(parser.handle)!;

    callbacks.headers(responseHeaders);
    callbacks.body(new TextEncoder().encode('ok'));
    callbacks.complete();

    const message = await messagePromise;
    await expect(message.body.getReader().read()).resolves.toMatchObject({
      done: false,
      value: new TextEncoder().encode('ok'),
    });
    await Promise.resolve();
    expect(runtime.freed).toEqual([parser.handle]);
    expect(runtime.callbacks.has(parser.handle)).toBe(false);

    parser.close();
    expect(runtime.freed).toEqual([parser.handle]);
  });

  test('frees its runtime parser handle when parsing errors', async () => {
    const runtime = new TrackingRuntime();
    const parser = new HttpParser(runtime, 'response');
    const messagePromise = parser.nextMessage();
    const callbacks = runtime.callbacks.get(parser.handle)!;

    callbacks.error(new Error('boom'));

    await expect(messagePromise).rejects.toThrow('boom');
    await Promise.resolve();
    expect(runtime.freed).toEqual([parser.handle]);
    expect(runtime.callbacks.has(parser.handle)).toBe(false);
  });

  test('rejects request header events missing method or url', async () => {
    const runtime = new TrackingRuntime();
    const parser = new HttpParser(runtime, 'request');
    const messagePromise = parser.nextMessage();
    const callbacks = runtime.callbacks.get(parser.handle)!;

    callbacks.headers({
      parserType: 'request',
      httpMajor: 1,
      httpMinor: 1,
      headers: [],
      shouldKeepAlive: false,
      upgrade: false,
    });

    await expect(messagePromise).rejects.toThrow(
      'http request is missing method'
    );
  });

  test('rejects response header events missing status code', async () => {
    const runtime = new TrackingRuntime();
    const parser = new HttpParser(runtime, 'response');
    const messagePromise = parser.nextMessage();
    const callbacks = runtime.callbacks.get(parser.handle)!;

    callbacks.headers({
      parserType: 'response',
      statusText: '',
      httpMajor: 1,
      httpMinor: 1,
      headers: [],
      shouldKeepAlive: false,
      upgrade: false,
    });

    await expect(messagePromise).rejects.toThrow(
      'http response is missing status code'
    );
  });
});
