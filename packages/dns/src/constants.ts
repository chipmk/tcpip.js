export const TypeCode = {
  A: 1, // IPv4
  NS: 2, // Nameserver
  CNAME: 5, // Canonical name
  SOA: 6, // Start of authority
  PTR: 12, // Pointer
  MX: 15, // Mail exchange
  TXT: 16, // Text
  AAAA: 28, // IPv6
  SRV: 33, // Service locator
  ANY: 255, // Any
} as const;

export const ClassCode = {
  IN: 1, // Internet
} as const;

export const OpCode = {
  QUERY: 0, // Standard query
  IQUERY: 1, // Inverse query
  STATUS: 2, // Server status request
  NOTIFY: 4, // Notify
  UPDATE: 5, // Update
} as const;

export const RCode = {
  NOERROR: 0, // No error
  FORMERR: 1, // Format error
  SERVFAIL: 2, // Server failure
  NXDOMAIN: 3, // Non-existent domain
  NOTIMP: 4, // Not implemented
  REFUSED: 5, // Query refused
} as const;
