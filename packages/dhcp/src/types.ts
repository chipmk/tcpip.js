import type { NetworkStack } from 'tcpip';
import type { DHCPMessageTypes, DHCPOptions } from './constants.js';

export type DHCPMessageType = keyof typeof DHCPMessageTypes;
export type DHCPOption = keyof typeof DHCPOptions;

export type DHCPLease = {
  ip: string;
  mac: string;
  expiresAt: number;
};

export type DHCPMessageParams = {
  op: number;
  xid: number;
  yiaddr: string;
  mac: string;
  type: number;
};

export type DHCPMessage = {
  op: number;
  htype: number;
  hlen: number;
  xid: number;
  mac: string;
  type?: DHCPMessageType;
  requestedIp?: string;
  serverIdentifier?: string;
};

export type DHCPServerOptions = {
  /**
   * `tcpip` network stack to use.
   */
  stack: NetworkStack;

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
  subnetMask: string;

  /**
   * IP address of the router to assign to clients.
   */
  router: string;

  /**
   * IP addresses of DNS servers to assign to clients.
   */
  dnsServers?: string[];
};
