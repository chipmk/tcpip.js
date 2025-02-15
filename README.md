# tcpip.js

> Virtual TCP/IP stack that can run anywhere (browser, Node.js, Deno, Bun, etc).

## Features

- **Portable:** User-space network stack built on [`lwIP` + WASM](#why-lwip)
- **Tun/Tap:** L3 and L2 hooks using virtual [`TunInterface`](#tun-interface) and [`TapInterface`](#tap-interface)
- **Bridge:** Create a virtual switch/LAN by [`bridging`](#bridge-interface) multiple interfaces together
- **TCP API:** Establish TCP connections over the virtual network stack using [clients](#connecttcp) and [servers](#listentcp)
- **UDP API:** Send and receive UDP datagrams over the virtual network stack using [sockets](#openudp)
- **Cross platform**: Built on web standard APIs (`ReadableStream`, `WritableStream`, etc)
- **Lightweight:** Less than 100KB
- **Fast:** Over 500Mbps between stacks

## Why?

Originally built to communicate with in-browser VMs. Projects like [v86](https://github.com/copy/v86) allow you to run a full operating system (like Linux) directly in the browser, which also means you can run Node.js, Postgres, Nginx, or literally any other app in the browser. One of the biggest challenges though, is communicating with this guest OS from the JavaScript host.

### Why is communication hard?

With desktop VMs like VMWare, you simply talk to the guest over a network bridge: ethernet frames are forwarded from the VM's virtual NIC to your host's network stack and vice versa. In the browser though, there is no "host network stack" to send frames to - you're stuck with just the ethernet frames. We need a way to communicate at the ethernet (L2) level.

## How does tcpip.js work?

tcpip.js implements the entire network stack in user space and provides APIs to send and receive messages at each layer of the stack (L2, L3, L4). All APIs are built on web standards like [`ReadableStream`](https://developer.mozilla.org/docs/Web/API/ReadableStream), [`WritableStream`](https://developer.mozilla.org/docs/Web/API/WritableStream), [`AsyncIterator`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/AsyncIterator), etc, so it works on any modern JS runtime (browser, Node.js, Deno, Bun, etc). This library will probably feel similar to Deno's network APIs which strive to be web compliant.

It is implemented on top of `lwIP` compiled to WASM.

### Why `lwIP`?

[Lightweight IP](https://github.com/lwip-tcpip/lwip) (`lwIP`) is a widely adopted network stack written in C. It's primarily used in embedded environments, like in [ESP8266](https://en.wikipedia.org/wiki/ESP8266) and [ESP32](https://en.wikipedia.org/wiki/ESP32) chips, but is also used in unikernels like [Unikraft](https://unikraft.org/docs/concepts). If you have a smart WiFi device in your home, there's a good chance it's running `lwIP`!

Because `lwIP` is both widely adopted and designed for embedded systems, it means that it's battle tested and also lightweight. These are perfect qualities for a WASM lib.

tcpip.js was actually originally written in Go on top of [gvisor's](https://github.com/google/gvisor) `tcpip` stack, but was later rewritten in C using `lwIP` to be smaller and faster. It also avoids bundling Go's runtime into the compiled WASM file, which by itself is 1-2MB. `lwIP` on the other hand is less than 100KB.

## Installation

NPM

```shell
npm i tcpip
```

Yarn

```shell
yarn add tcpip
```

PNPM

```shell
pnpm add tcpip
```

## Usage

> _`tcpip.js` not loading? Check [frameworks/bundlers](#frameworksbundlers)._

Start by creating a `NetworkStack`:

```ts
import { createStack } from 'tcpip';

const stack = await createStack();
```

Then add a virtual network interface:

```ts
const tapInterface = await stack.createTapInterface({
  mac: '01:23:45:67:89:ab',
  ip: '192.168.1.1/24',
});
```

In this example, we create a [tap interface](#tap-interface) with a MAC address of `01:23:45:67:89:ab` and an IP address of `192.168.1.1` on a `/24` subnet (`192.168.1.0 - 192.168.1.255`). For more info on tap and other types of interfaces, see [Network interfaces](#network-interfaces).

> Note: this interface is completely virtual within your JS runtime so does not create a real tap interface in your OS.

Next we'll pipe outbound ethernet frames from the tap interface to the VM's virtual NIC (and vice versa):

```ts
import { createV86NetworkStream } from '@tcpip/v86';

// ...

const emulator = new V86();
const vmNic = createV86NetworkStream(emulator);

// Forward frames between the tap interface and the VM's NIC
tapInterface.readable.pipeTo(vmNic.writable);
vmNic.readable.pipeTo(tapInterface.writable);
```

_This is the virtual equivalent to connecting a patch cable between two physical NICs._

Now that the plumbing is in place, we can start sending TCP packets between our `NetworkStack` and the VM. Let's assume the VM has an IP address of `192.168.1.2` and is running a TCP server that is listening on port `80`.

From our `NetworkStack`, establish an outbound TCP connection destined to the TCP server running in the VM:

```ts
const connection = await stack.connectTcp({
  host: '192.168.1.2',
  port: 80,
});
```

This method resolves a `TcpConnection` once the connection is established. It exposes a [`ReadableStream`](https://developer.mozilla.org/docs/Web/API/ReadableStream) and [`WritableStream`](https://developer.mozilla.org/docs/Web/API/WritableStream) that you can use to send and receive data over the connection. For more info, see [`TcpConnection`](#tcpconnection).

Let's send and receive data over the `TcpConnection`:

```ts
const writer = connection.writable.getWriter();

// Send data
await writer.write(new TextEncoder().encode('Hello, world!'));
await writer.close();

// Listen for incoming data
for await (const chunk of connection) {
  console.log(new TextDecoder().decode(chunk));
}
```

You can also create a TCP server that listens for incoming connections:

```ts
const listener = await stack.listenTcp({
  port: 80,
});
```

This method resolves a `TcpListener` that you can use to accept incoming connections.

```ts
// TcpListener is an async iterable that yields TcpConnections
for await (const connection of listener) {
  const writer = connection.writable.getWriter();

  // Send data
  await writer.write(new TextEncoder().encode('Hello, world!'));
  await writer.close();

  // Listen for incoming data
  for await (const chunk of connection) {
    console.log(new TextDecoder().decode(chunk));
  }
}
```

For more info, see [`TcpListener`](#tcplistener).

The above example connects a single VM to the `NetworkStack`. If you wish to connect multiple VMs together on a shared LAN (ie. a virtual switch), you can create a [`BridgeInterface`](#bridge-interface) to join multiple tap interfaces together.

## Network interfaces

4 types of interfaces are available:

- [Loopback](#loopback-interface): Loop packets back onto itself (ie. `localhost`)
- [Tun](#tun-interface): Hook into IP packets (L3)
- [Tap](#tap-interface): Hook into ethernet frames (L2)
- [Bridge](#bridge-interface): Bridge multiple tap interfaces together to create a virtual switch

These interfaces are designed to resemble their counterparts in a real network stack.

### Loopback interface

A loopback interface simply forwards packets back on to itself. It's akin to 127.0.0.1 (`localhost`) on a typical network stack.

```ts
const loopbackInterface = await stack.createLoopbackInterface({
  ip: '127.0.0.1/8',
});
```

Note that `NetworkStack` will automatically create a single loopback interface with the above configuration by default. If you prefer to manage all loopback interfaces manually, you can disable the default loopback interface:

```ts
const stack = await createStack({
  initializeLoopback: false,
});
```

Loopback interfaces are useful when you want to both listen for and establish TCP connections on the same virtual stack without needing to forward packets to a real network interface.

```ts
const listener = await stack.listenTcp({
  port: 80,
});

const connection = await stack.connectTcp({
  host: '127.0.0.1',
  port: 80,
});
```

### Tun interface

A tun interface hooks into inbound and outbound IP packets (L3).

```ts
const tunInterface = await stack.createTunInterface({
  ip: '192.168.1.1/24',
});
```

It exposes a [`ReadableStream`](https://developer.mozilla.org/docs/Web/API/ReadableStream) and [`WritableStream`](https://developer.mozilla.org/docs/Web/API/WritableStream) as the underlying APIs to send and receive IP packets. It also implements the async iterable protocol for convenience.

```ts
interface TunInterface {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  listen(): AsyncIterableIterator<Uint8Array>;
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
}
```

Use a `TunInterface` to forward IP packets to another device that also communicates over IP (L3). In practice tun interfaces are most often used to implement VPNs. If instead you're looking to forward ethernet (L2) frames to a virtual NIC (like v86), use a [`TapInterface`](#tap-interface).

In the case of a VPN, would typically pipe the packet streams over another transport and vice versa:

```ts
// Connect the tun interface with some transport
tunInterface.readable.pipeTo(someTransport.writable);
someTransport.readable.pipeTo(tunInterface.writable);
```

**Important:** Tun interfaces will only listen for IP packets after you explicitly start listening (ie. by locking the readable stream). The following methods will lock the readable stream and begin buffering packets:

- `tunInterface.listen()`
- `for await (const packet of tunInterface) { ... }`
- `tunInterface.readable.getReader()`
- `tunInterface.readable.pipeThrough()`
- `tunInterface.readable.pipeTo()`
- `tunInterface.readable.tee()`

The reason for this is that, unlike TCP, raw IP packets have no form of flow control (back pressure) and buffering packets without a reader will result in memory exhaustion. If you plan to hook into IP packets, be sure to lock the stream before sending data on the stack, otherwise packets will be dropped. Then once listening begins, be sure to regularly read packets to avoid memory exhaustion.

```ts
const tunInterface = await stack.createTunInterface({
  ip: '192.168.1.1/24',
});

// First call `pipeTo()` to begin listening
tunInterface.readable.pipeTo(vmNic.writable);
vmNic.readable.pipeTo(tunInterface.writable);

// Then send data through the stack (like TCP)
const connection = await stack.connectTcp({
  host: '192.168.1.2',
  port: 80,
});

...
```

### Tap interface

A tap interface hooks into inbound and outbound ethernet frames (L2).

```ts
const tapInterface = await stack.createTapInterface({
  ip: '196.168.1.1/24',
});
```

It exposes a [`ReadableStream`](https://developer.mozilla.org/docs/Web/API/ReadableStream) and [`WritableStream`](https://developer.mozilla.org/docs/Web/API/WritableStream) as the underlying APIs to send and receive ethernet frames. It also implements the async iterable protocol for convenience.

```ts
interface TapInterface {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  listen(): AsyncIterableIterator<Uint8Array>;
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
}
```

Use a `TapInterface` to forward ethernet frames to another device that also communicates over ethernet (L2). You would typically use this to forward ethernet frames to a virtual NIC (like v86):

```ts
import { createV86NetworkStream } from '@tcpip/v86';

// ...

const emulator = new V86();
const vmNic = createV86NetworkStream(emulator);

// Connect the tap interface with the VM's virtual NIC
tapInterface.readable.pipeTo(vmNic.writable);
vmNic.readable.pipeTo(tapInterface.writable);
```

`TapInterface` has full ARP support, so it will both respond to ARP requests and send ARP requests for unknown IP addresses.

**Important:** Tap interfaces will only listen for ethernet frames after you explicitly start listening (ie. by locking the readable stream). The following methods will lock the readable stream and begin buffering frames:

- `tapInterface.listen()`
- `for await (const frame of tapInterface) { ... }`
- `tapInterface.readable.getReader()`
- `tapInterface.readable.pipeThrough()`
- `tapInterface.readable.pipeTo()`
- `tapInterface.readable.tee()`

The reason for this is that, unlike TCP, raw ethernet frames have no form of flow control (back pressure) and buffering frames without a reader will result in memory exhaustion. If you plan to hook into ethernet frames, be sure to lock the stream before sending data on the stack, otherwise frames will be dropped. Then once listening begins, be sure to regularly read frames to avoid memory exhaustion.

```ts
const tapInterface = await stack.createTapInterface({
  mac: '01:23:45:67:89:ab',
  ip: '196.168.1.1/24',
});

// First call `pipeTo()` to begin listening
tapInterface.readable.pipeTo(vmNic.writable);
vmNic.readable.pipeTo(tapInterface.writable);

// Then send data through the stack (like TCP)
const connection = await stack.connectTcp({
  host: '192.168.1.2',
  port: 80,
});

...
```

Note that `mac` and `ip` are optional parameters for `createTapInterface()`. If you don't provide a MAC address, a random one will be generated. If you don't provide an IP address, the interface will not respond to ARP requests or send ARP requests for unknown IP addresses. Typically you would only omit the IP address if you are using the tap interface as part of a [bridge](#bridge-interface).

### Bridge interface

A bridge interface bridges two or more tap interfaces together into a single logical interface with its own MAC and IP address. It operates at the ethernet level (L2) and will automatically forward frames between the interfaces based on the destination MAC address.

```ts
const port1 = await stack.createTapInterface();
const port2 = await stack.createTapInterface();

const bridge = await stack.createBridgeInterface({
  ports: [port1, port2],
  ip: '192.168.1.1/24',
});
```

A bridge is what you would use to connect multiple VMs together into a virtual LAN.

```ts
import { createV86NetworkStream } from '@tcpip/v86';

// ...

const vm1 = new V86();
const vm2 = new V86();
const vm1Nic = createV86NetworkStream(vm1);
const vm2Nic = createV86NetworkStream(vm2);

const port1 = await stack.createTapInterface();
const port2 = await stack.createTapInterface();

// Connect port1 to vm1
port1.readable.pipeTo(vm1Nic.writable);
vm1Nic.readable.pipeTo(port1.writable);

// Connect port2 to vm2
port2.readable.pipeTo(vm2Nic.writable);
vm2Nic.readable.pipeTo(port2.writable);

// Bridge the two ports together
const bridge = await stack.createBridgeInterface({
  ports: [port1, port2],
  ip: '192.168.1.1/24',
});
```

In the above example, `vm1` and `vm2` are attached together via a shared LAN. We treat the tcpip.js stack as the virtual router/switch where each VM connects to their own [tap interface](#tap-interface) (`port1` and `port2`) which are then bridged together. The bridge interface has its own MAC and IP address (`192.168.1.1`), representing the address of the virtual router. This follows the exact same bridging pattern that a physical router would in a real network.

Notice that we intentionally don't set IP addresses on the tap interfaces - they are only used to forward ethernet frames to/from the bridge. The bridge interface itself is where we set the IP address that the VMs can communicate with.

This allows you to, for example, host a TCP server on the router itself in order to communicate with the VMs from JavaScript. You would simply create a TCP server on the stack like so:

```ts
const listener = await stack.listenTcp({
  port: 80,
});
```

The server would be accessible to any VM connected to the bridge via `192.168.1.1:80`. For more information on TCP, see the [TCP API](#tcp-api).

Note that `BridgeInterface` does not expose its own `readable` or `writable` stream - instead you would send and receive frames through each `TapInterface` port that is part of the bridge.

### Other interfaces

Looking for another type of network interface? See [Future plans](#future-plans).

### Removing interfaces

You can remove any network interface from the stack by calling `removeInterface()`:

```ts
await stack.removeInterface(tapInterface);
```

### Listing interfaces

You can retrieve all interfaces on the stack via the `interfaces` property:

```ts
const allInterfaces = stack.interfaces;
```

## TCP API

The TCP API allows you to establish TCP connections over the virtual network stack using clients and servers.

### `connectTcp()`

To establish an outbound TCP connection, call `connectTcp()`:

```ts
const connection = await stack.connectTcp({
  host: '192.168.1.2',
  port: 80,
});
```

`connectTcp()` returns a `Promise<TcpConnection>` that resolves once the connection is established. See [`TcpConnection`](#tcpconnection).

Note that DNS resolution is not yet supported, so you must provide the IP address of the host you wish to connect to. See [Future plans](#future-plans).

### `listenTcp()`

To create a TCP server that listens for incoming connections, call `listenTcp()`:

```ts
const listener = await stack.listenTcp({
  port: 80,
});
```

`listenTcp()` returns a `Promise<TcpListener>` that resolves once the server is listening. See [`TcpListener`](#tcplistener).

### `TcpListener`

A `TcpListener` is an async iterable that yields `TcpConnection`s:

```ts
interface TcpListener {
  [Symbol.asyncIterator](): AsyncIterableIterator<TcpConnection>;
}
```

You can accept incoming connections by iterating over the `TcpListener` using the `for await` syntax:

```ts
for await (const connection of listener) {
  // Process incoming connection
}
```

This should feel similar to [Deno's TCP listener](https://docs.deno.com/examples/tcp-listener/).

### `TcpConnection`

A `TcpConnection` represents an established TCP connection. It exposes a [`ReadableStream`](https://developer.mozilla.org/docs/Web/API/ReadableStream) and [`WritableStream`](https://developer.mozilla.org/docs/Web/API/WritableStream) as the underlying APIs to send and receive data. It also implements the async iterable protocol for convenience.

```ts
interface TcpConnection {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
}
```

You would typically read incoming data by iterating over the `TcpConnection` using the `for await` syntax:

```ts
for await (const chunk of connection) {
  console.log(new TextDecoder().decode(chunk));
}
```

But you can also read data from the `readable` stream directly by acquiring a reader:

```ts
const reader = connection.readable.getReader();

// Read data
const { value, done } = await reader.read();
```

To send data, you would typically acquire a writer from the `writable` stream:

```ts
const writer = connection.writable.getWriter();

// Send data
await writer.write(new TextEncoder().encode('Hello, world!'));
```

As with any web stream, you can pipe data through a transform stream:

```ts
const decompressedStream = connection.readable.pipeThrough(
  new DecompressionStream('gzip')
);
```

Or pipe it to a writable stream:

```ts
connection.readable.pipeTo(someWritableStream);
```

You could, for example, build an echo server by piping the connection's readable stream back onto its own writable stream:

```ts
connection.readable.pipeTo(connection.writable);
```

In practice you might use piping to connect TCP streams to a higher-level protocol library or to proxy connections over another transport.

To close the connection, call `close()`:

```ts
await connection.close();
```

## UDP API

The UDP API allows you to send and receive UDP datagrams over the virtual network stack.

### `openUdp()`

To open a UDP socket, call `openUdp()`:

```ts
const udpSocket = await stack.openUdp();
```

Since UDP is connectionless, `openUdp()` is used to create a socket that can both listen for UDP datagrams and send UDP datagrams. It returns a [`UdpSocket`](#udpsocket) that you can use to send and receive data.

Passing no arguments to `openUdp()` will create a socket that sends and receives datagrams on any interface (ie. `0.0.0.0`) and on a random port. If you want to bind to a specific IP address or port, you can pass an options object:

```ts
const udpSocket = await stack.openUdp({
  ip: '10.0.0.1',
  port: 1234,
});
```

If you are creating a UDP server, you would typically just bind to a port:

```ts
const udpSocket = await stack.openUdp({
  port: 1234,
});
```

If you are creating a UDP client, you would typically let the stack choose a random port:

```ts
const udpSocket = await stack.openUdp();
```

### `UdpSocket`

A `UdpSocket` represents a bound UDP socket. It exposes a [`ReadableStream`](https://developer.mozilla.org/docs/Web/API/ReadableStream) and [`WritableStream`](https://developer.mozilla.org/docs/Web/API/WritableStream) as the underlying APIs to send and receive data. It also implements the async iterable protocol for convenience.

```ts
type UdpDatagram = {
  host: string;
  port: number;
  data: Uint8Array;
};

interface UdpSocket {
  readable: ReadableStream<UdpDatagram>;
  writable: WritableStream<UdpDatagram>;
  close(): Promise<void>;
  [Symbol.asyncIterator](): AsyncIterator<UdpDatagram>;
}
```

You would typically read incoming datagrams by iterating over the `UdpSocket` using the `for await` syntax:

```ts
for await (const datagram of udpSocket) {
  console.log(
    datagram.host,
    datagram.port,
    new TextDecoder().decode(datagram.data)
  );
}
```

Notice that each datagram is an object with `host`, `port`, and `data` properties. This is because UDP is connectionless so we need a way to identify the sender of each datagram.

You can also read datagrams from the `readable` stream directly by acquiring a reader:

```ts
const reader = udpSocket.readable.getReader();

// Read datagram
const { value, done } = await reader.read();
```

To send datagrams, you would typically acquire a writer from the `writable` stream:

```ts
const writer = udpSocket.writable.getWriter();

// Send datagram
await writer.write({
  host: '10.0.0.2',
  port: 1234,
  data: new TextEncoder().encode('Hello, world!'),
});
```

Outbound datagrams follow the same format as inbound datagrams: an object with `host`, `port`, and `data` properties indicating the destination host, port, and data.

Unlike Tun and Tap interfaces which are also connectionless, UDP sockets do not require you to lock the stream before receiving data - simply calling `stack.openUdp()` will begin listening for datagrams.

## Frameworks/bundlers

Some frameworks require additional configuration to correctly load WASM files (which `tcpip.js` depends on). Here are some common frameworks and how to configure them:

### Vite

Exclude `tcpip` from dependency optimization in your `vite.config.js`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  // ...
  optimizeDeps: {
    exclude: ['tcpip'],
  },
});
```

_Background:_ Vite optimizes dependencies during development to improve build times. Unfortunately this breaks files loaded via the `new URL('./my-file.wasm', import.meta.url)` pattern (see [issue](https://github.com/vitejs/vite/issues/8427)). By excluding `tcpip` from optimization, Vite will not process the library and it will load the WASM file correctly.

## Future plans

- [ ] HTTP API
- [ ] ICMP (ping) API
- [ ] DHCP API
- [ ] DNS API
- [ ] mDNS API
- [ ] Hosts file
- [ ] Experimental Wireguard interface
- [ ] Node.js net polyfill
- [ ] Deno net polyfill

## License

MIT
