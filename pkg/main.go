package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"log"
	"net/netip"
	"syscall/js"

	"github.com/chipmk/userspace-tcpip-poc/pkg/bridge"
	"github.com/chipmk/userspace-tcpip-poc/pkg/reference"
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

type stackWrapper struct {
	stack          *stack.Stack
	endpoint       *channel.Endpoint
	mtu            uint32
	incomingPacket chan *bufferv2.View
	listeners      map[string][]js.Value
}

func (sw *stackWrapper) WriteNotify() {
	go func() {
		pkt := sw.endpoint.Read()
		if pkt.IsNil() {
			return
		}

		view := pkt.ToView()
		pkt.DecRef()

		sw.incomingPacket <- view
	}()
}

const nicID = tcpip.NICID(1)

func main() {
	globalObject := js.Global().Get("Object")
	globalUint8Array := js.Global().Get("Uint8Array")

	stacks := reference.Reference[*stackWrapper]{}

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

		sw := &stackWrapper{
			stack:          s,
			endpoint:       channelEndpoint,
			mtu:            mtu,
			incomingPacket: make(chan *bufferv2.View),
			listeners:      make(map[string][]js.Value),
		}

		channelEndpoint.AddNotify(sw)

		stackId := stacks.Set(sw)
		globalObject.Call("defineProperty", this, "stackId", map[string]any{
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

				uint8Array := globalUint8Array.New(js.ValueOf(s))
				js.CopyBytesToJS(uint8Array, b[:s])

				this.Call("emit", "outbound-ethernet-frame", uint8Array)
			}
		}()

		return nil, nil
	})

	tcpipStackClass.ImplementMethod("injectEthernetFrame", func(this js.Value, args []js.Value) (any, error) {
		frameByteArray := args[0]

		stackId := this.Get("stackId").Int()
		sw := stacks.Get(uint32(stackId))

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

	// Keep the program running
	<-make(chan bool)
}
