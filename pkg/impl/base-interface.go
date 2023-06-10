package impl

import (
	"errors"
	"fmt"
	"net/netip"
	"syscall/js"

	"gvisor.dev/gvisor/pkg/tcpip"
	"gvisor.dev/gvisor/pkg/tcpip/network/ipv4"
	"gvisor.dev/gvisor/pkg/tcpip/stack"
)

func initCommon(s *stack.Stack, nicID tcpip.NICID, options js.Value) error {
	ipAddress := options.Get("ipAddress")

	if ipAddress.IsUndefined() {
		return fmt.Errorf("ipAddress not set")
	}

	prefix, prefixErr := netip.ParsePrefix(ipAddress.String())
	if prefixErr != nil {
		return prefixErr
	}

	protoAddr := tcpip.ProtocolAddress{
		Protocol: ipv4.ProtocolNumber,
		AddressWithPrefix: tcpip.AddressWithPrefix{
			Address:   tcpip.Address(prefix.Addr().AsSlice()),
			PrefixLen: prefix.Masked().Bits(),
		},
	}

	addProtoAddrError := s.AddProtocolAddress(nicID, protoAddr, stack.AddressProperties{})
	if addProtoAddrError != nil {
		return errors.New(addProtoAddrError.String())
	}

	s.AddRoute(tcpip.Route{
		Destination: protoAddr.AddressWithPrefix.Subnet(),
		NIC:         nicID,
	})

	forwarding := options.Get("forwarding")

	if !forwarding.IsUndefined() {
		_, nicForwardingErr := s.SetNICForwarding(nicID, ipv4.ProtocolNumber, forwarding.Bool())
		if nicForwardingErr != nil {
			return errors.New(nicForwardingErr.String())
		}
	}

	return nil
}
