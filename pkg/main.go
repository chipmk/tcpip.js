package main

import (
	"encoding/binary"
	"log"
	"net/netip"
	"syscall/js"

	"golang.org/x/exp/slices"

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
	globalSymbol := js.Global().Get("Symbol")
	globalUint8Array := js.Global().Get("Uint8Array")

	stacks := reference.Reference[*stackWrapper]{}

	netStackClass := js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		options := args[0]
		ipNetwork := options.Get("ipNetwork").String()
		prefix, prefixErr := netip.ParsePrefix(ipNetwork)
		if prefixErr != nil {
			log.Fatal(prefixErr)
		}

		s := stack.New(stack.Options{
			NetworkProtocols:   []stack.NetworkProtocolFactory{ipv4.NewProtocol, ipv6.NewProtocol, arp.NewProtocol},
			TransportProtocols: []stack.TransportProtocolFactory{tcp.NewProtocol, udp.NewProtocol, icmp.NewProtocol6, icmp.NewProtocol4},
			HandleLocal:        true,
		})

		sackEnabledOpt := tcpip.TCPSACKEnabled(true)
		optionErr := s.SetTransportProtocolOption(tcp.ProtocolNumber, &sackEnabledOpt)
		if optionErr != nil {
			log.Fatal(optionErr)
		}

		mtu := uint32(1500)

		const localLinkAddr = tcpip.LinkAddress("\x0a\x0a\x0b\x0b\x0c\x0c")

		channelEndpoint := channel.New(1024, mtu, localLinkAddr)
		ethernetEndpoint := ethernet.New(channelEndpoint)

		tcpipErr := s.CreateNIC(nicID, ethernetEndpoint)
		if tcpipErr != nil {
			log.Fatal(tcpipErr)
		}

		protoAddr := tcpip.ProtocolAddress{
			Protocol: ipv4.ProtocolNumber,
			AddressWithPrefix: tcpip.AddressWithPrefix{
				Address:   tcpip.Address(prefix.Addr().AsSlice()),
				PrefixLen: prefix.Masked().Bits(),
			},
		}

		tcpipErr = s.AddProtocolAddress(nicID, protoAddr, stack.AddressProperties{})
		if tcpipErr != nil {
			log.Fatal(tcpipErr)
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

		// http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// 	fmt.Fprintf(w, "Hello, %q\n", html.EscapeString(r.URL.Path))
		// })

		// listenAddr := tcpip.FullAddress{
		// 	NIC:  nicID,
		// 	Addr: localIPv4,
		// 	Port: 80,
		// }

		// listener, tcpListenErr := gonet.ListenTCP(s, listenAddr, ipv4.ProtocolNumber)

		// if tcpListenErr != nil {
		// 	log.Fatal(tcpListenErr)
		// }

		// defer listener.Close()

		// go func() {
		// 	log.Fatal(http.Serve(listener, nil))
		// }()

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

		return nil
	})

	globalObject.Call("defineProperty", netStackClass, "name", map[string]any{
		"value": "NetStack",
	})
	netStackPrototype := netStackClass.Get("prototype")
	globalObject.Call("defineProperty", netStackPrototype, globalSymbol.Get("toStringTag"), map[string]any{
		"value": "NetStack",
	})

	netStackPrototype.Set("injectEthernetFrame", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
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
		return nil
	}))

	netStackPrototype.Set("emit", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		name := args[0].String()
		var message js.Value

		if len(args) > 1 {
			message = args[1]
		}

		stackId := this.Get("stackId").Int()
		sw := stacks.Get(uint32(stackId))

		listeners := sw.listeners[name]

		if listeners == nil {
			return nil
		}

		for _, listener := range listeners {
			listener.Invoke(message)
		}

		return nil
	}))

	netStackPrototype.Set("on", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		name := args[0].String()
		callback := args[1]

		stackId := this.Get("stackId").Int()
		sw := stacks.Get(uint32(stackId))

		sw.listeners[name] = append(sw.listeners[name], callback)

		return nil
	}))

	netStackPrototype.Set("off", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		name := args[0].String()
		callback := args[1]

		stackId := this.Get("stackId").Int()
		sw := stacks.Get(uint32(stackId))

		listeners := sw.listeners[name]

		index := slices.IndexFunc(listeners, func(l js.Value) bool { return l.Equal(callback) })

		if index == -1 {
			return nil
		}

		listeners[index] = listeners[len(listeners)-1]
		sw.listeners[name] = listeners[:len(listeners)-1]

		return nil
	}))

	js.Global().Set("NetStack", netStackClass)

	// Keep the program running
	<-make(chan bool)
}
