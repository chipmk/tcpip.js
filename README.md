# tcpip.js

> Full TCP/IP stack in JS built on gVisor + WASM

## Features

- **Browser/Server:** User-space TCP/IP stack available in browser or server-side
- **Polyfill:** Use server-side libraries in the browser via a Node.js compatible `net` API
- **Trusted:** Implemented on top of gVisor's user-space [`tcpip`](https://pkg.go.dev/gvisor.dev/gvisor/pkg/tcpip) stack
- **Tun/Tap:** L3 and L2 hooks using `TunInterface` and `TapInterface`
- **WS Proxy:** Tunnel packets to an internet-connected network using WebSockets
- **v86:** Communicate directly with an in-browser Linux VM via a `NetworkAdapter`

## Usage

### Basic

```ts
import { Stack } from 'tcpip';

const stack = new Stack();

stack.createLoopbackInterface({
  ipAddress: '127.0.0.1/8',
});

// Node.js compatible `net` API
// (option to polyfill - see below)
const server = stack.net.createServer(80);
```

## Polyfill `net`

You can polyfill the Node.js `net` module in the browser in order to run network requests through tcpip.js. This opens the doors to using server-side network libraries in the browser.

1. Configure your bundler to resolve `net` using the polyfill.

   ### Webpack 5

   _webpack.config.ts_

   ```js
   import { resolve } from 'path';
   import { Configuration } from 'webpack';

   const config: Configuration = {
     ...
     resolve: {
       fallback: {
         net: require.resolve('@tcpip/polyfill/net'),
       },
     },
   };

   export default config;
   ```

2. Create a network stack and call `polyfill()` to attach that stack to the `net` module:

   ```ts
   import { Stack, polyfill } from 'tcpip';

   const stack = new Stack();

   stack.createLoopbackInterface({
     ipAddress: '127.0.0.1/8',
   });

   polyfill(stack);
   ```

3. Any server-side library that imports `net` will use the polyfilled API and route packets through your stack.

   ```ts
   import { createServer } from 'net';

   // Creates a TCP server on your tcpip.js stack
   const server = createServer(80);
   ```

   _**Note:** This isn't a silver bullet - many server side libraries rely on more than just `net` (eg. `fs`, `crypto`, etc). You will need to polyfill the remaining modules on a case-by-case basis._

## How does it work?

tcpip.js is built on gVisor's [`tcpip`](https://pkg.go.dev/gvisor.dev/gvisor/pkg/tcpip) stack written in Go. It compiles from Go to WASM then binds to JS classes and methods.

### What is gVisor?

[gVisor](https://github.com/google/gvisor) is an application kernel written in Go. It implements a large subset of Linux system calls completely in user-space, including a full TCP/IP stack. gVisor is used in production by Google in products like App Engine, Cloud Functions, and Cloud Run. It's also being used in some Kubernetes clusters as an extra security layer between containers.

### Binding to JS via WASM

Code written in Go can be compiled to WASM using the `GOARCH=wasm` target. When combined with `GOOS=js`, you can use the `syscall/js` package to interact with JavaScript from Go.

tcpip.js is implemented using a hybrid language approach: The classes/interfaces are written in TypeScript and their methods are implemented in Go.
