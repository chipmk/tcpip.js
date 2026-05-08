export class HttpProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HttpProtocolError';
  }
}

export function unsupportedProtocol(protocol: string) {
  return new TypeError(`unsupported protocol: ${protocol}`);
}
