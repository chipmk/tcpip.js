import { wasi as WasiDef, WASI, Fd } from '@bjorn3/browser_wasi_shim';
// import { readFile } from 'node:fs/promises';

type SockAccept = () => boolean;
type SockSend = (data: Uint8Array) => number;
type SockRecv = (buffer: Uint8Array, buf: number, buf_len: number) => number;

export async function startContainer() {
  const args = [
    'arg0',
    '--net=socket=listenfd=3',
    '--mac',
    '01:23:45:67:89:ab',
  ];
  const env: string[] = [];
  const fds: Fd[] = [
    // 0: stdin
    // 1: stdout
    // 2: stderr
    // 3: socket listenfd
    // 4: accepted socket fd
  ];
  const listenfd = 3;
  const connfd = 4;

  // const wasmBytes = await readFile(
  //   new URL(
  //     '/Users/grichardson/Documents/dev/container2wasm/shell.wasm',
  //     import.meta.url
  //   )
  // );

  const wasmByesResponse = await fetch(
    new URL(
      'file:///Users/grichardson/Documents/dev/container2wasm/shell.wasm',
      import.meta.url
    )
  );
  const wasmBytes = await wasmByesResponse.arrayBuffer();
  const wasmModule = await WebAssembly.compile(wasmBytes);

  const wasi = new WASI(args, env, fds);
  wasiHack(wasi, {}, connfd);
  wasiHackSocket(wasi, {
    listenfd,
    connfd,
    sockAccept: () => {
      console.log('accept');
      return true;
    },
    sockSend: (data) => {
      console.log('send', data);
      return data.length;
    },
    sockRecv: (buffer, buf, buf_len) => {
      console.log('recv', buffer, buf, buf_len);
      return 0;
    },
  });
  const instance = await WebAssembly.instantiate(wasmModule, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });
  console.log('instance', instance);

  wasi.start(instance as any);
  console.log('wasi ended');
}

////////////////////////////////////////////////////////////
//
// event-related classes adopted from the on-going discussion
// towards poll_oneoff support in browser_wasi_sim project.
// Ref: https://github.com/bjorn3/browser_wasi_shim/issues/14#issuecomment-1450351935
//
////////////////////////////////////////////////////////////

export class EventType {
  variant: 'clock' | 'fd_read' | 'fd_write';

  constructor(variant: 'clock' | 'fd_read' | 'fd_write') {
    this.variant = variant;
  }

  static from_u8(data: number): EventType {
    switch (data) {
      case WasiDef.EVENTTYPE_CLOCK:
        return new EventType('clock');
      case WasiDef.EVENTTYPE_FD_READ:
        return new EventType('fd_read');
      case WasiDef.EVENTTYPE_FD_WRITE:
        return new EventType('fd_write');
      default:
        throw new Error('Invalid event type ' + String(data));
    }
  }

  to_u8(): number {
    switch (this.variant) {
      case 'clock':
        return WasiDef.EVENTTYPE_CLOCK;
      case 'fd_read':
        return WasiDef.EVENTTYPE_FD_READ;
      case 'fd_write':
        return WasiDef.EVENTTYPE_FD_WRITE;
      default:
        throw new Error('unreachable');
    }
  }
}

export class Event {
  userdata!: bigint;
  error!: number;
  type!: EventType;
  // fd_readwrite: EventFdReadWrite | null;

  write_bytes(view: DataView, ptr: number) {
    view.setBigUint64(ptr, this.userdata, true);
    view.setUint8(ptr + 8, this.error);
    view.setUint8(ptr + 9, 0);
    view.setUint8(ptr + 10, this.type.to_u8());
    // if (this.fd_readwrite) {
    //     this.fd_readwrite.write_bytes(view, ptr + 16);
    // }
  }

  static write_bytes_array(view: DataView, ptr: number, events: Array<Event>) {
    for (let i = 0; i < events.length; i++) {
      events[i]!.write_bytes(view, ptr + 32 * i);
    }
  }
}

export class SubscriptionClock {
  timeout!: number;

  static read_bytes(view: DataView, ptr: number): SubscriptionClock {
    let self = new SubscriptionClock();
    self.timeout = Number(view.getBigUint64(ptr + 8, true));
    return self;
  }
}

export class SubscriptionFdReadWrite {
  fd!: number;

  static read_bytes(view: DataView, ptr: number): SubscriptionFdReadWrite {
    let self = new SubscriptionFdReadWrite();
    self.fd = view.getUint32(ptr, true);
    return self;
  }
}

export class SubscriptionU {
  tag!: EventType;
  data!: SubscriptionClock | SubscriptionFdReadWrite;

