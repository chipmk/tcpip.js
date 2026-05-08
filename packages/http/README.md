# @tcpip/http

> HTTP client and server for tcpip.js virtual networks.

`@tcpip/http` adds HTTP/1.1 client and server support on top of the [TCP streams](../../README.md#tcp-api) provided by `tcpip`. It exposes a Fetch-compatible API for virtual networks: a `fetch` function for outbound requests and a `serve` function for handling inbound requests. Both work with standard `Request`, `Response`, and `Headers` objects, and support streaming request and response bodies.

## How does it work?

`@tcpip/http` is built on top of [llhttp](https://github.com/nodejs/llhttp), the C HTTP parser used by Node.js, compiled to a small WASM module. `llhttp` handles the nuanced HTTP grammar and framing rules, while `@tcpip/http` provides the virtual TCP integration, Fetch objects, and stream plumbing.

## Installation

```shell
npm i tcpip @tcpip/http
```

## Usage

```ts
import { createStack } from 'tcpip';
import { createHttp } from '@tcpip/http';

const stack = await createStack();
const { fetch, serve } = await createHttp(stack);

await serve(async (request) => {
  return new Response('hello from tcpip.js');
});

const response = await fetch('http://127.0.0.1/hello');
console.log(await response.text());
// hello from tcpip.js
```

Practically, `@tcpip/http` is most useful as a tool to communicate with VMs like v86 over HTTP.

## Custom fetch for SDKs

Many SDKs accept a custom `fetch` option so callers can choose their own transport. `createHttp(stack)` returns a fetch-compatible function for exactly that use case: it accepts the standard `fetch(input, init)` arguments, sends the request over the tcpip.js virtual network, and returns a standard `Response`.

```ts
const sdk = new SomeSdk({
  fetch,
});
```

This means you can use existing HTTP-based SDKs to interact with services running on your tcpip.js virtual network (like a v86 VM), without needing to modify the SDK or use a separate proxy.

## API

```ts
const { fetch, serve } = await createHttp(stack);
```

`fetch(input, init)` is compatible with `typeof globalThis.fetch` for plain `http:` URLs.

When sending a request body in browsers, prefer the `fetch(url, init)` form instead of pre-constructing a `Request` object:

```ts
await fetch('http://127.0.0.1/form', {
  method: 'POST',
  body: new URLSearchParams({ name: 'tcpip' }),
});
```

Some [browsers](https://developer.mozilla.org/en-US/docs/Web/API/Request/body#browser_compatibility) (i.e. Firefox), do not expose `Request.body` for a pre-constructed `Request`. If you pass a `Request` object to `fetch` that already contains a body, `@tcpip/http` cannot recover the original bytes for these browsers. Passing the body through `init.body` lets `@tcpip/http` serialize it directly, and also allows it to send `Content-Length` for known-size bodies like strings, `URLSearchParams`, `Blob`, `ArrayBuffer`, and typed arrays. Unknown-size streams are sent with `Transfer-Encoding: chunked`.

`serve(handler)` listens on virtual port `80` by default on all interfaces.

```ts
await serve((request) => new Response('ok'));
```

`serve(options, handler)` listens on an explicit virtual host and/or port.

```ts
await serve({ host: '127.0.0.1', port: 8080 }, (request) => new Response('ok'));
```

`serve({ ...options, handler })` is also supported.

```ts
await serve({
  host: '127.0.0.1',
  port: 8080,
  handler: (request) => new Response('ok'),
});
```

## Scope

Supported:

- HTTP/1.1 over `tcpip` TCP streams
- plain `http:` URLs
- standard `Request`, `Response`, and `Headers` objects
- streaming request and response bodies
- `Content-Length` parsing and chunked transfer encoding

Not supported:

- `https:` URLs
- browser CORS, cache, cookies, or credential policy
- HTTP/2 or HTTP/3
- CONNECT, upgrades, trailers, compression, connection pooling, or pipelining
