import { Stack } from 'tcpip';

let net = {
  polyfill(stack: Stack) {
    Object.assign(net, stack.net);
  },
};

export = net;
