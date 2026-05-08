import { describe, expect, test } from 'vitest';
import { HttpParser } from '../parser.js';
import { LlhttpBindings } from './bindings.js';

const encoder = new TextEncoder();

async function readText(readable: ReadableStream<Uint8Array>) {
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

  return new TextDecoder().decode(result);
}

describe('LlhttpBindings', () => {
  test('parses a response with streamed body bytes', async () => {
    const runtime = new LlhttpBindings();
    await runtime.ready();

    const parser = new HttpParser(runtime, 'response');
    const messagePromise = parser.nextMessage();

    parser.write(
      encoder.encode(
        'HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\ncontent-length: 5\r\nconnection: close\r\n\r\nhello'
      )
    );

    const message = await messagePromise;
    if (message.type !== 'response') {
      throw new Error('expected response');
    }
    expect(message.statusCode).toBe(200);
    expect(message.headers.get('content-type')).toBe('text/plain');
    await expect(readText(message.body)).resolves.toBe('hello');

    parser.close();
  });

  test('parses a request with streamed body bytes', async () => {
    const runtime = new LlhttpBindings();
    await runtime.ready();

    const parser = new HttpParser(runtime, 'request');
    const messagePromise = parser.nextMessage();

    parser.write(
      encoder.encode(
        'POST /submit HTTP/1.1\r\nhost: example.com\r\ncontent-length: 7\r\nconnection: close\r\n\r\npayload'
      )
    );

    const message = await messagePromise;
    if (message.type !== 'request') {
      throw new Error('expected request');
    }
    expect(message.method).toBe('POST');
    expect(message.url).toBe('/submit');
    expect(message.headers.get('host')).toBe('example.com');
    await expect(readText(message.body)).resolves.toBe('payload');

    parser.close();
  });

  test('parses header fragments split across writes', async () => {
    const runtime = new LlhttpBindings();
    await runtime.ready();

    const parser = new HttpParser(runtime, 'request');
    const messagePromise = parser.nextMessage();

    parser.write(encoder.encode('GET /split HTTP/1.1\r\ncontent-'));
    parser.write(encoder.encode('type: text/'));
    parser.write(encoder.encode('plain\r\nhost: example.com\r\n\r\n'));

    const message = await messagePromise;
    if (message.type !== 'request') {
      throw new Error('expected request');
    }
    expect(message.url).toBe('/split');
    expect(message.headers.get('content-type')).toBe('text/plain');
    expect(message.headers.get('host')).toBe('example.com');
    await expect(readText(message.body)).resolves.toBe('');

    parser.close();
  });

  test('parses chunked bodies as streamed decoded bytes', async () => {
    const runtime = new LlhttpBindings();
    await runtime.ready();

    const parser = new HttpParser(runtime, 'request');
    const messagePromise = parser.nextMessage();

    parser.write(
      encoder.encode(
        'POST /chunked HTTP/1.1\r\nhost: example.com\r\ntransfer-encoding: chunked\r\n\r\n'
      )
    );
    parser.write(encoder.encode('5\r\nhello\r\n'));
    parser.write(encoder.encode('6\r\n world\r\n0\r\n\r\n'));

    const message = await messagePromise;
    if (message.type !== 'request') {
      throw new Error('expected request');
    }
    await expect(readText(message.body)).resolves.toBe('hello world');

    parser.close();
  });

  test('routes callbacks to independent parser handles', async () => {
    const runtime = new LlhttpBindings();
    await runtime.ready();

    const requestParser = new HttpParser(runtime, 'request');
    const responseParser = new HttpParser(runtime, 'response');
    const requestPromise = requestParser.nextMessage();
    const responsePromise = responseParser.nextMessage();

    requestParser.write(
      encoder.encode(
        'POST /a HTTP/1.1\r\nhost: example.com\r\ncontent-length: 3\r\n\r\none'
      )
    );
    responseParser.write(
      encoder.encode('HTTP/1.1 201 Created\r\ncontent-length: 3\r\n\r\ntwo')
    );

    const request = await requestPromise;
    const response = await responsePromise;
    if (request.type !== 'request' || response.type !== 'response') {
      throw new Error('expected request and response');
    }

    expect(request.url).toBe('/a');
    await expect(readText(request.body)).resolves.toBe('one');
    expect(response.statusCode).toBe(201);
    await expect(readText(response.body)).resolves.toBe('two');

    requestParser.close();
    responseParser.close();
  });

  test('keeps interleaved streamed bodies isolated across parser handles', async () => {
    const runtime = new LlhttpBindings();
    await runtime.ready();

    const firstParser = new HttpParser(runtime, 'request');
    const secondParser = new HttpParser(runtime, 'request');
    const firstPromise = firstParser.nextMessage();
    const secondPromise = secondParser.nextMessage();

    firstParser.write(
      encoder.encode(
        'POST /first HTTP/1.1\r\nhost: example.com\r\ntransfer-encoding: chunked\r\n\r\n'
      )
    );
    secondParser.write(
      encoder.encode(
        'POST /second HTTP/1.1\r\nhost: example.com\r\ntransfer-encoding: chunked\r\n\r\n'
      )
    );

    const first = await firstPromise;
    const second = await secondPromise;
    if (first.type !== 'request' || second.type !== 'request') {
      throw new Error('expected requests');
    }

    const firstText = readText(first.body);
    const secondText = readText(second.body);

    firstParser.write(encoder.encode('3\r\none\r\n'));
    secondParser.write(encoder.encode('3\r\ntwo\r\n'));
    firstParser.write(encoder.encode('5\r\nthree\r\n'));
    secondParser.write(encoder.encode('4\r\nfour\r\n'));
    firstParser.write(encoder.encode('0\r\n\r\n'));
    secondParser.write(encoder.encode('0\r\n\r\n'));

    expect(first.url).toBe('/first');
    expect(second.url).toBe('/second');
    await expect(firstText).resolves.toBe('onethree');
    await expect(secondText).resolves.toBe('twofour');

    firstParser.close();
    secondParser.close();
  });

  test('reports parse errors through pending message promises', async () => {
    const runtime = new LlhttpBindings();
    await runtime.ready();

    const parser = new HttpParser(runtime, 'request');
    const messagePromise = parser.nextMessage();

    expect(() => parser.write(encoder.encode('not http\r\n\r\n'))).toThrow(
      'http parse failed with code'
    );
    await expect(messagePromise).rejects.toThrow('http parse failed with code');

    parser.close();
  });

  test('throws when writing after close', async () => {
    const runtime = new LlhttpBindings();
    await runtime.ready();

    const parser = new HttpParser(runtime, 'request');
    parser.close();

    expect(() =>
      parser.write(encoder.encode('GET / HTTP/1.1\r\n\r\n'))
    ).toThrow('http parser is closed');
  });
});
