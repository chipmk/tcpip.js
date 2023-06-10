package impl

import (
	"errors"
	"fmt"
	"log"
	"syscall/js"

	"github.com/chipmk/tcpip.js/pkg/bridge"
	"gvisor.dev/gvisor/pkg/bufferv2"
	"gvisor.dev/gvisor/pkg/tcpip"
	"gvisor.dev/gvisor/pkg/tcpip/header"
	"gvisor.dev/gvisor/pkg/tcpip/link/channel"
	"gvisor.dev/gvisor/pkg/tcpip/stack"
)

type TunInterface struct {
	endpoint       *channel.Endpoint
	mtu            uint32
	incomingPacket chan *bufferv2.View
	nicID          tcpip.NICID
}

func (s *TunInterface) WriteNotify() {
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

func ImplementTunInterface() {
	class := bridge.NewJsClassBridge(bridge.TcpipNamespace.Get("TunInterface"))

	class.ImplementMethod("_init", func(this js.Value, args []js.Value) (any, error) {
		options := args[0]

		if options.IsUndefined() {
			return nil, fmt.Errorf("options not set")
		}

		stackId := this.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		mtu := uint32(1500)

		channelEndpoint := channel.New(1024, mtu, "")

		TunInterface := &TunInterface{
			endpoint:       channelEndpoint,
			mtu:            mtu,
			incomingPacket: make(chan *bufferv2.View),
		}

		interfaceId := s.interfaces.Set(TunInterface)
		bridge.GlobalObject.Call("defineProperty", this, "interfaceId", map[string]any{
			"value": interfaceId,
		})
		nicID := tcpip.NICID(interfaceId)
		TunInterface.nicID = nicID

		createNicErr := s.stack.CreateNIC(nicID, channelEndpoint)
		if createNicErr != nil {
			return nil, errors.New(createNicErr.String())
		}

		initError := initCommon(s.stack, nicID, options)
		if initError != nil {
			return nil, initError
		}

		channelEndpoint.AddNotify(TunInterface)

		go func() {
			for {
				b := make([]byte, 512)

				view, ok := <-TunInterface.incomingPacket
				if !ok {
					log.Fatal("failed to read packet")
				}

				s, _ := view.Read(b)

				uint8Array := bridge.GlobalUint8Array.New(js.ValueOf(s))
				js.CopyBytesToJS(uint8Array, b[:s])

				this.Call("emit", "packet", uint8Array)
			}
		}()

		return nil, nil
	})

	class.ImplementMethod("injectPacket", func(this js.Value, args []js.Value) (any, error) {
		frameByteArray := args[0]

		stackId := this.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		interfaceId := this.Get("interfaceId").Int()
		tunInterface := s.interfaces.Get(uint32(interfaceId)).(*TunInterface)

		packetBuffer := make([]byte, frameByteArray.Get("byteLength").Int())
		js.CopyBytesToGo(packetBuffer, frameByteArray)

		pkt := stack.NewPacketBuffer(stack.PacketBufferOptions{
			Payload: bufferv2.MakeWithData(packetBuffer),
		})

		switch packetBuffer[0] >> 4 {
		case 4:
			tunInterface.endpoint.InjectInbound(header.IPv4ProtocolNumber, pkt)
		case 6:
			tunInterface.endpoint.InjectInbound(header.IPv6ProtocolNumber, pkt)
		default:
			return nil, fmt.Errorf("unknown protocol")
		}
		pkt.DecRef()

		return nil, nil
	})
}
