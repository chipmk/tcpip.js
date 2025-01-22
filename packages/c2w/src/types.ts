export interface DuplexStream<T = unknown> {
  readable: ReadableStream<T>;
  writable: WritableStream<T>;
}
