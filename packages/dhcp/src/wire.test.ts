import { describe, expect, it } from 'vitest';
import { DhcpMessageTypes, DhcpOptionCodes, DhcpOptions } from './constants.js';
import type { DhcpServerOptions } from './dhcp-server.js';
import {
  parseDhcpMessage,
  parseDhcpMessageType,
  serializeDhcpMessage,
  serializeDhcpMessageType,
} from './wire.js';

describe('parseDhcpMessageType', () => {
  it('should parse valid DHCP message types', () => {
    expect(parseDhcpMessageType(DhcpMessageTypes.DISCOVER)).toBe('DISCOVER');
    expect(parseDhcpMessageType(DhcpMessageTypes.OFFER)).toBe('OFFER');
    expect(parseDhcpMessageType(DhcpMessageTypes.REQUEST)).toBe('REQUEST');
    expect(parseDhcpMessageType(DhcpMessageTypes.ACK)).toBe('ACK');
  });

  it('should throw error for unknown message type', () => {
    expect(() => parseDhcpMessageType(99)).toThrow(
      'unknown dhcp message type: 99'
    );
  });
});

describe('serializeDhcpMessageType', () => {
  it('should serialize valid DHCP message types', () => {
    expect(serializeDhcpMessageType('DISCOVER')).toBe(
      DhcpMessageTypes.DISCOVER
    );
    expect(serializeDhcpMessageType('OFFER')).toBe(DhcpMessageTypes.OFFER);
    expect(serializeDhcpMessageType('REQUEST')).toBe(DhcpMessageTypes.REQUEST);
    expect(serializeDhcpMessageType('ACK')).toBe(DhcpMessageTypes.ACK);
  });
});

describe('parseDhcpMessage', () => {
  it('should throw error if message is too short', () => {
    const data = new Uint8Array(239);
    expect(() => parseDhcpMessage(data)).toThrow('dhcp message too short');
  });

  it('should parse basic DHCP message fields', () => {
    const data = new Uint8Array(240);
    const view = new DataView(data.buffer);

    view.setUint8(0, 1); // op
    view.setUint8(1, 2); // htype
    view.setUint8(2, 6); // hlen
    view.setUint32(4, 0x12345678); // xid

    // Set MAC address
    const mac = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66];
    mac.forEach((byte, i) => view.setUint8(28 + i, byte));

    const result = parseDhcpMessage(data);

    expect(result).toEqual({
      op: 1,
      htype: 2,
      hlen: 6,
      xid: 0x12345678,
      mac: '11:22:33:44:55:66',
      type: undefined,
      requestedIp: undefined,
      serverIdentifier: undefined,
    });
  });

  it('should parse DHCP options', () => {
    const data = new Uint8Array(250);
    const view = new DataView(data.buffer);

    // Basic fields
    view.setUint8(0, 1);
    view.setUint8(1, 1);
    view.setUint8(2, 6);
    view.setUint32(4, 0x12345678);

    // MAC address
    const mac = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66];
    mac.forEach((byte, i) => view.setUint8(28 + i, byte));

    // Options start at 240
    data[240] = DhcpOptions.MESSAGE_TYPE;
    data[241] = 1;
    data[242] = DhcpMessageTypes.DISCOVER;

    data[243] = DhcpOptionCodes.REQUESTED_IP;
    data[244] = 4;
    data[245] = 192;
    data[246] = 168;
    data[247] = 1;
    data[248] = 100;

    const result = parseDhcpMessage(data);

    expect(result).toEqual({
      op: 1,
      htype: 1,
      hlen: 6,
      xid: 0x12345678,
      mac: '11:22:33:44:55:66',
      type: 'DISCOVER',
      requestedIP: '192.168.1.100',
      serverIdentifier: undefined,
    });
  });
});

describe('serializeDhcpMessage', () => {
  it('should serialize basic DHCP message fields', () => {
    const params = {
      op: 2,
      type: DhcpMessageTypes.OFFER,
      xid: 0x12345678,
      yiaddr: '192.168.1.100',
      mac: '11:22:33:44:55:66',
    };

    const options: DhcpServerOptions = {
      serverIdentifier: '192.168.1.1',
      leaseDuration: 3600,
      netmask: '255.255.255.0',
      router: '192.168.1.1',
      leaseRange: { start: '192.168.1.100', end: '192.168.1.200' },
    };

    const result = serializeDhcpMessage(params, options);
    const view = new DataView(result.buffer);

    expect(view.getUint8(0)).toBe(2); // op
    expect(view.getUint8(1)).toBe(1); // htype
    expect(view.getUint8(2)).toBe(6); // hlen
    expect(view.getUint32(4)).toBe(0x12345678); // xid

    // Check MAC address
    const mac = Array.from(result.slice(28, 34))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(':');
    expect(mac).toBe('11:22:33:44:55:66');

    // Check DHCP magic cookie
    expect(view.getUint32(236)).toBe(0x63825363);

    // Check options
    expect(result[240]).toBe(DhcpOptions.MESSAGE_TYPE);
    expect(result[241]).toBe(1);
    expect(result[242]).toBe(DhcpMessageTypes.OFFER);
  });

  it('should serialize DHCP options with DNS servers', () => {
    const params = {
      op: 2,
      type: DhcpMessageTypes.OFFER,
      xid: 0x12345678,
      yiaddr: '192.168.1.100',
      mac: '11:22:33:44:55:66',
    };

    const options: DhcpServerOptions = {
      serverIdentifier: '192.168.1.1',
      leaseDuration: 3600,
      netmask: '255.255.255.0',
      router: '192.168.1.1',
      dnsServers: ['10.0.0.1', '10.0.0.2'],
      leaseRange: { start: '192.168.1.100', end: '192.168.1.200' },
    };

    const result = serializeDhcpMessage(params, options);

    // Find DNS servers option
    let offset = 240;
    while (
      offset < result.length &&
      result[offset] !== DhcpOptions.DNS_SERVERS
    ) {
      offset += 2 + result[offset + 1]!;
    }

    expect(result[offset]).toBe(DhcpOptions.DNS_SERVERS);
    expect(result[offset + 1]).toBe(8); // 2 IPs * 4 bytes
  });

  it('should serialize DHCP options with hostname and domain name', () => {
    const params = {
      op: 2,
      type: DhcpMessageTypes.OFFER,
      xid: 0x12345678,
      yiaddr: '192.168.1.100',
      mac: '11:22:33:44:55:66',
    };

    const options: DhcpServerOptions = {
      serverIdentifier: '192.168.1.1',
      leaseDuration: 3600,
      netmask: '255.255.255.0',
      router: '192.168.1.1',
      hostname: 'test-host',
      domainName: 'example.com',
      leaseRange: { start: '192.168.1.100', end: '192.168.1.200' },
    };

    const result = serializeDhcpMessage(params, options);

    // Find hostname option
    let offset = 240;
    while (offset < result.length && result[offset] !== DhcpOptions.HOSTNAME) {
      offset += 2 + result[offset + 1]!;
    }

    expect(result[offset]).toBe(DhcpOptions.HOSTNAME);
    expect(result[offset + 1]).toBe(9); // length of 'test-host'

    // Continue to find domain name option
    while (
      offset < result.length &&
      result[offset] !== DhcpOptions.DOMAIN_NAME
    ) {
      offset += 2 + result[offset + 1]!;
    }

    expect(result[offset]).toBe(DhcpOptions.DOMAIN_NAME);
    expect(result[offset + 1]).toBe(11); // length of 'example.com'
  });
});
