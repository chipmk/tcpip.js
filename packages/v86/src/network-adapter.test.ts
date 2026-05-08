import { createDhcp } from '@tcpip/dhcp';
import { createHttp } from '@tcpip/http';
import { type TcpSegment, parseEthernetFrame } from '@tcpip/wire';
import { connectStreams, createStack } from 'tcpip';
import { describe, expect, it } from 'vitest';
import { createVm, nextValue } from '../test/util.js';

describe('network adapter', () => {
  it('should assign an IP address and DNS server to a VM with DHCP', async () => {
    const networkStack = await createStack();
    const tapInterface = await networkStack.createTapInterface({
      ip: '192.168.1.1/24',
    });
    const dhcp = await createDhcp(networkStack);
    const dhcpServer = await dhcp.serve({
      leaseRange: { start: '192.168.1.100', end: '192.168.1.110' },
      serverIdentifier: '192.168.1.1',
      netmask: '255.255.255.0',
      router: '192.168.1.1',
      dnsServers: ['192.168.1.1'],
      leaseDuration: 3600,
    });

    const { emulator, net, executeCommand } = await createVm();
    connectStreams(tapInterface, net);

    const dhcpOutput = await executeCommand('udhcpc -n -i eth0 -t 3 -T 2');
    const addressOutput = await executeCommand('ip -4 addr show dev eth0');
    const resolvConf = await executeCommand('cat /etc/resolv.conf');

    expect(dhcpOutput).toContain('lease of 192.168.1.100 obtained');
    expect(addressOutput).toContain('inet 192.168.1.100/24');
    expect(resolvConf).toContain('nameserver 192.168.1.1');
    expect([...dhcpServer.leases.values()]).toEqual([
      expect.objectContaining({ ip: '192.168.1.100' }),
    ]);

    await emulator.destroy();
  });

  it('should make tcp connection from VM to host', async () => {
    const networkStack = await createStack();
    const tapInterface = await networkStack.createTapInterface({
      ip: '192.168.1.1/24',
    });

    const { emulator, net, executeCommand } = await createVm({
      ip: '192.168.1.2/24',
    });

    connectStreams(tapInterface, net);

    const listener = await networkStack.listenTcp({ port: 5000 });

    const telnetPromise = executeCommand('telnet 192.168.1.1 5000');

    const connection = await nextValue(listener);

    expect(connection).toBeDefined();

    const textEncoder = new TextEncoder();
    const writer = connection.writable.getWriter();
    await writer.write(textEncoder.encode('Hello'));

    await connection.close();

    const message = await telnetPromise;
    expect(message).toBe('Hello' + 'Connection closed by foreign host');

    await emulator.destroy();
  });

  it('should make tcp connection from host to VM', async () => {
    const networkStack = await createStack();
    const tapInterface = await networkStack.createTapInterface({
      ip: '192.168.1.1/24',
    });

    const { emulator, net, executeCommand } = await createVm({
      ip: '192.168.1.2/24',
    });

    connectStreams(tapInterface, net);

    // Listen for incoming TCP connections in the VM
    await executeCommand(
      'echo "5000 stream tcp nowait nobody /bin/echo Hello" | inetd -f - &'
    );

    // Wait for inetd to start
    await new Promise((resolve) => setTimeout(resolve, 100));

    const connection = await networkStack.connectTcp({
      host: '192.168.1.2',
      port: 5000,
    });

    expect(connection).toBeDefined();

    const message = await nextValue(connection.readable);

    const textDecoder = new TextDecoder();
    expect(textDecoder.decode(message)).toBe('Hello');

    await connection.close();
    await emulator.destroy();
  });

  it('should serve HTTP responses to a VM', async () => {
    const networkStack = await createStack();
    const tapInterface = await networkStack.createTapInterface({
      ip: '192.168.1.1/24',
    });

    const { emulator, net, executeCommand } = await createVm({
      ip: '192.168.1.2/24',
    });

    connectStreams(tapInterface, net);

    const { serve } = await createHttp(networkStack);
    await serve(() => {
      return new Response('hello from tcpip.js');
    });

    const response = await executeCommand('wget -qO- http://192.168.1.1/hello');

    expect(response).toBe('hello from tcpip.js');

    await emulator.destroy();
  });

  it('should send data larger than the send buffer from host to VM', async () => {
    const networkStack = await createStack();
    const tapInterface = await networkStack.createTapInterface({
      ip: '192.168.1.1/24',
    });

    const { emulator, net, executeCommand } = await createVm({
      ip: '192.168.1.2/24',
    });

    connectStreams(tapInterface, net);

    const listener = await networkStack.listenTcp({ port: 5000 });

    const telnetPromise = executeCommand('telnet 192.168.1.1 5000');

    const connection = await nextValue(listener);

    expect(connection).toBeDefined();

    const textDecoder = new TextDecoder();
    const data = new Uint8Array(1460 * 4 + 1);
    const writer = connection.writable.getWriter();
    await writer.write(data);

    await connection.close();

    const message = await telnetPromise;
    expect(message).toBe(
      `${textDecoder.decode(data)}Connection closed by foreign host`
    );

    await emulator.destroy();
  });

  it('should receive 3 way TCP handshake from VM to host', async () => {
    const networkStack = await createStack();
    const tapInterface = await networkStack.createTapInterface({
      ip: '192.168.1.1/24',
    });

    const { emulator, net, executeCommand } = await createVm({
      ip: '192.168.1.2/24',
    });

    const tcpSegments: TcpSegment[] = [];

    function captureTcpSegments(frame: Uint8Array) {
      try {
        const ethernetFrame = parseEthernetFrame(frame);
        if (
          ethernetFrame.type === 'ipv4' &&
          ethernetFrame.payload.protocol === 'tcp'
        ) {
          tcpSegments.push(ethernetFrame.payload.payload);
        }
      } catch (error) {}
      return frame;
    }

    connectStreams(tapInterface, net, {
      transformAtoB: captureTcpSegments,
      transformBtoA: captureTcpSegments,
    });

    const listener = await networkStack.listenTcp({ port: 5000 });

    // Intentionally don't await
    executeCommand('telnet 192.168.1.1 5000');

    const connection = await nextValue(listener);

    expect(connection).toBeDefined();

    // Expect a 3-way handshake
    expect(tcpSegments).toEqual([
      expect.objectContaining({
        flags: expect.objectContaining({
          syn: true,
          ack: false,
        }),
      }),
      expect.objectContaining({
        flags: expect.objectContaining({
          syn: true,
          ack: true,
        }),
      }),
      expect.objectContaining({
        flags: expect.objectContaining({
          syn: false,
          ack: true,
        }),
      }),
    ]);

    await connection.close();
    await emulator.destroy();
  });
});
