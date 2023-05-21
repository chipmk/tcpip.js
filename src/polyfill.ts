import Stack from './stack';

let net = {
  polyfill(stack: Stack) {
    Object.assign(net, stack.net);
  },
};

export = net;
