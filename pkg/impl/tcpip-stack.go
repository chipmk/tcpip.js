package impl

import (
	"errors"
	"fmt"
	"syscall/js"

	"github.com/chipmk/tcpip.js/pkg/bridge"
	"github.com/chipmk/tcpip.js/pkg/reference"
	"gvisor.dev/gvisor/pkg/tcpip"
	"gvisor.dev/gvisor/pkg/tcpip/network/arp"
	"gvisor.dev/gvisor/pkg/tcpip/network/ipv4"
	"gvisor.dev/gvisor/pkg/tcpip/network/ipv6"
	"gvisor.dev/gvisor/pkg/tcpip/stack"
	"gvisor.dev/gvisor/pkg/tcpip/transport/icmp"
	"gvisor.dev/gvisor/pkg/tcpip/transport/tcp"
	"gvisor.dev/gvisor/pkg/tcpip/transport/udp"
)

type Stack struct {
	stack      *stack.Stack
	sockets    *reference.Reference[*Socket]
	interfaces *reference.Reference[interface{}]
	jsInstance js.Value
}

var Stacks = reference.Reference[*Stack]{}

func ImplementTcpipStack() {
	tcpipStackClass := bridge.NewJsClassBridge(bridge.TcpipNamespace.Get("TcpipStack"))

	tcpipStackClass.ImplementMethod("_init", func(this js.Value, args []js.Value) (any, error) {
		options := args[0]

		if options.IsUndefined() {
			return nil, fmt.Errorf("options not set")
		}

		s := stack.New(stack.Options{
			NetworkProtocols:   []stack.NetworkProtocolFactory{ipv4.NewProtocol, ipv6.NewProtocol, arp.NewProtocol},
			TransportProtocols: []stack.TransportProtocolFactory{tcp.NewProtocol, udp.NewProtocol, icmp.NewProtocol6, icmp.NewProtocol4},
			HandleLocal:        true,
		})

		sackEnabledOpt := tcpip.TCPSACKEnabled(true)
		optionErr := s.SetTransportProtocolOption(tcp.ProtocolNumber, &sackEnabledOpt)
		if optionErr != nil {
			return nil, errors.New(optionErr.String())
		}

		sw := &Stack{
			stack:      s,
			sockets:    &reference.Reference[*Socket]{},
			interfaces: &reference.Reference[interface{}]{},
			jsInstance: this,
		}

		stackId := Stacks.Set(sw)
		bridge.GlobalObject.Call("defineProperty", this, "stackId", map[string]any{
			"value": stackId,
		})

		return nil, nil
	})
}