  static read_bytes(view: DataView, ptr: number): SubscriptionU {
    let self = new SubscriptionU();
    self.tag = EventType.from_u8(view.getUint8(ptr));
    switch (self.tag.variant) {
      case 'clock':
        self.data = SubscriptionClock.read_bytes(view, ptr + 8);
        break;
      case 'fd_read':
      case 'fd_write':
        self.data = SubscriptionFdReadWrite.read_bytes(view, ptr + 8);
        break;
      default:
        throw new Error('unreachable');
    }
    return self;
  }
}

export class Subscription {
  userdata!: bigint;
  u!: SubscriptionU;

  static read_bytes(view: DataView, ptr: number): Subscription {
    let subscription = new Subscription();
    subscription.userdata = view.getBigUint64(ptr, true);
    subscription.u = SubscriptionU.read_bytes(view, ptr + 8);
    return subscription;
  }

  static read_bytes_array(
    view: DataView,
    ptr: number,
    len: number
  ): Subscription[] {
    let subscriptions: Subscription[] = [];
    for (let i = 0; i < len; i++) {
      subscriptions.push(Subscription.read_bytes(view, ptr + 48 * i));
    }
    return subscriptions;
  }
}

// wasiHack patches wasi object for integrating it to xterm-pty.
export function wasiHack(wasi: WASI, ttyClient: any, connfd: number) {
  console.log('wasiHack');
  const ERRNO_INVAL = 28;
  const ERRNO_AGAIN = 6;

  const _fd_read = wasi.wasiImport.fd_read;
  wasi.wasiImport.fd_read = (
    fd: number,
    iovs_ptr: number,
    iovs_len: number,
    nread_ptr: number
  ): number => {
    console.log('fd_read', fd, iovs_ptr, iovs_len, nread_ptr);
    // return 1;
    if (fd === 0) {
      const buffer = new DataView(wasi.inst.exports.memory.buffer);
      const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
      const iovecs = WasiDef.Iovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
      let nread = 0;
      for (const iovec of iovecs) {
        if (iovec.buf_len === 0) {
          continue;
        }
        // const data = ttyClient.onRead(iovec.buf_len);
        const data = new Uint8Array([0x61, 0x62, 0x63]);
        buffer8.set(data, iovec.buf);
        nread += data.length;
      }
      buffer.setUint32(nread_ptr, nread, true);
      return 0;
    } else {
      console.log('fd_read: unknown fd ' + fd);
      return _fd_read!.apply(wasi.wasiImport, [
        fd,
        iovs_ptr,
        iovs_len,
        nread_ptr,
      ]) as number;
    }
  };

  const _fd_write = wasi.wasiImport.fd_write;
  wasi.wasiImport.fd_write = (
    fd: number,
    iovs_ptr: number,
    iovs_len: number,
    nwritten_ptr: number
  ): number => {
    console.log('fd_write', fd, iovs_ptr, iovs_len, nwritten_ptr);
    if (fd === 1 || fd === 2) {
      const buffer = new DataView(wasi.inst.exports.memory.buffer);
      const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
      const iovecs = WasiDef.Ciovec.read_bytes_array(
        buffer,
        iovs_ptr,
        iovs_len
      );
      let wtotal = 0;
      for (const iovec of iovecs) {
        const buf = buffer8.slice(iovec.buf, iovec.buf + iovec.buf_len);
        if (buf.length === 0) {
          continue;
        }
        // ttyClient.onWrite(Array.from(buf));
        wtotal += buf.length;
      }
      buffer.setUint32(nwritten_ptr, wtotal, true);
      return 0;
    } else {
      console.log('fd_write: unknown fd ' + fd);
      return _fd_write!.apply(wasi.wasiImport, [
        fd,
        iovs_ptr,
        iovs_len,
        nwritten_ptr,
      ]) as number;
    }
  };

  wasi.wasiImport.poll_oneoff = (
    in_ptr: number,
    out_ptr: number,
    nsubscriptions: number,
    nevents_ptr: number
  ): number => {
    console.log('poll_oneoff', in_ptr, out_ptr, nsubscriptions, nevents_ptr);
    if (nsubscriptions === 0) {
      return ERRNO_INVAL;
    }
    const buffer = new DataView(wasi.inst.exports.memory.buffer);
    const in_ = Subscription.read_bytes_array(buffer, in_ptr, nsubscriptions);
    let isReadPollStdin = false;
    let isReadPollConn = false;
    let isClockPoll = false;
    let pollSubStdin: Subscription | undefined;
    let pollSubConn: Subscription | undefined;
    let clockSub: Subscription | undefined;
    let timeout = Number.MAX_VALUE;

    for (const sub of in_) {
      if (sub.u.tag.variant === 'fd_read') {
        if (!(sub.u.data instanceof SubscriptionFdReadWrite)) {
          console.log('poll_oneoff: fd_read without fd');
          return ERRNO_INVAL;
        }
        if (sub.u.data.fd !== 0 && sub.u.data.fd !== connfd) {
          console.log('poll_oneoff: unknown fd ' + sub.u.data.fd);
          return ERRNO_INVAL;
        }
        if (sub.u.data.fd === 0) {
          isReadPollStdin = true;
          pollSubStdin = sub;
        } else {
          isReadPollConn = true;
          pollSubConn = sub;
        }
      } else if (sub.u.tag.variant === 'clock') {
        if (!(sub.u.data instanceof SubscriptionClock)) {
          console.log('poll_oneoff: clock without timeout');
          return ERRNO_INVAL;
        }
        if (sub.u.data.timeout < timeout) {
          timeout = sub.u.data.timeout;
          isClockPoll = true;
          clockSub = sub;
        }
      } else {
        console.log('poll_oneoff: unknown variant ' + sub.u.tag.variant);
        return ERRNO_INVAL;
      }
    }

    if (!isClockPoll) {
      timeout = 0;
    }

    const errStatus = {
      val: 0,
    };

    const events: Event[] = [];
    if (isReadPollStdin || isReadPollConn || isClockPoll) {
      let readable = false;
      if (isReadPollStdin || (isClockPoll && timeout > 0)) {
        // readable = ttyClient.onWaitForReadable(timeout / 1000000000);
        readable = true;
      }
      if (readable && isReadPollStdin && pollSubStdin) {
        const event = new Event();
        event.userdata = pollSubStdin.userdata;
        event.error = 0;
        event.type = new EventType('fd_read');
        events.push(event);
      }
      if (isReadPollConn && pollSubConn) {
        return ERRNO_INVAL;
        // const sockreadable = sockWaitForReadable();
        // if (sockreadable === errStatus) {
        //   return ERRNO_INVAL;
        // } else if (sockreadable === true) {
        const event = new Event();
        event.userdata = pollSubConn!.userdata;
        event.error = 0;
        event.type = new EventType('fd_read');
        events.push(event);
        // }
      }
      if (isClockPoll && clockSub) {
        const event = new Event();
        event.userdata = clockSub.userdata;
        event.error = 0;
        event.type = new EventType('clock');
        events.push(event);
      }
    }

    const len = events.length;
    Event.write_bytes_array(buffer, out_ptr, events);
    buffer.setUint32(nevents_ptr, len, true);
    return 0;
  };
}

