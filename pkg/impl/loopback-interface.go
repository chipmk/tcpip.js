package impl

import (
	"errors"
	"fmt"
	"net/netip"
	"syscall/js"

	"github.com/chipmk/tcpip.js/pkg/bridge"
	"gvisor.dev/gvisor/pkg/tcpip"
	"gvisor.dev/gvisor/pkg/tcpip/link/loopback"
	"gvisor.dev/gvisor/pkg/tcpip/network/ipv4"
	"gvisor.dev/gvisor/pkg/tcpip/stack"
)

type LoopbackInterface struct {
	nicID tcpip.NICID
}

func ImplementLoopbackInterface() {
	class := bridge.NewJsClassBridge(js.Global().Get("LoopbackInterface"))

	class.ImplementMethod("_init", func(this js.Value, args []js.Value) (any, error) {
		options := args[0]

		if options.IsUndefined() {
			return nil, fmt.Errorf("options not set")
		}

		stackId := options.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		ipNetwork := options.Get("ipNetwork")

		if ipNetwork.IsUndefined() {
			return nil, fmt.Errorf("ipNetwork not set")
		}

		prefix, prefixErr := netip.ParsePrefix(ipNetwork.String())
		if prefixErr != nil {
			return nil, prefixErr
		}

		loopbackEndpoint := loopback.New()
		loopbackInterface := &LoopbackInterface{}

		interfaceId := s.interfaces.Set(loopbackInterface)
		bridge.GlobalObject.Call("defineProperty", this, "interfaceId", map[string]any{
			"value": interfaceId,
		})
		nicID := tcpip.NICID(interfaceId)
		loopbackInterface.nicID = nicID

		createNicErr := s.stack.CreateNIC(nicID, loopbackEndpoint)
		if createNicErr != nil {
			return nil, errors.New(createNicErr.String())
		}

		protoAddr := tcpip.ProtocolAddress{
			Protocol: ipv4.ProtocolNumber,
			AddressWithPrefix: tcpip.AddressWithPrefix{
				Address:   tcpip.Address(prefix.Addr().AsSlice()),
				PrefixLen: prefix.Masked().Bits(),
			},
		}

		addProtoAddrError := s.stack.AddProtocolAddress(nicID, protoAddr, stack.AddressProperties{})
		if addProtoAddrError != nil {
			return nil, errors.New(addProtoAddrError.String())
		}

		s.stack.AddRoute(tcpip.Route{
			Destination: protoAddr.AddressWithPrefix.Subnet(),
			NIC:         nicID,
		})

		return nil, nil
	})
}
