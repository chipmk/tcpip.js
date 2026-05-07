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

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const op = view.getUint8(0);
  const htype = view.getUint8(1);
  const hlen = view.getUint8(2);
  const xid = view.getUint32(4);
  const ciaddr = parseIPv4Address(data.subarray(12, 16));
  const yiaddr = parseIPv4Address(data.subarray(16, 20));

  // Get the client's MAC address from the chaddr field
  const macBytes = data.subarray(28, 34);
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
    if (option === 0) {
      i += 1;
      continue;
    }

    if (i + 1 >= data.length) {
      throw new Error('truncated dhcp option');
    }

    const len = data[i + 1]!;
    const valueOffset = i + 2;
    const nextOptionOffset = valueOffset + len;

    if (nextOptionOffset > data.length) {
      throw new Error('truncated dhcp option');
    }

    switch (option) {
      case DhcpOptions.MESSAGE_TYPE:
        if (len !== 1) {
          throw new Error('invalid dhcp message type option length');
        }
        type = parseDhcpMessageType(data[valueOffset]!);
        break;
      case DhcpOptionCodes.REQUESTED_IP: {
        if (len !== 4) {
          throw new Error('invalid dhcp requested ip option length');
        }
        const ip = data.subarray(valueOffset, nextOptionOffset);
        requestedIp = parseIPv4Address(ip);
        break;
      }
      case DhcpOptionCodes.SERVER_ID:
        if (len !== 4) {
          throw new Error('invalid dhcp server identifier option length');
        }
        serverIdentifier = parseIPv4Address(
          data.subarray(valueOffset, nextOptionOffset)
        );
        break;
    }

    i += len + 2; // Move to next option
  }

  return {
    op,
    htype,
    hlen,
    xid,
    ciaddr,
    yiaddr,
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
  const textEncoder = new TextEncoder();
  const hostnameBytes = options.hostname
    ? textEncoder.encode(options.hostname)
    : undefined;
  const domainBytes = options.domainName
    ? textEncoder.encode(options.domainName)
    : undefined;
  const encodedSearchDomains = options.searchDomains?.map((domain) => {
    const labels = domain.split('.');
    const bytes: number[] = [];
    for (const label of labels) {
      const labelBytes = textEncoder.encode(label);
      bytes.push(labelBytes.length);
      bytes.push(...labelBytes);
    }
    bytes.push(0); // Root label
    return bytes;
  });
  const searchDomainsSize =
    encodedSearchDomains?.reduce((sum, domain) => sum + domain.length, 0) ?? 0;
  const optionsSize =
    3 + // message type
    6 + // server identifier
    6 + // lease time
    6 + // subnet mask
    6 + // router
    (options.dnsServers?.length ? 2 + options.dnsServers.length * 4 : 0) +
    (hostnameBytes ? 2 + hostnameBytes.length : 0) +
    (domainBytes ? 2 + domainBytes.length : 0) +
    (searchDomainsSize ? 2 + searchDomainsSize : 0) +
    1; // end
  const message = new Uint8Array(baseSize + optionsSize);
  const view = new DataView(message.buffer);

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
  if (hostnameBytes) {
    message[offset++] = DhcpOptions.HOSTNAME;
    message[offset++] = hostnameBytes.length;
    message.set(hostnameBytes, offset);
    offset += hostnameBytes.length;
  }

  // Domain Name (if configured)
  if (domainBytes) {
    message[offset++] = DhcpOptions.DOMAIN_NAME;
    message[offset++] = domainBytes.length;
    message.set(domainBytes, offset);
    offset += domainBytes.length;
  }

  // Domain Search (if configured)
  if (encodedSearchDomains?.length && searchDomainsSize > 0) {
    message[offset++] = DhcpOptions.DOMAIN_SEARCH;
    message[offset++] = searchDomainsSize;

    for (const domainBytes of encodedSearchDomains) {
      message.set(domainBytes, offset);
      offset += domainBytes.length;
    }
  }

  // End option
  message[offset++] = DhcpOptions.END;

  return message.slice(0, offset);
}