export function wasiHackSocket(
  wasi: WASI,
  {
    listenfd,
    connfd,
    sockAccept,
    sockSend,
    sockRecv,
  }: {
    listenfd: number;
    connfd: number;
    sockAccept: SockAccept;
    sockSend: SockSend;
    sockRecv: SockRecv;
  }
) {
  console.log('wasiHackSocket');
  const ERRNO_INVAL = 28;
  const ERRNO_AGAIN = 6;
  let connfdUsed = false;
  const connbuf = new Uint8Array(0);
  const _fd_close = wasi.wasiImport.fd_close;
  wasi.wasiImport.fd_close = (fd: number): number => {
    console.log('fd_close', fd);
    if (fd === connfd) {
      connfdUsed = false;
      return 0;
    }
    return _fd_close!.apply(wasi.wasiImport, [fd]) as number;
  };
  const _fd_read = wasi.wasiImport.fd_read;
  wasi.wasiImport.fd_read = (
    fd: number,
    iovs_ptr: number,
    iovs_len: number,
    nread_ptr: number
  ): number => {
    console.log('fd_read', fd, iovs_ptr, iovs_len, nread_ptr);
    if (fd === connfd) {
      return wasi.wasiImport.sock_recv!(
        fd,
        iovs_ptr,
        iovs_len,
        0,
        nread_ptr,
        0
      ) as number;
    }
    return _fd_read!.apply(wasi.wasiImport, [
      fd,
      iovs_ptr,
      iovs_len,
      nread_ptr,
    ]) as number;
  };
  const _fd_write = wasi.wasiImport.fd_write;
  wasi.wasiImport.fd_write = (
    fd: number,
    iovs_ptr: number,
    iovs_len: number,
    nwritten_ptr: number
  ): number => {
    console.log('fd_write', fd, iovs_ptr, iovs_len, nwritten_ptr);
    if (fd === connfd) {
      return wasi.wasiImport.sock_send!(
        fd,
        iovs_ptr,
        iovs_len,
        0,
        nwritten_ptr
      ) as number;
    }
    return _fd_write!.apply(wasi.wasiImport, [
      fd,
      iovs_ptr,
      iovs_len,
      nwritten_ptr,
    ]) as number;
  };
  const _fd_fdstat_get = wasi.wasiImport.fd_fdstat_get;
  wasi.wasiImport.fd_fdstat_get = (fd: number, fdstat_ptr: number): number => {
    console.log('fd_fdstat_get', fd, fdstat_ptr);
    if (fd === listenfd || (fd === connfd && connfdUsed)) {
      const buffer = new DataView(wasi.inst.exports.memory.buffer);
      buffer.setUint8(fdstat_ptr, 6); // filetype = 6 (socket_stream)
      buffer.setUint8(fdstat_ptr + 1, 2); // fdflags = 2 (nonblock)
      return 0;
    }
    return _fd_fdstat_get!.apply(wasi.wasiImport, [fd, fdstat_ptr]) as number;
  };
  // const _fd_prestat_get = wasi.wasiImport.fd_prestat_get!;
  // console.log('fd_prestat_get', _fd_prestat_get);
  // wasi.wasiImport.fd_prestat_get = (
  //   fd: number,
  //   prestat_ptr: number
  // ): number => {
  //   console.log('fd_prestat_get', fd, prestat_ptr);
  //   // if (fd === listenfd || fd === connfd) {
  //   //   // reserve socket-related fds
  //   //   const buffer = new DataView(wasi.inst.exports.memory.buffer);
  //   //   buffer.setUint8(prestat_ptr, 1);
  //   //   return 0;
  //   // }
  //   return _fd_prestat_get.apply(wasi.wasiImport, [fd, prestat_ptr]) as number;
  // };
  wasi.wasiImport.sock_accept = (
    fd: number,
    flags: number,
    fd_ptr: number
  ): number => {
    console.log('sock_accept', fd, flags, fd_ptr);
    if (fd !== listenfd) {
      console.log('sock_accept: unknown fd ' + fd);
      return ERRNO_INVAL;
    }
    if (connfdUsed) {
      console.log('sock_accept: multi-connection is unsupported');
      return ERRNO_INVAL;
    }
    if (!sockAccept()) {
      return ERRNO_AGAIN;
    }
    connfdUsed = true;
    const buffer = new DataView(wasi.inst.exports.memory.buffer);
    buffer.setUint32(fd_ptr, connfd, true);
    return 0;
  };
  // wasi.wasiImport.sock_send = (
  //   fd: number,
  //   iovs_ptr: number,
  //   iovs_len: number,
  //   si_flags: number,
  //   nwritten_ptr: number
  // ): number => {
  //   console.log('sock_send', fd, iovs_ptr, iovs_len, si_flags, nwritten_ptr);
  //   if (fd !== connfd) {
  //     console.log('sock_send: unknown fd ' + fd);
  //     return ERRNO_INVAL;
  //   }
  //   const buffer = new DataView(wasi.inst.exports.memory.buffer);
  //   const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
  //   const iovecs = WasiDef.Ciovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
  //   let wtotal = 0;
  //   for (let i = 0; i < iovecs.length; i++) {
  //     const iovec = iovecs[i];
  //     if (iovec!.buf_len === 0) {
  //       continue;
  //     }
  //     const ret = sockSend(
  //       buffer8.subarray(iovec!.buf, iovec!.buf + iovec!.buf_len)
  //     );
  //     if (ret < 0) {
  //       return ERRNO_INVAL;
  //     }
  //     wtotal += iovec!.buf_len;
  //   }
  //   buffer.setUint32(nwritten_ptr, wtotal, true);
  //   return 0;
  // };
  // wasi.wasiImport.sock_recv = (
  //   fd: number,
  //   iovs_ptr: number,
  //   iovs_len: number,
  //   ri_flags: number,
  //   nread_ptr: number,
  //   ro_flags_ptr: number
  // ): number => {
  //   console.log('sock_recv', fd, iovs_ptr, iovs_len, ri_flags, nread_ptr);
  //   if (ri_flags !== 0) {
  //     console.log('ri_flags are unsupported'); // TODO
  //   }
  //   if (fd !== connfd) {
  //     console.log('sock_recv: unknown fd ' + fd);
  //     return ERRNO_INVAL;
  //   }
  //   const buffer = new DataView(wasi.inst.exports.memory.buffer);
  //   const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
  //   const iovecs = WasiDef.Iovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
  //   let nread = 0;
  //   for (let i = 0; i < iovecs.length; i++) {
  //     const iovec = iovecs[i];
  //     if (iovec!.buf_len === 0) {
  //       continue;
  //     }
  //     const retlen = sockRecv(buffer8, iovec!.buf, iovec!.buf_len);
  //     if (retlen <= 0 && i === 0) {
  //       return ERRNO_AGAIN;
  //     }
  //     nread += retlen;
  //   }
  //   buffer.setUint32(nread_ptr, nread, true);
  //   // TODO: support ro_flags_ptr
  //   return 0;
  // };
  // wasi.wasiImport.sock_shutdown = (fd: number, sdflags: number): number => {
  //   console.log('sock_shutdown', fd, sdflags);
  //   if (fd === connfd) {
  //     connfdUsed = false;
  //   }
  //   return 0;
  // };
}
