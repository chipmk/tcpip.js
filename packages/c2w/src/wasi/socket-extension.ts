import { WASI, wasi as WasiDefs } from '@bjorn3/browser_wasi_shim';

export type WasiSocketOptions = {
  listenFd: number;
  connectionFd: number;
  stdin: {
    read(len: number): Uint8Array;
    hasData(): boolean;
    waitForData(timeout?: number): boolean;
  };
  stdout: {
    write(data: Uint8Array): void;
  };
  stderr: {
    write(data: Uint8Array): void;
  };
  net: {
    accept(): boolean;
    send(data: Uint8Array): void;
    receive(len: number): Uint8Array;
    hasData(): boolean;
    waitForData(timeout?: number): boolean;
  };
};

/**
 * Extends the WASI implementation with socket function handlers.
 */
export function handleWasiSocket(wasi: WASI, options: WasiSocketOptions) {
  const { listenFd, connectionFd, stdin, stdout, stderr, net } = options;

  /**
   * Implements the `poll_oneoff` WASI syscall.
   * Required to support socket and TTY operations on the c2w VM.
   *
   * `poll_oneoff` is a one-shot version of `poll` that allows the caller to
   * wait for I/O events to occur on a set of file descriptors.
   *
   * Types of I/O events include:
   * - Readable data available on a file descriptor (`fd_read`).
   * - Writable space available on a file descriptor (`fd_write`).
   * - A timeout (`clock`).
   * Currently only supports `fd_read` and `clock` events.
   *
   * The function will block until one or more of the subscriptions parsed
   * from the input pointer have occurred. It will return the events that
   * have occurred, serialized to the output pointer.
   */
  wasi.wasiImport.poll_oneoff = (
    in_ptr: number,
    out_ptr: number,
    nsubscriptions: number,
    nevents_ptr: number
  ) => {
    if (nsubscriptions === 0) {
      return ERRNO_INVAL;
    }

    const buffer = new DataView(wasi.inst.exports.memory.buffer);
    const subscriptions = parseSubscriptions(buffer, in_ptr, nsubscriptions);

    let clockSub: ClockSubscription | undefined;
    let stdinSub: FdReadSubscription | undefined;
    let socketSub: FdReadSubscription | undefined;

    let timeout = Number.MAX_VALUE;

    for (const sub of subscriptions) {
      switch (sub.type) {
        case 'fd_read': {
          if (sub.fd !== 0 && sub.fd !== connectionFd) {
            return ERRNO_INVAL;
          }
          if (sub.fd === 0) {
            stdinSub = sub;
          } else {
            socketSub = sub;
          }
          break;
        }
        case 'clock': {
          if (sub.timeout < timeout) {
            timeout = sub.timeout;
            clockSub = sub;
          }
          break;
        }
        default:
          return ERRNO_INVAL;
      }
    }

    const events: PollEvent[] = [];

    if (clockSub || stdinSub || socketSub) {
      // Nanoseconds to milliseconds
      const timeoutMilliseconds = timeout / 1e6;

      if (stdinSub) {
        const isStdinReadable = stdin.waitForData(timeoutMilliseconds);

        if (isStdinReadable) {
          events.push({
            type: 'fd_read',
            userdata: stdinSub.userdata,
            error: 0,
          });
        }
      }
      if (socketSub) {
        const isSocketReadable = net.waitForData(timeoutMilliseconds);

        if (isSocketReadable) {
          events.push({
            type: 'fd_read',
            userdata: socketSub.userdata,
            error: 0,
          });
        }
      }

      if (clockSub) {
        events.push({
          type: 'clock',
          userdata: clockSub.userdata,
          error: 0,
        });
      }
    }

    // Serialize the events to the output pointer
    serializeEvents(events, buffer, out_ptr);

    // Update the number of events pointer
    buffer.setUint32(nevents_ptr, events.length, true);

    return 0;
  };

  // definition from wasi-libc https://github.com/WebAssembly/wasi-libc/blob/wasi-sdk-19/expected/wasm32-wasi/predefined-macros.txt
  const ERRNO_INVAL = 28;
  const ERRNO_AGAIN = 6;

  let hasActiveSocket = false;

  const fd_close = wasi.wasiImport.fd_close!;

  /**
   * Augments `fd_close` to capture the closing of the connection socket.
   */
  wasi.wasiImport.fd_close = (fd: number) => {
    if (fd === connectionFd) {
      hasActiveSocket = false;
      return 0;
    }
    return fd_close.apply(wasi.wasiImport, [fd]);
  };

  const fd_read = wasi.wasiImport.fd_read!;

  /**
   * Augments `fd_read` to handle reading from the connection socket.
   */
  wasi.wasiImport.fd_read = (
    fd: number,
    iovs_ptr: number,
    iovs_len: number,
    nread_ptr: number
  ) => {
    if (fd === 0) {
      const buffer = new DataView(wasi.inst.exports.memory.buffer);
      const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
      const iovecs = WasiDefs.Iovec.read_bytes_array(
        buffer,
        iovs_ptr,
        iovs_len
      );
      let nread = 0;
      for (let i = 0; i < iovecs.length; i++) {
        const iovec = iovecs[i]!;
        if (iovec.buf_len == 0) {
          continue;
        }
        const data = stdin.read(iovec.buf_len);
        buffer8.set(data, iovec.buf);
        nread += data.length;
      }
      buffer.setUint32(nread_ptr, nread, true);
      return 0;
    }
    if (fd === connectionFd) {
      return wasi.wasiImport.sock_recv!(
        fd,
        iovs_ptr,
        iovs_len,
        0,
        nread_ptr,
        0
      );
    }
    return fd_read.apply(wasi.wasiImport, [fd, iovs_ptr, iovs_len, nread_ptr]);
  };

  const fd_write = wasi.wasiImport.fd_write!;

  /**
   * Augments `fd_write` to handle writing to the connection socket.
   */
  wasi.wasiImport.fd_write = (
    fd: number,
    iovs_ptr: number,
    iovs_len: number,
    nwritten_ptr: number
  ) => {
    if (fd == 1 || fd == 2) {
      const buffer = new DataView(wasi.inst.exports.memory.buffer);
      const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
      const iovecs = WasiDefs.Ciovec.read_bytes_array(
        buffer,
        iovs_ptr,
        iovs_len
      );
      let wtotal = 0;
      for (let i = 0; i < iovecs.length; i++) {
        const iovec = iovecs[i]!;
        const buf = buffer8.slice(iovec.buf, iovec.buf + iovec.buf_len);
        if (buf.length == 0) {
          continue;
        }
        if (fd == 1) {
          stdout.write(buf);
        } else {
          stderr.write(buf);
        }
        wtotal += buf.length;
      }
      buffer.setUint32(nwritten_ptr, wtotal, true);
      return 0;
    }
    if (fd === connectionFd) {
      return wasi.wasiImport.sock_send!(
        fd,
        iovs_ptr,
        iovs_len,
        0,
        nwritten_ptr
      );
    }
    return fd_write.apply(wasi.wasiImport, [
      fd,
      iovs_ptr,
      iovs_len,
      nwritten_ptr,
    ]);
  };

  const fd_fdstat_get = wasi.wasiImport.fd_fdstat_get!;

  /**
   * Augments `fd_fdstat_get` to provide information about the socket file descriptors.
   */
  wasi.wasiImport.fd_fdstat_get = (fd: number, fdstat_ptr: number) => {
    if (fd === listenFd || (fd === connectionFd && hasActiveSocket)) {
      let buffer = new DataView(wasi.inst.exports.memory.buffer);

      // https://github.com/WebAssembly/WASI/blob/snapshot-01/phases/snapshot/docs.md#-fdstat-struct
      buffer.setUint8(fdstat_ptr, 6); // filetype = 6 (socket_stream)
      buffer.setUint8(fdstat_ptr + 1, 2); // fdflags = 2 (nonblock)

      return 0;
    }
    return fd_fdstat_get.apply(wasi.wasiImport, [fd, fdstat_ptr]);
  };

  const fd_prestat_get = wasi.wasiImport.fd_prestat_get!;

  /**
   * Augments `fd_prestat_get` to provide information about the socket file descriptors.
   */
  wasi.wasiImport.fd_prestat_get = (fd: number, prestat_ptr: number) => {
    if (fd === listenFd || fd === connectionFd) {
      // reserve socket-related fds
      let buffer = new DataView(wasi.inst.exports.memory.buffer);
      buffer.setUint8(prestat_ptr, 1);

      return 0;
    }
    return fd_prestat_get.apply(wasi.wasiImport, [fd, prestat_ptr]);
  };

  /**
   * Implements the `sock_accept` WASI syscall.
   *
   * Accepts a connection on a socket.
   */
  wasi.wasiImport.sock_accept = (fd: number, flags: number, fd_ptr: number) => {
    if (fd !== listenFd) {
      console.log('sock_accept: unknown fd ' + fd);
      return ERRNO_INVAL;
    }

    if (hasActiveSocket) {
      console.log('sock_accept: multi-connection is unsupported');
      return ERRNO_INVAL;
    }

    if (!net.accept()) {
      return ERRNO_AGAIN;
    }

    hasActiveSocket = true;
    const buffer = new DataView(wasi.inst.exports.memory.buffer);
    buffer.setUint32(fd_ptr, connectionFd, true);

    return 0;
  };

  /**
   * Implements the `sock_send` WASI syscall.
   *
   * Sends data on a socket.
   */
  wasi.wasiImport.sock_send = (
    fd: number,
    iovs_ptr: number,
    iovs_len: number,
    si_flags: number,
    nwritten_ptr: number
  ) => {
    if (fd !== connectionFd) {
      console.log('sock_send: unknown fd ' + fd);
      return ERRNO_INVAL;
    }

    const buffer = new DataView(wasi.inst.exports.memory.buffer);
    const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
    const iovecs = WasiDefs.Ciovec.read_bytes_array(buffer, iovs_ptr, iovs_len);

    let wtotal = 0;

    for (let i = 0; i < iovecs.length; i++) {
      const iovec = iovecs[i]!;
      const buf = buffer8.slice(iovec.buf, iovec.buf + iovec.buf_len);
      if (buf.length === 0) {
        continue;
      }

      try {
        net.send(buf);
      } catch (error) {
        console.log('sock_send: error ' + error);
        return ERRNO_INVAL;
      }

      wtotal += buf.length;
    }

    buffer.setUint32(nwritten_ptr, wtotal, true);

    return 0;
  };

  /**
   * Implements the `sock_recv` WASI syscall.
   *
   * Receives data on a socket.
   */
  wasi.wasiImport.sock_recv = (
    fd: number,
    iovs_ptr: number,
    iovs_len: number,
    ri_flags: number,
    nread_ptr: number,
    ro_flags_ptr: number
  ) => {
    if (ri_flags !== 0) {
      console.log('ri_flags are unsupported'); // TODO
    }

    if (fd !== connectionFd) {
      console.log('sock_recv: unknown fd ' + fd);
      return ERRNO_INVAL;
    }

    if (!net.hasData()) {
      return ERRNO_AGAIN;
    }

    const buffer = new DataView(wasi.inst.exports.memory.buffer);
    const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
    const iovecs = WasiDefs.Iovec.read_bytes_array(buffer, iovs_ptr, iovs_len);

    let nread = 0;

    for (let i = 0; i < iovecs.length; i++) {
      const iovec = iovecs[i];
      if (!iovec || iovec.buf_len === 0) {
        continue;
      }

      const data = net.receive(iovec.buf_len);

      buffer8.set(data, iovec.buf);
      nread += data.length;
    }

    buffer.setUint32(nread_ptr, nread, true);
    // TODO: support ro_flags_ptr

    return 0;
  };

  /**
   * Implements the `sock_recv_is_readable` WASI syscall.
   *
   * Captures the closing of the connection socket.
   */
  wasi.wasiImport.sock_shutdown = (fd: number, sdflags: number) => {
    if (fd === connectionFd) {
      hasActiveSocket = false;
    }
    return 0;
  };
}

