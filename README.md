# tcpip.js

> Full TCP/IP stack for JS (built on gVisor + WASM)

## Features

- **Browser/Server:** A user-space TCP/IP stack for the browser or server
- **Polyfill:** Node.js compatible `net` API allowing you to use server-side libraries in the browser
- **Trusted:** Built on top of gVisor's [`tcpip`](https://pkg.go.dev/gvisor.dev/gvisor/pkg/tcpip) stack
- **Secure:** Build custom VPN servers in user-space without needing root access
- **Tun/Tap:** L3 and L2 hooks using [`TunInterface`](#tun) and [`TapInterface`](#tap)
- **WS Tunnel:** Tunnel packets to an internet-connected network using WebSockets
- **v86:** Communicate directly with an [in-browser Linux VM](https://github.com/copy/v86) via a `NetworkAdapter`

## Installation

NPM

```shell
$ npm install --save tcpip
```

Yarn

```shell
$ yarn add tcpip
```

## Usage

### Basic

```ts
import { Stack, init } from 'tcpip';

async function run() {
  // Initialize the WASM module - call this at entrypoint
  await init();

  // Create a network stack
  const stack = new Stack();

  // A stack can have one or more network interfaces
  stack.createLoopbackInterface({
    ipAddress: '127.0.0.1/8',
  });

  // Node.js compatible `net` API available
  // (option to polyfill - see below)
  const { net } = stack;
  const server = net.createServer(80);
}

run();
```

### Tun

```ts
...

// Tun interfaces provide hooks for L3 IP packets
const tunInterface = stack.createTunInterface({
  ipAddress: '10.2.0.1/24',
});

// Capture outgoing IP packets
tunInterface.on('packet', (packet) => {
  console.log(packet);
});

// Inject IP packets into the network stack
tunInterface.injectPacket(myPacket);
```

### Tap

```ts
...

// Tap interfaces provide hooks for L2 ethernet frames
const tapInterface = stack.createTapInterface({
  ipAddress: '10.1.0.1/24',
});

// Capture outgoing ethernet frames
tapInterface.on('frame', (frame) => {
  console.log(frame);
});

// Inject ethernet frames into the network stack
tapInterface.injectFrame(myFrame);
```

Keep in mind this is all happening in user-space - no kernel-level network interfaces are created. If you want to connect your stack to an outside network, you can use WebSocket tunnels (browser) or any other transport (server).

## Polyfill `net`

You can polyfill the Node.js `net` module in the browser in order to run network requests through tcpip.js. This opens the doors to using server-side network libraries in the browser.

1. Install the polyfill:

   ```shell
   $ npm install --save @tcpip/polyfill
   ```

   or

   ```shell
   $ yarn add @tcpip/polyfill
   ```

1. Configure your bundler to resolve `net` using the polyfill:

   ### Webpack 5

   _webpack.config.ts_

   ```js
   import { Configuration } from 'webpack';

   const config: Configuration = {
     ...
     module: {
       rules: [
         ...
         {
           test: /\.wasm/,
           type: 'asset/resource',
         },
       ],
     },
     resolve: {
       fallback: {
         net: require.resolve('@tcpip/polyfill/net'),
       },
     },
   };

   export default config;
   ```

1. Create a network stack and call `polyfill()` to attach that stack to the `net` module:

   ```ts
   import { polyfill } from '@tcpip/polyfill';
   import { Stack, init } from 'tcpip';

   async function run() {
     await init();

     const stack = new Stack();

     stack.createLoopbackInterface({
       ipAddress: '127.0.0.1/8',
     });

     polyfill(stack);
   }

   run();
   ```

1. Now any server-side library that imports `net` will use the polyfilled API and route packets through your stack.

   ```ts
   import { createServer } from 'net';

   // Creates a TCP server on your tcpip.js stack
   const server = createServer(80);
   ```

   _**Note:** This isn't a silver bullet - many server side libraries rely on more than just `net` (eg. `fs`, `crypto`, etc). You will need to polyfill the remaining modules on a case-by-case basis._

## How does it work?

tcpip.js is built on gVisor's [`tcpip`](https://pkg.go.dev/gvisor.dev/gvisor/pkg/tcpip) stack written in Go. It compiles to WASM then binds to JS classes and methods.

### What is gVisor?

[gVisor](https://github.com/google/gvisor) is an application kernel written in Go. It implements a large subset of Linux system calls completely in user-space, including a full TCP/IP stack. gVisor is used in production by Google in products like App Engine, Cloud Functions, and Cloud Run. It's also being used in some Kubernetes clusters as an extra security layer between containers.

### Binding to JS via WASM

Code written in Go can be compiled to WASM using the `GOARCH=wasm` target. When combined with `GOOS=js`, you can use the `syscall/js` package to interact with JavaScript from Go.

tcpip.js is implemented using a hybrid language approach: The classes/interfaces are written in TypeScript and their methods are implemented in Go.

## Roadmap

- [ ] `LoopbackInterface`/`TunInterface`/`TapInterface`
  - [x] Basic POC
  - [ ] More options
- [ ] Node.js `net` API (TCP)
  - [x] Basic POC
  - [x] Polyfill
  - [ ] Complete implementation
- [ ] Node.js `dgram` API (UDP)
  - [ ] Basic POC
  - [ ] Polyfill
  - [ ] Complete implementation
- [ ] Node.js `dns` API
  - [ ] Basic POC
  - [ ] Polyfill
  - [ ] Complete implementation
- [ ] Node.js `http` API
  - [ ] Basic POC
  - [ ] Polyfill
  - [ ] Complete implementation
- [ ] v86 adapter
  - [x] [`NetworkAdapter`](./packages/v86) package
  - [ ] Example project
- [ ] WebSocket tunnel
  - [x] Basic POC
  - [ ] Example project

## License

MIT
