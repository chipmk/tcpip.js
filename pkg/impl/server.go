package impl

import (
	"fmt"
	"net/netip"
	"syscall/js"

	"github.com/chipmk/tcpip.js/pkg/bridge"
	"github.com/chipmk/tcpip.js/pkg/reference"
	"gvisor.dev/gvisor/pkg/tcpip"
	"gvisor.dev/gvisor/pkg/tcpip/adapters/gonet"
	"gvisor.dev/gvisor/pkg/tcpip/network/ipv4"
)

type Server struct {
	listener *gonet.TCPListener
	sockets  *reference.Reference[*Socket]
}

func ImplementServer() {
	class := bridge.NewJsClassBridge(bridge.TcpipNamespace.Get("Server"))

	class.ImplementMethod("_init", func(this js.Value, args []js.Value) (any, error) {
		options := args[0]

		if options.IsUndefined() {
			return nil, fmt.Errorf("missing options")
		}

		stackId := this.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		server := &Server{
			sockets: &reference.Reference[*Socket]{},
		}
		serverId := s.servers.Set(server)
		bridge.GlobalObject.Call("defineProperty", this, "serverId", map[string]any{
			"value": serverId,
		})

		bridge.GlobalObject.Call("defineProperty", this, "listening", map[string]any{
			"get": bridge.FuncOf(func(this js.Value, args []js.Value) (any, error) {
				listening := server.listener != nil
				return listening, nil
			}),
		})

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

		serverId := this.Get("serverId").Int()
		server := s.servers.Get(uint32(serverId))

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

		// Start listening after the current call stack
		js.Global().Call("setTimeout", js.FuncOf(func(self js.Value, args []js.Value) any {
			go func() {
				listener, listenErr := gonet.ListenTCP(s.stack, fullAddress, ipv4.ProtocolNumber)
				if listenErr != nil {
					this.Call("emit", "error", bridge.GlobalError.New(listenErr.Error()))
					return
				}

				server.listener = listener

				this.Call("emit", "listening")

				for {
					if server.listener == nil {
						return
					}
					conn, acceptErr := server.listener.Accept()
					if acceptErr != nil {
						this.Call("emit", "error", bridge.GlobalError.New(acceptErr.Error()))
						return
					}

					jsSocket := bridge.TcpipNamespace.Get("Socket").New(s.jsInstance, map[string]interface{}{})

					socketId := jsSocket.Get("socketId").Int()
					socket := s.sockets.Get(uint32(socketId))
					socket.conn = conn

					serverSocketId := server.sockets.Set(socket)

					jsSocket.Call("on", "close", js.FuncOf(func(self js.Value, args []js.Value) any {
						server.sockets.Remove(serverSocketId)
						return nil
					}))

					this.Call("emit", "connection", jsSocket)
				}
			}()
			return nil
		}), 0)

		return this, nil
	})

	class.ImplementMethod("close", func(this js.Value, args []js.Value) (any, error) {
		var callback js.Value
		if len(args) > 0 {
			callback = args[0]
		}

		stackId := this.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		serverId := this.Get("serverId").Int()
		server := s.servers.Get(uint32(serverId))

		// Run after the current call stack
		js.Global().Call("setTimeout", js.FuncOf(func(self js.Value, args []js.Value) any {
			if !callback.IsUndefined() && server.listener == nil {
				callback.Invoke(bridge.GlobalError.New("Server is not running."))
				return nil
			}

			err := server.listener.Close()

			if !callback.IsUndefined() && err != nil {
				callback.Invoke(bridge.GlobalError.New(err.Error()))
				return nil
			}

			if !callback.IsUndefined() {
				this.Call("once", "close", callback)
			}

			this.Call("emit", "close")

			return nil
		}), 0)

		return this, nil
	})

	class.ImplementMethod("getConnections", func(this js.Value, args []js.Value) (any, error) {
		var callback js.Value
		if len(args) > 0 {
			callback = args[0]
		}

		stackId := this.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		serverId := this.Get("serverId").Int()
		server := s.servers.Get(uint32(serverId))

		if server.listener == nil {
			callback.Invoke(bridge.GlobalError.New("Server is not open"))
			return this, nil
		}

		// Invoke the callback after the current call stack
		js.Global().Call("setTimeout", js.FuncOf(func(self js.Value, args []js.Value) any {
			callback.Invoke(js.Undefined(), server.sockets.Count())
			return nil
		}), 0)

		return this, nil
	})

	class.ImplementMethod("address", func(this js.Value, args []js.Value) (any, error) {
		stackId := this.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		serverId := this.Get("serverId").Int()
		server := s.servers.Get(uint32(serverId))

		addressObject := js.ValueOf(map[string]any{
			"address": server.listener.Addr().Network(),
			"family":  "IPv4",
		})

		return addressObject, nil
	})
}