type BaseSubscription = {
  userdata: bigint;
};

type ClockSubscription = BaseSubscription & {
  type: 'clock';
  timeout: number;
};

type FdReadSubscription = BaseSubscription & {
  type: 'fd_read';
  fd: number;
};

type FdWriteSubscription = BaseSubscription & {
  type: 'fd_write';
  fd: number;
};

type Subscription =
  | ClockSubscription
  | FdReadSubscription
  | FdWriteSubscription;

type EventType = Subscription['type'];

type PollEvent = {
  type: EventType;
  userdata: bigint;
  error: number;
};

function serializeEvent(event: PollEvent, view: DataView, ptr: number) {
  view.setBigUint64(ptr, event.userdata, true);
  view.setUint8(ptr + 8, event.error);
  view.setUint8(ptr + 9, 0);
  view.setUint8(ptr + 10, serializeEventType(event.type));
}

function serializeEvents(events: PollEvent[], view: DataView, ptr: number) {
  for (let i = 0; i < events.length; i++) {
    serializeEvent(events[i]!, view, ptr + 32 * i);
  }
}

const EVENTTYPE_CLOCK = 0;
const EVENTTYPE_FD_READ = 1;
const EVENTTYPE_FD_WRITE = 2;

function parseEventType(data: number): EventType {
  switch (data) {
    case EVENTTYPE_CLOCK:
      return 'clock';
    case EVENTTYPE_FD_READ:
      return 'fd_read';
    case EVENTTYPE_FD_WRITE:
      return 'fd_write';
    default:
      throw new Error(`invalid event type ${data}`);
  }
}

function serializeEventType(eventType: EventType) {
  switch (eventType) {
    case 'clock':
      return EVENTTYPE_CLOCK;
    case 'fd_read':
      return EVENTTYPE_FD_READ;
    case 'fd_write':
      return EVENTTYPE_FD_WRITE;
    default:
      throw new Error('unreachable');
  }
}

function parseSubscription(view: DataView, ptr: number): Subscription {
  const userdata = view.getBigUint64(ptr, true);
  const type = parseEventType(view.getUint8(ptr + 8));
  switch (type) {
    case 'clock':
      const timeout = Number(view.getBigUint64(ptr + 16, true));
      return { userdata, type, timeout };
    case 'fd_read':
    case 'fd_write':
      const fd = view.getUint32(ptr + 16, true);
      return { userdata, type, fd };
    default:
      throw new Error(`invalid event type ${type}`);
  }
}

function parseSubscriptions(
  view: DataView,
  ptr: number,
  len: number
): Subscription[] {
  const subscriptions = [];
  for (let i = 0; i < len; i++) {
    subscriptions.push(parseSubscription(view, ptr + 48 * i));
  }
  return subscriptions;
}

function asHex(data: Uint8Array, delimiter = ' ') {
  return Array.from(data)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(delimiter);
}
