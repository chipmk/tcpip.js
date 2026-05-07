import type { NetworkStack, UdpDatagram, UdpSocket } from 'tcpip/types';
import {
  DHCP_CLIENT_PORT,
  DHCP_SERVER_PORT,
  DhcpMessageTypes,
} from './constants.js';
import type { DhcpLease, DhcpMessage } from './types.js';
import { ipv4ToNumber, numberToIPv4 } from './util.js';
import { parseDhcpMessage, serializeDhcpMessage } from './wire.js';

const OFFER_DURATION_MS = 60_000;

export type DhcpServerOptions = {
  /**
   * Range of IP addresses to lease.
   */
  leaseRange: {
    start: string;
    end: string;
  };

  /**
   * Duration of a lease in seconds.
   */
  leaseDuration?: number;

  /**
   * IP address of the DHCP server.
   */
  serverIdentifier: string;

  /**
   * Subnet mask to assign to clients.
   */
  netmask: string;

  /**
   * IP address of the router to assign to clients.
   */
  router: string;

  /**
   * Hostname to assign to clients
   */
  hostname?: string;

  /**
   * Domain name to assign to clients (e.g. `"example.com"`)
   */
  domainName?: string;

  /**
   * List of DNS search domains (e.g. `["eng.example.com", "example.com"]`)
   */
  searchDomains?: string[];

  /**
   * IP addresses of DNS servers to assign to clients.
   */
  dnsServers?: string[];
};

export class DhcpServer {
  #stack: NetworkStack;
  #options: DhcpServerOptions;

  leases = new Map<string, DhcpLease>();
  #offers = new Map<string, DhcpLease>();

  constructor(stack: NetworkStack, options: DhcpServerOptions) {
    this.#stack = stack;
    this.#options = {
      leaseDuration: 86400,
      ...options,
    };
  }

  async listen() {
    const socket = await this.#stack.openUdp({
      port: DHCP_SERVER_PORT,
    });
    this.#processDhcpMessages(socket);
  }

  async #processDhcpMessages(socket: UdpSocket) {
    const writer = socket.writable.getWriter();

    for await (const datagram of socket) {
      // Process each message without blocking
      this.#processDhcpMessage(datagram, writer);
    }
  }

  async #processDhcpMessage(
    datagram: UdpDatagram,
    writer: WritableStreamDefaultWriter<UdpDatagram>
  ) {
    try {
      const reply = this.#handleDhcpMessage(datagram.data);
      if (reply) {
        await writer.write(reply);
      }
    } catch (err) {
      console.error('error processing dhcp message:', err);
    }
  }

  #handleDhcpMessage(data: Uint8Array) {
    const message = parseDhcpMessage(data);

    switch (message.type) {
      case 'DISCOVER':
        return this.#handleDiscover(message);
      case 'REQUEST':
        return this.#handleRequest(message);
      case 'RELEASE':
        return this.#handleRelease(message);
      default:
        throw new Error(
          `received unsupported dhcp client message type: ${message.type}`
        );
    }
  }

  #findAvailableIP(mac: string) {
    this.#deleteExpiredAllocations();

    const existingLease = this.leases.get(mac);
    if (existingLease && existingLease.expiresAt > Date.now()) {
      return existingLease.ip;
    }

    const existingOffer = this.#offers.get(mac);
    if (existingOffer && existingOffer.expiresAt > Date.now()) {
      return existingOffer.ip;
    }

    const start = ipv4ToNumber(this.#options.leaseRange.start);
    const end = ipv4ToNumber(this.#options.leaseRange.end);

    const usedIPs = new Set(
      [...this.leases.values(), ...this.#offers.values()].map(
        (lease) => lease.ip
      )
    );

    for (let i = start; i <= end; i++) {
      const ip = numberToIPv4(i);
      if (!usedIPs.has(ip)) {
        return ip;
      }
    }
  }

  #handleDiscover(message: DhcpMessage): UdpDatagram | undefined {
    const ip = this.#findAvailableIP(message.mac);
    if (!ip) {
      return;
    }

    this.#offers.set(message.mac, {
      ip,
      mac: message.mac,
      expiresAt: Date.now() + OFFER_DURATION_MS,
    });

    const offer = serializeDhcpMessage(
      {
        op: 2,
        xid: message.xid,
        yiaddr: ip,
        mac: message.mac,
        type: DhcpMessageTypes.OFFER,
      },
      this.#options
    );

    return {
      host: '255.255.255.255',
      port: DHCP_CLIENT_PORT,
      data: offer,
    };
  }

  #handleRequest(message: DhcpMessage): UdpDatagram | undefined {
    this.#deleteExpiredAllocations();

    if (
      message.serverIdentifier &&
      message.serverIdentifier !== this.#options.serverIdentifier
    ) {
      return;
    }

    const requestedIP =
      message.requestedIP ??
      (message.ciaddr !== '0.0.0.0' ? message.ciaddr : undefined);

    if (!requestedIP) {
      return this.#createNak(message);
    }

    const canUseRequestedIP = this.#canUseRequestedIP(requestedIP, message.mac);
    if (canUseRequestedIP) {
      this.leases.set(message.mac, {
        ip: requestedIP,
        mac: message.mac,
        expiresAt: Date.now() + this.#options.leaseDuration! * 1000,
      });
      this.#offers.delete(message.mac);
    } else {
      this.#offers.delete(message.mac);
      return this.#createNak(message);
    }

    const ack = serializeDhcpMessage(
      {
        op: 2,
        xid: message.xid,
        yiaddr: requestedIP,
        mac: message.mac,
        type: DhcpMessageTypes.ACK,
      },
      this.#options
    );

    return {
      host: '255.255.255.255',
      port: DHCP_CLIENT_PORT,
      data: ack,
    };
  }

  #handleRelease(message: DhcpMessage) {
    this.leases.delete(message.mac);
    this.#offers.delete(message.mac);
  }

  #createNak(message: DhcpMessage): UdpDatagram {
    const nak = serializeDhcpMessage(
      {
        op: 2,
        xid: message.xid,
        yiaddr: '0.0.0.0', // No IP assigned in NAK
        mac: message.mac,
        type: DhcpMessageTypes.NAK,
      },
      this.#options
    );

    return {
      host: '255.255.255.255',
      port: DHCP_CLIENT_PORT,
      data: nak,
    };
  }

  #canUseRequestedIP(requestedIP: string, clientMac: string): boolean {
    // Check if IP is in our range
    const ipNum = ipv4ToNumber(requestedIP);
    const rangeStart = ipv4ToNumber(this.#options.leaseRange.start);
    const rangeEnd = ipv4ToNumber(this.#options.leaseRange.end);

    if (ipNum < rangeStart || ipNum > rangeEnd) {
      return false;
    }

    // Check if IP is in use by another client
    for (const [mac, lease] of [
      ...this.leases.entries(),
      ...this.#offers.entries(),
    ]) {
      if (lease.ip === requestedIP) {
        // IP is in use, but check if it's by this same client
        return mac === clientMac && lease.expiresAt > Date.now();
      }
    }

    // IP is in our range and not in use
    return true;
  }

  #deleteExpiredAllocations() {
    const now = Date.now();
    for (const [mac, lease] of this.leases.entries()) {
      if (lease.expiresAt <= now) {
        this.leases.delete(mac);
      }
    }
    for (const [mac, offer] of this.#offers.entries()) {
      if (offer.expiresAt <= now) {
        this.#offers.delete(mac);
      }
    }
  }
}
