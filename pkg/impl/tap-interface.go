package impl

import (
	"encoding/binary"
	"errors"
	"fmt"
	"log"
	"net/netip"
	"syscall/js"

	"github.com/chipmk/tcpip.js/pkg/bridge"
	eth "github.com/songgao/packets/ethernet"
	"gvisor.dev/gvisor/pkg/bufferv2"
	"gvisor.dev/gvisor/pkg/tcpip"
	"gvisor.dev/gvisor/pkg/tcpip/link/channel"
	"gvisor.dev/gvisor/pkg/tcpip/link/ethernet"
	"gvisor.dev/gvisor/pkg/tcpip/network/ipv4"
	"gvisor.dev/gvisor/pkg/tcpip/stack"
)

type TapInterface struct {
	endpoint       *channel.Endpoint
	mtu            uint32
	incomingPacket chan *bufferv2.View
	nicID          tcpip.NICID
}

func (s *TapInterface) WriteNotify() {
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

func ImplementTapInterface() {
	class := bridge.NewJsClassBridge(bridge.TcpipNamespace.Get("TapInterface"))

	class.ImplementMethod("_init", func(this js.Value, args []js.Value) (any, error) {
		options := args[0]

		if options.IsUndefined() {
			return nil, fmt.Errorf("options not set")
		}

		stackId := this.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		ipNetwork := options.Get("ipNetwork")

		if ipNetwork.IsUndefined() {
			return nil, fmt.Errorf("ipNetwork not set")
		}

		macAddress := options.Get("macAddress")

		if macAddress.IsUndefined() {
			return nil, fmt.Errorf("macAddress not set")
		}

		prefix, prefixErr := netip.ParsePrefix(ipNetwork.String())
		if prefixErr != nil {
			return nil, prefixErr
		}

		localLinkAddr, parseMacError := tcpip.ParseMACAddress(macAddress.String())
		if parseMacError != nil {
			return nil, parseMacError
		}

		mtu := uint32(1500)

		channelEndpoint := channel.New(1024, mtu, localLinkAddr)
		ethernetEndpoint := ethernet.New(channelEndpoint)

		tapInterface := &TapInterface{
			endpoint:       channelEndpoint,
			mtu:            mtu,
			incomingPacket: make(chan *bufferv2.View),
		}

		interfaceId := s.interfaces.Set(tapInterface)
		bridge.GlobalObject.Call("defineProperty", this, "interfaceId", map[string]any{
			"value": interfaceId,
		})
		nicID := tcpip.NICID(interfaceId)
		tapInterface.nicID = nicID

		createNicErr := s.stack.CreateNIC(nicID, ethernetEndpoint)
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

		channelEndpoint.AddNotify(tapInterface)

		go func() {
			for {
				b := make([]byte, 512)

				view, ok := <-tapInterface.incomingPacket
				if !ok {
					log.Fatal("failed to read packet")
				}

				s, _ := view.Read(b)

				uint8Array := bridge.GlobalUint8Array.New(js.ValueOf(s))
				js.CopyBytesToJS(uint8Array, b[:s])

				this.Call("emit", "frame", uint8Array)
			}
		}()

		return nil, nil
	})

	class.ImplementMethod("injectFrame", func(this js.Value, args []js.Value) (any, error) {
		frameByteArray := args[0]

		stackId := this.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		interfaceId := this.Get("interfaceId").Int()
		tapInterface := s.interfaces.Get(uint32(interfaceId)).(*TapInterface)

		frameBuffer := make([]byte, frameByteArray.Get("byteLength").Int())
		js.CopyBytesToGo(frameBuffer, frameByteArray)

		frame := eth.Frame(frameBuffer)

		etherType := frame.Ethertype()
		proto := binary.BigEndian.Uint16(etherType[:])

		pkt := stack.NewPacketBuffer(stack.PacketBufferOptions{
			Payload: bufferv2.MakeWithData(frame),
		})

		tapInterface.endpoint.InjectInbound(tcpip.NetworkProtocolNumber(proto), pkt)
		pkt.DecRef()

		return nil, nil
	})
}
