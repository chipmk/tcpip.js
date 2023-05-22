import '@tcpip/polyfill/net';
import type { Stack } from 'tcpip';
import net from './net.js';

export function polyfill(stack: Stack) {
  Object.assign(net, stack.net);
}
