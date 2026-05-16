import type { IPv4Address, IPv4Cidr, MacAddress } from '@tcpip/wire';

export type DuplexStream<R = unknown> = {
  readable: ReadableStream<R>;
  writable: WritableStream<R>;
};

export type UdpDatagram = {
  host: string;
  port: number;
  data: Uint8Array;
};

export type UdpSocketOptions = {
  /**
   * The local host to bind to.
   *
   * If not provided, the socket will bind to all available interfaces.
   */
  host?: string;
  /**
   * The local port to bind to.
   *
   * If not provided, the socket will bind to a random port.
   */
  port?: number;
};

export type UdpSocket = {
  readable: ReadableStream<UdpDatagram>;
  writable: WritableStream<UdpDatagram>;
  close(): Promise<void>;
  [Symbol.asyncIterator](): AsyncIterator<UdpDatagram>;
};

export type TcpListenerOptions = {
  host?: string;
  port: number;
};

export type TcpConnectionOptions = {
  host: string;
  port: number;
};

export type TcpConnection = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array>;
};

export type PingSessionOptions = {
  host: string;
  timeout?: number;
};

export type PingProbeOptions = {
  timeout?: number;
  payload?: Uint8Array;
};

export type PingReply = {
  host: string;
  identifier: number;
  sequenceNumber: number;
  payload: Uint8Array;
  roundTripTime: number;
};

export type PingSession = {
  readonly host: string;
  readonly identifier: number;
  ping(options?: PingProbeOptions): Promise<PingReply>;
  close(): Promise<void>;
};

export type TcpListener = {
  [Symbol.asyncIterator](): AsyncIterableIterator<TcpConnection>;
};

export type LoopbackInterfaceOptions = {
  ip?: IPv4Cidr;
};

export type LoopbackInterface = {
  readonly type: 'loopback';
  readonly ip?: IPv4Address;
  readonly netmask?: IPv4Address;
};

export type TunInterfaceOptions = {
  ip?: IPv4Cidr;
};

export type TunInterface = {
  readonly type: 'tun';
  readonly ip?: IPv4Address;
  readonly netmask?: IPv4Address;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  listen(): AsyncIterableIterator<Uint8Array>;
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
};

export type TapInterfaceOptions = {
  mac?: MacAddress;
  ip?: IPv4Cidr;
};

export type TapInterface = {
  readonly type: 'tap';
  readonly mac: MacAddress;
  readonly ip?: IPv4Address;
  readonly netmask?: IPv4Address;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  listen(): AsyncIterableIterator<Uint8Array>;
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
};

export type BridgeInterfaceOptions = {
  ports: TapInterface[];
  mac?: MacAddress;
  ip?: IPv4Cidr;
};

export type BridgeInterface = {
  readonly type: 'bridge';
  readonly mac: MacAddress;
  readonly ip?: IPv4Address;
  readonly netmask?: IPv4Address;
};

export type NetworkInterface =
  | LoopbackInterface
  | TunInterface
  | TapInterface
  | BridgeInterface;

export type NetworkStack = {
  readonly ready: Promise<void>;
  readonly interfaces: Iterable<NetworkInterface>;

  createLoopbackInterface(
    options: LoopbackInterfaceOptions
  ): Promise<LoopbackInterface>;
  createTunInterface(options: TunInterfaceOptions): Promise<TunInterface>;
  createTapInterface(options?: TapInterfaceOptions): Promise<TapInterface>;
  createBridgeInterface(
    options: BridgeInterfaceOptions
  ): Promise<BridgeInterface>;
  removeInterface(
    netInterface: LoopbackInterface | TunInterface | TapInterface
  ): Promise<void>;
  /**
   * Listens for incoming TCP connections on the specified host/port.
   */
  listenTcp(options: TcpListenerOptions): Promise<TcpListener>;
  /**
   * Establishes an outbound TCP connection to a remote host/port.
   */
  connectTcp(options: TcpConnectionOptions): Promise<TcpConnection>;
  /**
   * Opens a UDP socket for sending and receiving datagrams.
   *
   * If no local host is provided, the socket will bind to all available interfaces.
   * If no local port is provided, the socket will bind to a random port.
   */
  openUdp(options?: UdpSocketOptions): Promise<UdpSocket>;
  /**
   * Creates an ICMP ping session for sending echo requests to a host.
   */
  createPingSession(options: PingSessionOptions): Promise<PingSession>;
};
