import {
  serializeIPv4Cidr,
  serializeMacAddress,
  type IPv4Cidr,
  type MacAddress,
} from '@tcpip/wire';
import type { Pointer } from '../types.js';
import { generateMacAddress } from '../util.js';
import { Bindings } from './base.js';
import { tapInterfaceHooks, type TapInterface } from './tap-interface.js';

type BridgeInterfaceHandle = Pointer;

export type BridgeImports = {};

export type BridgeExports = {
  create_bridge_interface(
    macAddress: Pointer,
    ipAddress: Pointer,
    netmask: Pointer,
    ports: Pointer,
    ports_length: number
  ): BridgeInterfaceHandle;
  remove_bridge_interface(handle: BridgeInterfaceHandle): void;
};

export class BridgeBindings extends Bindings<BridgeImports, BridgeExports> {
  interfaces = new Map<BridgeInterfaceHandle, BridgeInterface>();

  imports = {};

  async create(options: BridgeInterfaceOptions) {
    const macAddress = options.mac
      ? serializeMacAddress(options.mac)
      : generateMacAddress();

    const { ipAddress, netmask } = options.ip
      ? serializeIPv4Cidr(options.ip)
      : {};

    using macAddressPtr = this.copyToMemory(macAddress);
    using ipAddressPtr = ipAddress ? this.copyToMemory(ipAddress) : undefined;
    using netmaskPtr = netmask ? this.copyToMemory(netmask) : undefined;
    const portHandles = new Uint32Array(
      options.ports.map((port) =>
        Number(tapInterfaceHooks.getOuter(port).handle)
      )
    );

    using portHandlesPtr = this.copyToMemory(portHandles.buffer);

    const handle = this.exports.create_bridge_interface(
      macAddressPtr,
      ipAddressPtr ?? 0,
      netmaskPtr ?? 0,
      portHandlesPtr,
      options.ports.length
    );

    const bridgeInterface = new BridgeInterface();
    this.interfaces.set(handle, bridgeInterface);

    return bridgeInterface;
  }

  async remove(bridgeInterface: BridgeInterface) {
    for (const [handle, loopback] of this.interfaces.entries()) {
      if (loopback === bridgeInterface) {
        this.exports.remove_bridge_interface(handle);
        this.interfaces.delete(handle);
        return;
      }
    }
  }
}

export type BridgeInterfaceOptions = {
  ports: TapInterface[];
  mac?: MacAddress;
  ip?: IPv4Cidr;
};

export class BridgeInterface {}
