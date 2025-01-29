import type { UdpDatagram, UdpSocket } from 'tcpip';
import {
  DHCP_CLIENT_PORT,
  DHCP_SERVER_PORT,
  DHCPMessageTypes,
} from './constants.js';
import type { DHCPLease, DHCPMessage, DHCPServerOptions } from './types.js';
import { ipv4ToNumber, numberToIPv4 } from './util.js';
import { parseDHCPMessage, serializeDHCPMessage } from './wire.js';

export async function createDHCPServer(options: DHCPServerOptions) {
  const server = new DHCPServer(options);
  await server.listen();
  return server;
}

export class DHCPServer {
  leases = new Map<string, DHCPLease>();

  #options: DHCPServerOptions;

  constructor(options: DHCPServerOptions) {
    this.#options = {
      leaseDuration: 86400,
      ...options,
    };
  }

  async listen() {
    const socket = await this.#options.stack.openUdp({
      port: DHCP_SERVER_PORT,
    });
    this.#processDHCPMessages(socket);
  }

  async #processDHCPMessages(socket: UdpSocket) {
    const writer = socket.writable.getWriter();

    for await (const datagram of socket) {
      // Process each message without blocking
      this.#processDHCPMessage(datagram, writer);
    }
  }

  async #processDHCPMessage(
    datagram: UdpDatagram,
    writer: WritableStreamDefaultWriter<UdpDatagram>
  ) {
    try {
      const reply = this.#handleDHCPMessage(datagram.data);
      if (reply) {
        await writer.write(reply);
      }
    } catch (err) {
      console.error('error processing DHCP message:', err);
    }
  }

  #handleDHCPMessage(data: Uint8Array) {
    const message = parseDHCPMessage(data);

    switch (message.type) {
      case 'DISCOVER':
        return this.#handleDiscover(message);
      case 'REQUEST':
        return this.#handleRequest(message);
      case 'RELEASE':
        return this.#handleRelease(message);
      default:
        throw new Error(
          `received unsupported DHCP client message type: ${message.type}`
        );
    }
  }

  #findAvailableIP(mac: string) {
    const existingLease = this.leases.get(mac);
    if (existingLease && existingLease.expiresAt > Date.now()) {
      return existingLease.ip;
    }

    const start = ipv4ToNumber(this.#options.leaseRange.start);
    const end = ipv4ToNumber(this.#options.leaseRange.end);

    const usedIPs = new Set(
      Array.from(this.leases.values()).map((lease) => lease.ip)
    );

    for (let i = start; i <= end; i++) {
      const ip = numberToIPv4(i);
      if (!usedIPs.has(ip)) {
        return ip;
      }
    }
  }

  #handleDiscover(message: DHCPMessage): UdpDatagram {
    const ip = this.#findAvailableIP(message.mac);
    if (!ip) {
      return this.#createNak(message);
    }

    const offer = serializeDHCPMessage(
      {
        op: 2,
        xid: message.xid,
        yiaddr: ip,
        mac: message.mac,
        type: DHCPMessageTypes.OFFER,
      },
      this.#options
    );

    return {
      host: '255.255.255.255',
      port: DHCP_CLIENT_PORT,
      data: offer,
    };
  }

  #handleRequest(message: DHCPMessage): UdpDatagram | undefined {
    // Determine if this is a response to our offer or a direct request
    const isResponseToOffer =
      message.serverIdentifier === this.#options.serverIdentifier;

    let assignedIp: string | undefined = undefined;

    if (isResponseToOffer) {
      // Client is accepting our offer
      assignedIp = this.#findAvailableIP(message.mac);
      if (!assignedIp) {
        return this.#createNak(message);
      }
    } else if (message.requestedIp) {
      // Client is requesting a specific IP
      const canUseRequestedIp = this.#canUseRequestedIP(
        message.requestedIp,
        message.mac
      );
      if (canUseRequestedIp) {
        assignedIp = message.requestedIp;
      } else {
        return this.#createNak(message);
      }
    } else {
      // Malformed REQUEST - no way to know what IP to assign
      return this.#createNak(message);
    }

    // If we got here, we have a valid IP to assign
    this.leases.set(message.mac, {
      ip: assignedIp,
      mac: message.mac,
      expiresAt: Date.now() + this.#options.leaseDuration! * 1000,
    });

    const ack = serializeDHCPMessage(
      {
        op: 2,
        xid: message.xid,
        yiaddr: assignedIp,
        mac: message.mac,
        type: DHCPMessageTypes.ACK,
      },
      this.#options
    );

    return {
      host: '255.255.255.255',
      port: DHCP_CLIENT_PORT,
      data: ack,
    };
  }

  #handleRelease(message: DHCPMessage) {
    this.leases.delete(message.mac);
  }

  #createNak(message: DHCPMessage): UdpDatagram {
    const nak = serializeDHCPMessage(
      {
        op: 2,
        xid: message.xid,
        yiaddr: '0.0.0.0', // No IP assigned in NAK
        mac: message.mac,
        type: DHCPMessageTypes.NAK,
      },
      this.#options
    );

    return {
      host: '255.255.255.255',
      port: DHCP_CLIENT_PORT,
      data: nak,
    };
  }

  #canUseRequestedIP(requestedIp: string, clientMac: string): boolean {
    // Check if IP is in our range
    const ipNum = ipv4ToNumber(requestedIp);
    const rangeStart = ipv4ToNumber(this.#options.leaseRange.start);
    const rangeEnd = ipv4ToNumber(this.#options.leaseRange.end);

    if (ipNum < rangeStart || ipNum > rangeEnd) {
      return false;
    }

    // Check if IP is in use by another client
    for (const [mac, lease] of this.leases.entries()) {
      if (lease.ip === requestedIp) {
        // IP is in use, but check if it's by this same client
        return mac === clientMac && lease.expiresAt > Date.now();
      }
    }

    // IP is in our range and not in use
    return true;
  }
}
