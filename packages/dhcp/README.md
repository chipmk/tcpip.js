# @tcpip/dhcp

> DHCP server for tcpip.js virtual networks.

## Why?

When you connect a VM like v86 to a `tcpip` network, it needs an IP address before you can communicate with it. You can configure that address manually by pre-baking it into the image or running the `ip` command after boot, but this gets tedious and doesn't scale well with multiple VMs. DHCP lets the network manage the IP, gateway, and DNS settings instead. It was designed exactly for this use case.

`@tcpip/dhcp` lets the guest use its normal DHCP client instead. Start a DHCP server on your `tcpip` stack, connect the guest to a tap or bridge interface, and the guest can request an address dynamically. You can also advertise your own DNS server through DHCP, which is useful when you want VMs to resolve names on your virtual network.

## Installation

```shell
npm i tcpip @tcpip/dhcp
```

## Usage

```ts
import { createDhcp } from '@tcpip/dhcp';
import { createStack } from 'tcpip';

const stack = await createStack();

const tapInterface = await stack.createTapInterface({
  ip: '192.168.1.1/24',
});

const dhcp = await createDhcp(stack);
const server = await dhcp.serve({
  leaseRange: {
    start: '192.168.1.100',
    end: '192.168.1.200',
  },
  serverIdentifier: '192.168.1.1',
  netmask: '255.255.255.0',
  router: '192.168.1.1',
  dnsServers: ['192.168.1.1'],
});
```

Then connect `tapInterface` to another virtual device. For example, with `@tcpip/v86`:

```ts
import { createV86NetworkStream } from '@tcpip/v86';
import { connectStreams } from 'tcpip';

const vmNic = createV86NetworkStream(emulator);

connectStreams(tapInterface, vmNic);
```

Note that the guest needs to run a DHCP client for this to work. Many Linux images do this during boot, but if yours doesn't you can run something like:

```shell
udhcpc -i eth0
```

depending on the DHCP client installed. With v86, you can send commands over the serial console using `emulator.serial0_send(...)`.

## Options

```ts
type DhcpServerOptions = {
  leaseRange: {
    start: string;
    end: string;
  };
  serverIdentifier: string;
  netmask: string;
  router: string;
  leaseDuration?: number;
  dnsServers?: string[];
  hostname?: string;
  domainName?: string;
  searchDomains?: string[];
};
```

- `leaseRange`: IP addresses the server may assign.
- `serverIdentifier`: IP address of this DHCP server, usually the stack interface IP.
- `netmask`: subnet mask sent to clients.
- `router`: default gateway sent to clients.
- `leaseDuration`: lease lifetime in seconds. Defaults to `86400`.
- `dnsServers`: DNS servers sent to clients.
- `hostname`, `domainName`, `searchDomains`: optional host/domain settings sent to clients.

The returned `server` keeps in-memory leases:

```ts
console.log([...server.leases.values()]);
```

## Behavior

Supported today:

- DHCP DISCOVER/OFFER
- DHCP REQUEST/ACK
- DHCP RELEASE
- lease renewal via `ciaddr`
- short-lived offer reservations to avoid duplicate concurrent offers
- UDP broadcast over `tcpip`

If the lease range is exhausted, the server does not send an offer.

## Limitations

This is an MVP DHCP server API for virtual networks. It does not currently support:

- persistent leases
- static MAC reservations
- DHCP client mode
- DHCP DECLINE or INFORM
- client identifier option matching
- lease event callbacks

## License

MIT
