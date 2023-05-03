package main

import (
	"encoding/binary"
	"fmt"
	"html"
	"log"
	"net/http"
	"os"
	"syscall/js"

	eth "github.com/songgao/packets/ethernet"
	"gvisor.dev/gvisor/pkg/bufferv2"
	"gvisor.dev/gvisor/pkg/tcpip"
	"gvisor.dev/gvisor/pkg/tcpip/adapters/gonet"
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

type notifier struct {
	endpoint       *channel.Endpoint
	incomingPacket chan *bufferv2.View
}

func (n *notifier) WriteNotify() {
	pkt := n.endpoint.Read()
	if pkt.IsNil() {
		return
	}
	log.Printf("Outgoing Dst MAC: %s\n", pkt.EgressRoute.RemoteLinkAddress.String())
	log.Printf("Outgoing Dst IP: %s\n", pkt.EgressRoute.RemoteAddress.String())
	log.Printf("Outgoing Src MAC: %s\n", pkt.EgressRoute.LocalLinkAddress.String())
	log.Printf("Outgoing Src IP: %s\n", pkt.EgressRoute.LocalAddress.String())

	view := pkt.ToView()
	pkt.DecRef()

	n.incomingPacket <- view
}

func (n *notifier) Read(buf []byte, sizes []int, offset int) (int, error) {
	view, ok := <-n.incomingPacket
	if !ok {
		return 0, os.ErrClosed
	}

	s, err := view.Read(buf[offset:])
	if err != nil {
		return 0, err
	}
	sizes[0] = s
	return 1, nil
}

func main() {
	s := stack.New(stack.Options{
		NetworkProtocols:   []stack.NetworkProtocolFactory{ipv4.NewProtocol, ipv6.NewProtocol, arp.NewProtocol},
		TransportProtocols: []stack.TransportProtocolFactory{tcp.NewProtocol, udp.NewProtocol, icmp.NewProtocol6, icmp.NewProtocol4},
		HandleLocal:        true,
	})
	defer s.Destroy()

	sackEnabledOpt := tcpip.TCPSACKEnabled(true)
	optionErr := s.SetTransportProtocolOption(tcp.ProtocolNumber, &sackEnabledOpt)
	if optionErr != nil {
		log.Fatal(optionErr)
	}

	mtu := uint32(1500)
	nicID := tcpip.NICID(1)

	const localLinkAddr = tcpip.LinkAddress("\x0a\x0a\x0b\x0b\x0c\x0c")
	const localIPv4 = tcpip.Address("\x0a\x01\x00\x01")

	channelEndpoint := channel.New(1024, mtu, localLinkAddr)
	ethernetEndpoint := ethernet.New(channelEndpoint)

	tcpipErr := s.CreateNIC(nicID, ethernetEndpoint)
	if tcpipErr != nil {
		log.Fatal(tcpipErr)
	}

	notify := &notifier{
		endpoint:       channelEndpoint,
		incomingPacket: make(chan *bufferv2.View),
	}

	channelEndpoint.AddNotify(notify)

	protoAddr := tcpip.ProtocolAddress{
		Protocol: ipv4.ProtocolNumber,
		AddressWithPrefix: tcpip.AddressWithPrefix{
			Address:   localIPv4,
			PrefixLen: 24,
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

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Hello, %q\n", html.EscapeString(r.URL.Path))
	})

	listenAddr := tcpip.FullAddress{
		NIC:  nicID,
		Addr: localIPv4,
		Port: 80,
	}

	listener, tcpListenErr := gonet.ListenTCP(s, listenAddr, ipv4.ProtocolNumber)

	if tcpListenErr != nil {
		log.Fatal(tcpListenErr)
	}

	defer listener.Close()

	go func() {
		log.Fatal(http.Serve(listener, nil))
	}()

	globalObject := js.Global().Get("Object")
	globalSymbol := js.Global().Get("Symbol")

	eventTarget := js.Global().Get("EventTarget")
	eventTargetPrototype := eventTarget.Get("prototype")

	netStackClass := js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		return nil
	})

	netStackClass.Set("prototype", globalObject.Call("create", eventTargetPrototype))
	netStackPrototype := netStackClass.Get("prototype")
	globalObject.Call("defineProperty", netStackPrototype, globalSymbol.Get("toStringTag"), map[string]any{
		"value":      js.ValueOf("NetStack"),
		"enumerable": js.ValueOf(false),
	})

	netStackPrototype.Set("constructor", netStackClass)

	netStackConstructor := netStackPrototype.Get("constructor")
	globalObject.Call("defineProperty", netStackConstructor, "name", map[string]any{
		"value":      js.ValueOf("NetStack"),
		"enumerable": js.ValueOf(false),
	})

	netStackPrototype.Set("injectEthernetFrame", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		frameByteArray := args[0]

		frameBuffer := make([]byte, frameByteArray.Get("byteLength").Int())
		js.CopyBytesToGo(frameBuffer, frameByteArray)

		frame := eth.Frame(frameBuffer)

		log.Printf("Incoming Dst MAC: %s\n", frame.Destination())
		log.Printf("Incoming Src MAC: %s\n", frame.Source())
		log.Printf("Incoming Ethertype: % x\n", frame.Ethertype())
		log.Printf("Incoming Frame: % x\n", frame)

		etherType := frame.Ethertype()
		proto := binary.BigEndian.Uint16(etherType[:])

		pkt := stack.NewPacketBuffer(stack.PacketBufferOptions{
			Payload: bufferv2.MakeWithData(frame),
		})

		channelEndpoint.InjectInbound(tcpip.NetworkProtocolNumber(proto), pkt)
		pkt.DecRef()
		return nil
	}))

	go func() {
		for {
			b := make([]byte, 512)

			view, ok := <-notify.incomingPacket
			if !ok {
				log.Fatal("failed to read packet")
			}

			s, _ := view.Read(b)

			log.Printf("Outgoing Frame: % x\n", b[:s])
		}
	}()

	js.Global().Set("NetStack", netStackClass)

	// Keep the program running
	<-make(chan bool)
}
