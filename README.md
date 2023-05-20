# tcpip.js

> Full TCP/IP stack in JS using gvisor + wasm

## Features

- **Browser/Server:** User-space TCP/IP stack in browser or server
- **Polyfill:** Use server-side libraries in the browser via Node.js compatible `net` API
- **Tun/Tap:** L3 and L2 hooks using `TunInterface` and `TapInterface`
- **WS Proxy:** Tunnel packets to a real network interface using WebSockets
- **v86:** Communicate directly to in-browser Linux VM via `NetworkAdapter`

## Usage

### Basic

```ts
import { Stack } from 'tcpip';

const stack = new Stack();

stack.createLoopbackInterface({
  ipNetwork: '127.0.0.1/8',
});

// Node.js compatible `net` API
// (option to polyfill - see below)
const server = stack.net.createServer(80);
```

## Polyfill `net`

You can polyfill `net` so that you can use server-side network libraries in the browser.

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

2. Now create a network stack and call `polyfill()` to attach that stack to the `net` module:

   ```ts
   import { Stack, polyfill } from 'tcpip';

   const stack = new Stack();

   stack.createLoopbackInterface({
     ipNetwork: '127.0.0.1/8',
   });

   polyfill(stack);
   ```

3. Any server-side library that imports `net` will use the polyfilled API and route through your stack.

   ```ts
   import { createServer } from 'net';

   // Creates a TCP server on your stack
   const server = createServer(80);
   ```

   _**Note:** This isn't a silver bullet - many server side libraries rely on more than just `net`. You will need to polyfill the remaining modules on a case-by-case basis._
