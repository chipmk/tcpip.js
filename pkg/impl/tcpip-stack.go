package impl

import (
	"encoding/binary"
	"errors"
	"fmt"
	"log"
	"net/netip"
	"syscall/js"

	"github.com/chipmk/tcpip.js/pkg/bridge"
	"github.com/chipmk/tcpip.js/pkg/reference"
	eth "github.com/songgao/packets/ethernet"
	"gvisor.dev/gvisor/pkg/bufferv2"
	"gvisor.dev/gvisor/pkg/tcpip"
	"gvisor.dev/gvisor/pkg/tcpip/header"
	"gvisor.dev/gvisor/pkg/tcpip/link/channel"
	"gvisor.dev/gvisor/pkg/tcpip/link/ethernet"
	"gvisor.dev/gvisor/pkg/tcpip/network/arp"
	"gvisor.dev/gvisor/pkg/tcpip/network/ipv4"
	"gvisor.dev/gvisor/pkg/tcpip/network/ipv6"
	"gvisor.dev/gvisor/pkg/tcpip/stack"
	"gvisor.dev/gvisor/pkg/tcpip/transport/icmp"
	"gvisor.dev/gvisor/pkg/tcpip/transport/tcp"
	"gvisor.dev/gvisor/pkg/tcpip/transport/udp"
)

const nicID = tcpip.NICID(1)

type Stack struct {
	stack          *stack.Stack
	endpoint       *channel.Endpoint
	mtu            uint32
	incomingPacket chan *bufferv2.View
	sockets        *reference.Reference[*Socket]
	jsInstance     js.Value
}

func (s *Stack) WriteNotify() {
	go func() {
		pkt := s.endpoint.Read()
		if pkt.IsNil() {
			return
		}

		view := pkt.ToView()
		pkt.DecRef()

		s.incomingPacket <- view
	}()
}

var Stacks = reference.Reference[*Stack]{}

func ImplementTcpipStack() {
	tcpipStackClass := bridge.NewJsClassBridge(js.Global().Get("TcpipStack"))

	tcpipStackClass.ImplementMethod("_init", func(this js.Value, args []js.Value) (any, error) {
		options := args[0]

		if options.IsUndefined() {
			return nil, fmt.Errorf("options not set")
		}

		ipNetwork := options.Get("ipNetwork")

		if ipNetwork.IsUndefined() {
			return nil, fmt.Errorf("ipNetwork not set")
		}

		prefix, prefixErr := netip.ParsePrefix(ipNetwork.String())
		if prefixErr != nil {
			return nil, prefixErr
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

		mtu := uint32(1500)

		const localLinkAddr = tcpip.LinkAddress("\x0a\x0a\x0b\x0b\x0c\x0c")

		channelEndpoint := channel.New(1024, mtu, localLinkAddr)
		ethernetEndpoint := ethernet.New(channelEndpoint)

		createNicErr := s.CreateNIC(nicID, ethernetEndpoint)
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

		addProtoAddrError := s.AddProtocolAddress(nicID, protoAddr, stack.AddressProperties{})
		if addProtoAddrError != nil {
			return nil, errors.New(addProtoAddrError.String())
		}

		s.SetRouteTable([]tcpip.Route{
			{
				Destination: header.IPv4EmptySubnet,
				NIC:         nicID,
			},
			{
				Destination: header.IPv6EmptySubnet,
				NIC:         nicID,
			},
		})

		sw := &Stack{
			stack:          s,
			endpoint:       channelEndpoint,
			mtu:            mtu,
			incomingPacket: make(chan *bufferv2.View),
			sockets:        &reference.Reference[*Socket]{},
			jsInstance:     this,
		}

		channelEndpoint.AddNotify(sw)

		stackId := Stacks.Set(sw)
		bridge.GlobalObject.Call("defineProperty", this, "stackId", map[string]any{
			"value": stackId,
		})

		go func() {
			for {
				b := make([]byte, 512)

				view, ok := <-sw.incomingPacket
				if !ok {
					log.Fatal("failed to read packet")
				}

				s, _ := view.Read(b)

				uint8Array := bridge.GlobalUint8Array.New(js.ValueOf(s))
				js.CopyBytesToJS(uint8Array, b[:s])

				this.Call("emit", "outbound-ethernet-frame", uint8Array)
			}
		}()

		return nil, nil
	})

	tcpipStackClass.ImplementMethod("injectEthernetFrame", func(this js.Value, args []js.Value) (any, error) {
		frameByteArray := args[0]

		stackId := this.Get("stackId").Int()
		sw := Stacks.Get(uint32(stackId))

		frameBuffer := make([]byte, frameByteArray.Get("byteLength").Int())
		js.CopyBytesToGo(frameBuffer, frameByteArray)

		frame := eth.Frame(frameBuffer)

		etherType := frame.Ethertype()
		proto := binary.BigEndian.Uint16(etherType[:])

		pkt := stack.NewPacketBuffer(stack.PacketBufferOptions{
			Payload: bufferv2.MakeWithData(frame),
		})

		sw.endpoint.InjectInbound(tcpip.NetworkProtocolNumber(proto), pkt)
		pkt.DecRef()

		return nil, nil
	})
}
