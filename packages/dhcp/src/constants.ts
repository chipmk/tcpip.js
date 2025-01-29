export const DHCP_SERVER_PORT = 67;
export const DHCP_CLIENT_PORT = 68;

// DHCP message types as per RFC 2132
export const DHCPMessageTypes = {
  DISCOVER: 1,
  OFFER: 2,
  REQUEST: 3,
  DECLINE: 4,
  ACK: 5,
  NAK: 6,
  RELEASE: 7,
  INFORM: 8,
} as const;

// DHCP options codes as per RFC 2132
export const DHCPOptions = {
  SUBNET_MASK: 1,
  ROUTER: 3,
  DNS_SERVERS: 6,
  MESSAGE_TYPE: 53,
  SERVER_IDENTIFIER: 54,
  LEASE_TIME: 51,
  END: 255,
} as const;

export const DHCPOptionCodes = {
  REQUESTED_IP: 50,
  CLIENT_ID: 61,
  SERVER_ID: 54,
} as const;
