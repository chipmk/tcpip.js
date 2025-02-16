import { parseIPv4Address, serializeIPv4Address } from '@tcpip/wire';
import { DHCPMessageTypes, DHCPOptionCodes, DHCPOptions } from './constants.js';
import type {
  DHCPMessage,
  DHCPMessageParams,
  DHCPMessageType,
  DHCPOption,
  DHCPServerOptions,
} from './types.js';

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
        const ip = data.subarray(i + 2, i + 2 + 4);
        requestedIp = parseIPv4Address(ip);
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

  // Set message header fields
  view.setUint8(0, params.op);
  view.setUint8(1, 1);
  view.setUint8(2, 6);
  view.setUint32(4, params.xid);

  // Set yiaddr (your IP) field
  const ip = serializeIPv4Address(params.yiaddr);
  message.set(ip, 16);

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

  const serverIP = serializeIPv4Address(options.serverIdentifier);
  message.set(serverIP, offset);
  offset += 4;

  // Lease time
  message[offset++] = DHCPOptions.LEASE_TIME;
  message[offset++] = 4;
  view.setUint32(offset, options.leaseDuration!);
  offset += 4;

  // Subnet mask
  message[offset++] = DHCPOptions.SUBNET_MASK;
  message[offset++] = 4;
  const mask = serializeIPv4Address(options.subnetMask);
  message.set(mask, offset);
  offset += 4;

  // Router
  message[offset++] = DHCPOptions.ROUTER;
  message[offset++] = 4;
  const router = serializeIPv4Address(options.router);
  message.set(router, offset);
  offset += 4;

  // DNS Servers (if configured)
  if (options.dnsServers?.length) {
    message[offset++] = DHCPOptions.DNS_SERVERS;
    message[offset++] = 4 * options.dnsServers.length;
    for (const dnsServer of options.dnsServers) {
      const dnsIP = serializeIPv4Address(dnsServer);
      message.set(dnsIP, offset);
      offset += 4;
    }
  }

  // End option
  message[offset++] = DHCPOptions.END;

  return message.slice(0, offset);
}
