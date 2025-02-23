import type { DhcpMessageTypes, DhcpOptions } from './constants.js';

export type DhcpMessageType = keyof typeof DhcpMessageTypes;
export type DhcpOption = keyof typeof DhcpOptions;

export type DhcpLease = {
  ip: string;
  mac: string;
  expiresAt: number;
};

export type DhcpMessageParams = {
  op: number;
  xid: number;
  yiaddr: string;
  mac: string;
  type: number;
};

export type DhcpMessage = {
  op: number;
  htype: number;
  hlen: number;
  xid: number;
  mac: string;
  type?: DhcpMessageType;
  requestedIP?: string;
  serverIdentifier?: string;
};
