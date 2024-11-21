import { Bindings } from './base.js';
import { serializeIPv4Cidr, type IPv4Cidr } from '../protocols/ipv4.js';
import type { Pointer } from '../types.js';

type LoopbackInterfaceHandle = Pointer;

export type LoopbackImports = {
  register_loopback_interface(handle: LoopbackInterfaceHandle): void;
};

export type LoopbackExports = {
  create_loopback_interface(
    ipAddress: Pointer,
    netmask: Pointer
  ): LoopbackInterfaceHandle;
};

export class LoopbackBindings extends Bindings<
  LoopbackImports,
  LoopbackExports
> {
  #loopbackInterfaces = new Map<LoopbackInterfaceHandle, LoopbackInterface>();

  imports = {
    register_loopback_interface: (handle: LoopbackInterfaceHandle) => {
      const loopbackInterface = new LoopbackInterface();
      this.#loopbackInterfaces.set(handle, loopbackInterface);
    },
  };

  async create(options: LoopbackInterfaceOptions) {
    const { ipAddress, netmask } = serializeIPv4Cidr(options.ip);

    using ipAddressPtr = this.copyToMemory(ipAddress);
    using netmaskPtr = this.copyToMemory(netmask);

    const handle = this.exports.create_loopback_interface(
      ipAddressPtr,
      netmaskPtr
    );

    const loopbackInterface = this.#loopbackInterfaces.get(handle);

    if (!loopbackInterface) {
      throw new Error('loopback interface failed to register');
    }

    return loopbackInterface;
  }
}

export type LoopbackInterfaceOptions = {
  ip: IPv4Cidr;
};
export class LoopbackInterface {}
