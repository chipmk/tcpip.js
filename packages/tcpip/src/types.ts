import type {
  Datagram,
  DatagramSocketOptions,
  DuplexStream,
  StreamConnectOptions,
  StreamListenOptions,
} from '@tcpip/transport';
import type { IPv4Address, IPv4Cidr, MacAddress } from '@tcpip/wire';

export type UdpDatagram = Datagram;

export type UdpSocketOptions = DatagramSocketOptions;

export type UdpSocket = DuplexStream<UdpDatagram> & {
  close(): Promise<void>;
  [Symbol.asyncIterator](): AsyncIterator<UdpDatagram>;
};

export type TcpListenerOptions = StreamListenOptions;

export type TcpConnectionOptions = StreamConnectOptions;

export type TcpConnection = DuplexStream<Uint8Array> & {
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

export type TcpTransport = {
  /**
   * Establishes an outbound TCP connection to a remote host/port.
   */
  connect(options: TcpConnectionOptions): Promise<TcpConnection>;
  /**
   * Listens for incoming TCP connections on the specified host/port.
   */
  listen(options: TcpListenerOptions): Promise<TcpListener>;
};

export type UdpTransport = {
  /**
   * Opens a UDP socket for sending and receiving datagrams.
   *
   * If no local host is provided, the socket will bind to all available interfaces.
   * If no local port is provided, the socket will bind to a random port.
   */
  open(options?: UdpSocketOptions): Promise<UdpSocket>;
};

export type PingApi = {
  /**
   * Creates an ICMP ping session for sending echo requests to a host.
   */
  createSession(options: PingSessionOptions): Promise<PingSession>;
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

export type NetworkInterfaces = Iterable<NetworkInterface> & {
  createLoopback(options: LoopbackInterfaceOptions): Promise<LoopbackInterface>;
  createTun(options: TunInterfaceOptions): Promise<TunInterface>;
  createTap(options?: TapInterfaceOptions): Promise<TapInterface>;
  createBridge(options: BridgeInterfaceOptions): Promise<BridgeInterface>;
  remove(netInterface: NetworkInterface): Promise<void>;
};

export type NetworkStack = {
  readonly ready: Promise<void>;
  readonly tcp: TcpTransport;
  readonly udp: UdpTransport;
  readonly ping: PingApi;
  readonly interfaces: NetworkInterfaces;

  /**
   * @deprecated Use `stack.interfaces.createLoopback()` instead.
   */
  createLoopbackInterface(
    options: LoopbackInterfaceOptions
  ): Promise<LoopbackInterface>;
  /**
   * @deprecated Use `stack.interfaces.createTun()` instead.
   */
  createTunInterface(options: TunInterfaceOptions): Promise<TunInterface>;
  /**
   * @deprecated Use `stack.interfaces.createTap()` instead.
   */
  createTapInterface(options?: TapInterfaceOptions): Promise<TapInterface>;
  /**
   * @deprecated Use `stack.interfaces.createBridge()` instead.
   */
  createBridgeInterface(
    options: BridgeInterfaceOptions
  ): Promise<BridgeInterface>;
  /**
   * @deprecated Use `stack.interfaces.remove()` instead.
   */
  removeInterface(netInterface: NetworkInterface): Promise<void>;
  /**
   * Listens for incoming TCP connections on the specified host/port.
   *
   * @deprecated Use `stack.tcp.listen()` instead.
   */
  listenTcp(options: TcpListenerOptions): Promise<TcpListener>;
  /**
   * Establishes an outbound TCP connection to a remote host/port.
   *
   * @deprecated Use `stack.tcp.connect()` instead.
   */
  connectTcp(options: TcpConnectionOptions): Promise<TcpConnection>;
  /**
   * Opens a UDP socket for sending and receiving datagrams.
   *
   * If no local host is provided, the socket will bind to all available interfaces.
   * If no local port is provided, the socket will bind to a random port.
   *
   * @deprecated Use `stack.udp.open()` instead.
   */
  openUdp(options?: UdpSocketOptions): Promise<UdpSocket>;
  /**
   * Creates an ICMP ping session for sending echo requests to a host.
   *
   * @deprecated Use `stack.ping.createSession()` instead.
   */
  createPingSession(options: PingSessionOptions): Promise<PingSession>;
};
