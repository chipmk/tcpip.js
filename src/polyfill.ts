import TcpipStack from './tcpip-stack';

let net = {
  polyfill(stack: TcpipStack) {
    Object.assign(net, stack.net);
  },
};

export = net;
