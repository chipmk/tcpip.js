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
} as const;

export const RCode = {
  NOERROR: 0, // No error
  SERVFAIL: 2, // Server failure
  NXDOMAIN: 3, // Non-existent domain
} as const;
