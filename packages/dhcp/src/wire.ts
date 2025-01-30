import { DHCPMessageTypes, DHCPOptionCodes, DHCPOptions } from './constants.js';
import type {
  DHCPMessage,
  DHCPMessageParams,
  DHCPMessageType,
  DHCPOption,
  DHCPServerOptions,
} from './types.js';
import { ipv4ToNumber, numberToIPv4 } from './util.js';

export function parseDHCPMessageType(type: number) {
  const [key] =
    Object.entries(DHCPMessageTypes).find(([, value]) => value === type) ?? [];

  if (!key) {
    throw new Error(`unknown dhcp message type: ${type}`);
  }

  return key as DHCPMessageType;
}

export function serializeDHCPMessageType(type: DHCPMessageType) {
  return DHCPMessageTypes[type];
}

export function parseDHCPOption(option: number) {
  const [key] =
    Object.entries(DHCPOptions).find(([, value]) => value === option) ?? [];

  if (!key) {
    throw new Error(`unknown dhcp option: ${option}`);
  }

  return key as DHCPOption;
}

export function serializeDHCPOption(option: DHCPOption) {
  return DHCPOptions[option];
}

export function parseDHCPMessage(data: Uint8Array): DHCPMessage {
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
  let type: DHCPMessageType | undefined;
  let requestedIp: string | undefined;
  let serverIdentifier: string | undefined;

  let i = 240; // Start of options section
  while (i < data.length) {
    const option = data[i];
    if (option === DHCPOptions.END) break;

    const len = data[i + 1]!;

    switch (option) {
      case DHCPOptions.MESSAGE_TYPE:
        type = parseDHCPMessageType(data[i + 2]!);
        break;
      case DHCPOptionCodes.REQUESTED_IP: {
        const ip = view.getUint32(i + 2);
        requestedIp = numberToIPv4(ip);
        break;
      }
      case DHCPOptionCodes.SERVER_ID:
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
    requestedIp,
    serverIdentifier,
  };
}

export function serializeDHCPMessage(
  params: DHCPMessageParams,
  options: DHCPServerOptions
): Uint8Array {
  const baseSize = 240;
  const optionsSize = 64 + (options.dnsServers?.length ?? 0) * 4;
  const message = new Uint8Array(baseSize + optionsSize);
  const view = new DataView(message.buffer);

  const textEncoder = new TextEncoder();

  // Set message header fields
  view.setUint8(0, params.op);
  view.setUint8(1, 1);
  view.setUint8(2, 6);
  view.setUint32(4, params.xid);

  // Set yiaddr (your IP) field
  const ip = ipv4ToNumber(params.yiaddr);
  view.setUint32(16, ip);

  // Set client MAC address
  const macBytes = params.mac.split(':').map((x: string) => parseInt(x, 16));
  for (let i = 0; i < 6; i++) {
    view.setUint8(28 + i, macBytes[i]!);
  }

  // Set DHCP magic cookie
  view.setUint32(236, 0x63825363);

  let offset = 240;

  // Message type option
  message[offset++] = DHCPOptions.MESSAGE_TYPE;
  message[offset++] = 1;
  message[offset++] = params.type;

  // Server identifier
  message[offset++] = DHCPOptions.SERVER_IDENTIFIER;
  message[offset++] = 4;

  const serverIP = ipv4ToNumber(options.serverIdentifier);
  view.setUint32(offset, serverIP);
  offset += 4;

  // Lease time
  message[offset++] = DHCPOptions.LEASE_TIME;
  message[offset++] = 4;
  view.setUint32(offset, options.leaseDuration!);
  offset += 4;

  // Subnet mask
  message[offset++] = DHCPOptions.SUBNET_MASK;
  message[offset++] = 4;
  const mask = ipv4ToNumber(options.subnetMask);
  view.setUint32(offset, mask);
  offset += 4;

  // Router
  message[offset++] = DHCPOptions.ROUTER;
  message[offset++] = 4;
  const router = ipv4ToNumber(options.router);
  view.setUint32(offset, router);
  offset += 4;

  // DNS Servers (if configured)
  if (options.dnsServers?.length) {
    message[offset++] = DHCPOptions.DNS_SERVERS;
    message[offset++] = 4 * options.dnsServers.length;
    for (const dnsServer of options.dnsServers) {
      const dnsIP = ipv4ToNumber(dnsServer);
      view.setUint32(offset, dnsIP);
      offset += 4;
    }
  }

  // Hostname (if configured)
  if (options.hostname) {
    const hostnameBytes = textEncoder.encode(options.hostname);
    message[offset++] = DHCPOptions.HOSTNAME;
    message[offset++] = hostnameBytes.length;
    message.set(hostnameBytes, offset);
    offset += hostnameBytes.length;
  }

  // Domain Name (if configured)
  if (options.domainName) {
    const domainBytes = textEncoder.encode(options.domainName);
    message[offset++] = DHCPOptions.DOMAIN_NAME;
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

    message[offset++] = DHCPOptions.DOMAIN_SEARCH;
    message[offset++] = totalLength;

    for (const domainBytes of encodedDomains) {
      message.set(domainBytes, offset);
      offset += domainBytes.length;
    }
  }

  // End option
  message[offset++] = DHCPOptions.END;

  return message.slice(0, offset);
}
