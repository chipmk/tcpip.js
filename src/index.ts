import { V86Starter } from '@chipmk/v86';
import v86WasmUrl from '@chipmk/v86/build/v86.wasm';
import { Client } from 'pg';
import seabiosUrl from '../assets/bin/seabios.bin';
import linuxIsoUrl from '../assets/bin/v86-linux.iso';
import vgabiosUrl from '../assets/bin/vgabios.bin';
import LoopbackInterface from './interfaces/loopback-interface';
import TapInterface from './interfaces/tap-interface';
import TunInterface from './interfaces/tun-interface';
import { polyfill } from './polyfill';
import Server from './server';
import Socket from './socket';
import TcpipStack, { unwrap } from './tcpip-stack';
import wasm from './tcpip.wasm';
import { createNetworkAdapter } from './v86/network-adapter';
import Go from './wasm_exec';

const tcpipNamespace = {
  TcpipStack,
  LoopbackInterface,
  TapInterface,
  TunInterface,
  Socket,
  Server,
  unwrap,
};

// TODO: find a way to pass this directly to WASM via import object
(globalThis as any)['@tcpip/stack'] = tcpipNamespace;

const go = new Go();
WebAssembly.instantiateStreaming(fetch(wasm), go.importObject).then(
  async (result) => {
    go.run(result.instance);

    const stack = new TcpipStack();
    polyfill(stack);

    stack.createLoopbackInterface({
      ipNetwork: '127.0.0.1/8',
    });

    const tapInterface = stack.createTapInterface({
      ipNetwork: '10.1.0.1/24',
      macAddress: '0a:0a:0b:0b:0c:0c',
    });

    const tunInterface = stack.createTunInterface({
      ipNetwork: '10.2.0.1/24',
    });

    const cacheResponse = await caches
      .open('vm-state')
      .then((cache) => cache.match('/bin/vm-state.bin'));

    const initialState = cacheResponse
      ? await cacheResponse
          .arrayBuffer()
          .then((arrayBuffer) =>
            URL.createObjectURL(
              new Blob([arrayBuffer], { type: 'application/octet-stream' })
            )
          )
          .then((url) => {
            return { url };
          })
      : undefined;

    const emulator = new V86Starter({
      memory_size: 128 * 1024 * 1024,
      vga_memory_size: 2 * 1024 * 1024,
      wasm_path: v86WasmUrl,
      bios: {
        url: seabiosUrl,
      },
      vga_bios: {
        url: vgabiosUrl,
      },
      cdrom: {
        url: linuxIsoUrl,
      },
      disable_mouse: true,
      disable_keyboard: true,
      disable_speaker: true,
      autostart: true,
      network_adapter: createNetworkAdapter(tapInterface),
      initial_state: initialState,
    });

    console.log('emulator', emulator);

    const prompt = '/ # ';

    async function saveState() {
      await removeNetworkCard();
      const state = await emulator.save_state();
      const blob = new Blob([new Uint8Array(state)], {
        type: 'application/octet-stream',
      });
      const response = new Response(blob, {
        status: 200,
        statusText: 'OK, Linux VM machine state cached (safe to delete).',
      });

      const headers = new Headers();
      headers.append('Content-Type', 'application/octet-stream');
      headers.append('Content-Length', blob.size.toString());

      const url = new URL('/bin/vm-state.bin', window.location.href);
      const request = new Request(url, {
        method: 'GET',
        headers,
      });

      const cache = await caches.open('vm-state');

      await cache.put(request, response);
      await setupNetworkCard();
    }

    async function testConnectToPg() {
      const client = new Client({
        host: '10.1.0.2',
        port: 5432,
        user: 'postgres',
      });
      await client.connect();

      const res = await client.query('SELECT $1::text as message', [
        'Hello world!',
      ]);
      console.log(res.rows);
      await client.end();
    }

    async function setupPostgres() {
      emulator.serial0_send(
        'echo "listen_addresses = \'*\'" >> /var/lib/pgsql/postgresql.conf\n'
      );
      emulator.serial0_send(
        'echo "host  all  all 0.0.0.0/0 trust" >> /var/lib/pgsql/pg_hba.conf\n'
      );
      emulator.serial0_send(
        `psql -U postgres -d postgres -c "ALTER USER postgres PASSWORD 'postgres'";\n`
      );
      emulator.serial0_send('/etc/init.d/S50postgresql restart\n');
    }

    async function setupNetworkCard() {
      emulator.serial0_send('modprobe ne2k-pci\n');
      emulator.serial0_send('ip address add 10.1.0.2/24 brd + dev eth0\n');
      emulator.serial0_send('ip link set eth0 up\n');
    }

    async function removeNetworkCard() {
      emulator.serial0_send('rmmod ne2k-pci\n');
    }

    let currentRow: number;
    let serialBuffer = '';
    let screenBuffer: string[] = [];
    let hasReceivedFirstPrompt = false;

    emulator.add_listener('serial0-output-char', async (char) => {
      serialBuffer += char;

      if (serialBuffer.endsWith('\n')) {
        console.log(serialBuffer);
        serialBuffer = '';
      }

      if (serialBuffer.endsWith(prompt) && !hasReceivedFirstPrompt) {
        hasReceivedFirstPrompt = true;

        if (initialState) {
          await setupNetworkCard();
        } else {
          await setupPostgres();
          await new Promise((resolve) => setTimeout(resolve, 5000));
          await saveState();
        }
        emulator.serial0_send('ip a\n');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await testConnectToPg();
      }
    });

    emulator.add_listener('screen-put-char', ([row, col, char]) => {
      if (row !== currentRow) {
        currentRow = row;
        console.log(screenBuffer.join(''));
        screenBuffer = [];
      }

      screenBuffer[col] = String.fromCharCode(char);
    });

    setTimeout(async () => {
      emulator.serial0_send('\n');
    }, 1000);
  }
);
