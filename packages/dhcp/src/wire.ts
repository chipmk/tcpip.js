import {
  parseIPv4Address,
  serializeIPv4Address,
  serializeMacAddress,
} from '@tcpip/wire';
import { DhcpMessageTypes, DhcpOptionCodes, DhcpOptions } from './constants.js';
import type { DhcpServerOptions } from './dhcp-server.js';
import type {
  DhcpMessage,
  DhcpMessageParams,
  DhcpMessageType,
  DhcpOption,
} from './types.js';

export function parseDhcpMessageType(type: number) {
  const [key] =
    Object.entries(DhcpMessageTypes).find(([, value]) => value === type) ?? [];

  if (!key) {
    throw new Error(`unknown dhcp message type: ${type}`);
  }

  return key as DhcpMessageType;
}

export function serializeDhcpMessageType(type: DhcpMessageType) {
  return DhcpMessageTypes[type];
}

export function parseDhcpOption(option: number) {
  const [key] =
    Object.entries(DhcpOptions).find(([, value]) => value === option) ?? [];

  if (!key) {
    throw new Error(`unknown dhcp option: ${option}`);
  }

  return key as DhcpOption;
}

export function serializeDhcpOption(option: DhcpOption) {
  return DhcpOptions[option];
}

export function parseDhcpMessage(data: Uint8Array): DhcpMessage {
  if (data.length < 240) {
    throw new Error('dhcp message too short');
  }

  const view = new DataView(data.buffer);

  const op = view.getUint8(0);
  const htype = view.getUint8(1);
  const hlen = view.getUint8(2);
  const xid = view.getUint32(4);

  // Get the client's MAC address from the chaddr field
  const macBytes = new Uint8Array(data.buffer, 28, 6);
  const mac = Array.from(macBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(':');

  // Parse DHCP options section
  let type: DhcpMessageType | undefined;
  let requestedIp: string | undefined;
  let serverIdentifier: string | undefined;

  let i = 240; // Start of options section
  while (i < data.length) {
    const option = data[i];
    if (option === DhcpOptions.END) break;

    const len = data[i + 1]!;

    switch (option) {
      case DhcpOptions.MESSAGE_TYPE:
        type = parseDhcpMessageType(data[i + 2]!);
        break;
      case DhcpOptionCodes.REQUESTED_IP: {
        const ip = data.subarray(i + 2, i + 2 + 4);
        requestedIp = parseIPv4Address(ip);
        break;
      }
      case DhcpOptionCodes.SERVER_ID:
        serverIdentifier = Array.from(data.slice(i + 2, i + 2 + 4)).join('.');
        break;
    }

    i += len + 2; // Move to next option
  }

  return {
    op,
    htype,
    hlen,
    xid,
    mac,
    type,
    requestedIP: requestedIp,
    serverIdentifier,
  };
}

export function serializeDhcpMessage(
  params: DhcpMessageParams,
  options: DhcpServerOptions
): Uint8Array {
  const baseSize = 240;
  const optionsSize = 64 + (options.dnsServers?.length ?? 0) * 4;
  const message = new Uint8Array(baseSize + optionsSize);
  const view = new DataView(message.buffer);

  const textEncoder = new TextEncoder();

  // Set message header fields
  view.setUint8(0, params.op);
  view.setUint8(1, 1); // Hardware type (Ethernet)
  view.setUint8(2, 6); // Hardware address length (MAC)
  view.setUint32(4, params.xid);

  // Set yiaddr (your IP) field
  const ip = serializeIPv4Address(params.yiaddr);
  message.set(ip, 16);

  // Set client MAC address
  const macBytes = serializeMacAddress(params.mac);
  message.set(macBytes, 28);

  // Set DHCP magic cookie
  view.setUint32(236, 0x63825363);

  let offset = 240;

  // Message type option
  message[offset++] = DhcpOptions.MESSAGE_TYPE;
  message[offset++] = 1;
  message[offset++] = params.type;

  // Server identifier
  message[offset++] = DhcpOptions.SERVER_IDENTIFIER;
  message[offset++] = 4;

  const serverIP = serializeIPv4Address(options.serverIdentifier);
  message.set(serverIP, offset);
  offset += 4;

  // Lease time
  message[offset++] = DhcpOptions.LEASE_TIME;
  message[offset++] = 4;
  view.setUint32(offset, options.leaseDuration!);
  offset += 4;

  // Subnet mask
  message[offset++] = DhcpOptions.SUBNET_MASK;
  message[offset++] = 4;
  const mask = serializeIPv4Address(options.netmask);
  message.set(mask, offset);
  offset += 4;

  // Router
  message[offset++] = DhcpOptions.ROUTER;
  message[offset++] = 4;
  const router = serializeIPv4Address(options.router);
  message.set(router, offset);
  offset += 4;

  // DNS Servers (if configured)
  if (options.dnsServers?.length) {
    message[offset++] = DhcpOptions.DNS_SERVERS;
    message[offset++] = 4 * options.dnsServers.length;
    for (const dnsServer of options.dnsServers) {
      const dnsIP = serializeIPv4Address(dnsServer);
      message.set(dnsIP, offset);
      offset += 4;
    }
  }

  // Hostname (if configured)
  if (options.hostname) {
    const hostnameBytes = textEncoder.encode(options.hostname);
    message[offset++] = DhcpOptions.HOSTNAME;
    message[offset++] = hostnameBytes.length;
    message.set(hostnameBytes, offset);
    offset += hostnameBytes.length;
  }

  // Domain Name (if configured)
  if (options.domainName) {
    const domainBytes = textEncoder.encode(options.domainName);
    message[offset++] = DhcpOptions.DOMAIN_NAME;
    message[offset++] = domainBytes.length;
    message.set(domainBytes, offset);
    offset += domainBytes.length;
  }

  // Domain Search (if configured)
  if (options.searchDomains?.length) {
    // Calculate total length including length bytes for each domain
    const encodedDomains = options.searchDomains.map((domain) => {
      const labels = domain.split('.');
      const bytes: number[] = [];
      for (const label of labels) {
        bytes.push(label.length);
        bytes.push(...textEncoder.encode(label));
      }
      bytes.push(0); // Root label
      return bytes;
    });

    const totalLength = encodedDomains.reduce(
      (sum, domain) => sum + domain.length,
      0
    );

    message[offset++] = DhcpOptions.DOMAIN_SEARCH;
    message[offset++] = totalLength;

    for (const domainBytes of encodedDomains) {
      message.set(domainBytes, offset);
      offset += domainBytes.length;
    }
  }

  // End option
  message[offset++] = DhcpOptions.END;

  return message.slice(0, offset);
}
