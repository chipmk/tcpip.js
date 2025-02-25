import {
  generateMacAddress,
  parseIPv4Address,
  parseMacAddress,
  serializeIPv4Cidr,
  serializeMacAddress,
  type IPv4Address,
  type IPv4Cidr,
  type MacAddress,
} from '@tcpip/wire';
import type { Pointer } from '../types.js';
import { Hooks } from '../util.js';
import { Bindings } from './base.js';
import { tapInterfaceHooks, type TapInterface } from './tap-interface.js';

type BridgeInterfaceHandle = Pointer;

type BridgeInterfaceOuterHooks = {
  handle: BridgeInterfaceHandle;
  getMacAddress(): MacAddress;
  getIPv4Address(): IPv4Address | undefined;
  getIPv4Netmask(): IPv4Address | undefined;
};

type BridgeInterfaceInnerHooks = {};

export const bridgeInterfaceHooks = new Hooks<
  BridgeInterface,
  BridgeInterfaceOuterHooks,
  BridgeInterfaceInnerHooks
>();

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

    const bridgeInterface = new VirtualBridgeInterface();

    bridgeInterfaceHooks.setOuter(bridgeInterface, {
      handle,
      getMacAddress: () => {
        const macPtr = this.exports.get_interface_mac_address(handle);

        const macBytes = this.viewFromMemory(macPtr, 6);
        return parseMacAddress(macBytes);
      },
      getIPv4Address: () => {
        const ipPtr = this.exports.get_interface_ip4_address(handle);

        if (ipPtr === 0) {
          return;
        }

        const ipBytes = this.viewFromMemory(ipPtr, 4);
        return parseIPv4Address(ipBytes);
      },
      getIPv4Netmask: () => {
        const netmaskPtr = this.exports.get_interface_ip4_netmask(handle);

        if (netmaskPtr === 0) {
          return;
        }

        const netmaskBytes = this.viewFromMemory(netmaskPtr, 4);
        return parseIPv4Address(netmaskBytes);
      },
    });

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

export type BridgeInterface = {
  readonly type: 'bridge';
  readonly mac: MacAddress;
  readonly ip?: IPv4Address;
  readonly netmask?: IPv4Address;
};

export class VirtualBridgeInterface implements BridgeInterface {
  readonly type = 'bridge';
  get mac(): MacAddress {
    return bridgeInterfaceHooks.getOuter(this).getMacAddress();
  }
  get ip(): IPv4Address | undefined {
    return bridgeInterfaceHooks.getOuter(this).getIPv4Address();
  }
  get netmask(): IPv4Address | undefined {
    return bridgeInterfaceHooks.getOuter(this).getIPv4Netmask();
  }
}
