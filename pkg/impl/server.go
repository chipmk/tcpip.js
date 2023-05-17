package impl

import (
	"fmt"
	"net/netip"
	"syscall/js"

	"github.com/chipmk/tcpip.js/pkg/bridge"
	"gvisor.dev/gvisor/pkg/tcpip"
	"gvisor.dev/gvisor/pkg/tcpip/adapters/gonet"
	"gvisor.dev/gvisor/pkg/tcpip/network/ipv4"
)

type Server struct {
}

func ImplementServer() {
	class := bridge.NewJsClassBridge(bridge.TcpipNamespace.Get("Server"))

	class.ImplementMethod("_init", func(this js.Value, args []js.Value) (any, error) {
		options := args[0]

		if options.IsUndefined() {
			return nil, fmt.Errorf("missing options")
		}

		// TODO: implement net.Server options

		return nil, nil
	})

	class.ImplementMethod("listen", func(this js.Value, args []js.Value) (any, error) {
		options := args[0]

		if options.IsUndefined() {
			return nil, fmt.Errorf("missing options")
		}

		port := options.Get("port")

		if port.IsUndefined() {
			return nil, fmt.Errorf("port is required")
		}

		host := options.Get("host")

		stackId := this.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		var addr netip.Addr

		if !host.IsUndefined() {
			parsedAddr, parseErr := netip.ParseAddr(host.String())
			if parseErr != nil {
				return nil, parseErr
			}
			addr = parsedAddr
		}

		fullAddress := tcpip.FullAddress{
			Addr: tcpip.Address(addr.AsSlice()),
			Port: uint16(port.Int()),
		}

		go func() {
			listener, listenErr := gonet.ListenTCP(s.stack, fullAddress, ipv4.ProtocolNumber)
			if listenErr != nil {
				this.Call("emit", "error", bridge.GlobalError.New(listenErr.Error()))
				return
			}

			for {
				conn, acceptErr := listener.Accept()
				if acceptErr != nil {
					this.Call("emit", "error", bridge.GlobalError.New(acceptErr.Error()))
					return
				}

				jsSocket := bridge.TcpipNamespace.Get("Socket").New(s.jsInstance, map[string]interface{}{})

				socketId := jsSocket.Get("socketId").Int()
				socket := s.sockets.Get(uint32(socketId))
				socket.conn = conn

				this.Call("emit", "connection", jsSocket)
			}
		}()

		return this, nil
	})
}
