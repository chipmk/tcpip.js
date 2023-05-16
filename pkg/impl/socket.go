package impl

import (
	"fmt"
	"net"
	"net/netip"
	"syscall/js"

	"github.com/chipmk/tcpip.js/pkg/bridge"
	"gvisor.dev/gvisor/pkg/tcpip"
	"gvisor.dev/gvisor/pkg/tcpip/adapters/gonet"
	"gvisor.dev/gvisor/pkg/tcpip/network/ipv4"
)

type Socket struct {
	conn      net.Conn
	connected chan bool
}

func ImplementSocket() {
	class := bridge.NewJsClassBridge(bridge.TcpipNamespace.Get("Socket"))

	class.ImplementMethod("_init", func(this js.Value, args []js.Value) (any, error) {
		options := args[0]

		if options.IsUndefined() {
			return nil, fmt.Errorf("missing options")
		}

		stackId := options.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		socket := &Socket{
			connected: make(chan bool),
		}
		socketId := s.sockets.Set(socket)
		bridge.GlobalObject.Call("defineProperty", this, "socketId", map[string]any{
			"value": socketId,
		})

		// TODO: implement net.Socket options

		return nil, nil
	})

	class.ImplementMethod("connect", func(this js.Value, args []js.Value) (any, error) {
		options := args[0]

		var callback js.Value

		if len(args) > 1 {
			callback = args[1]
		}

		if options.IsUndefined() {
			return nil, fmt.Errorf("missing options")
		}

		port := options.Get("port")

		if port.IsUndefined() {
			return nil, fmt.Errorf("port is required")
		}

		host := options.Get("host")

		stackId := this.Get("options").Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		socketId := this.Get("socketId").Int()
		socket := s.sockets.Get(uint32(socketId))

		hostString := "127.0.0.1"
		if !host.IsUndefined() {
			hostString = host.String()
		}

		addr, parseErr := netip.ParseAddr(hostString)
		if parseErr != nil {
			return nil, parseErr
		}

		fullAddress := tcpip.FullAddress{
			Addr: tcpip.Address(addr.AsSlice()),
			Port: uint16(port.Int()),
		}

		go func() {
			conn, dialErr := gonet.DialTCP(s.stack, fullAddress, ipv4.ProtocolNumber)
			if dialErr != nil {
				this.Call("emit", "error", bridge.GlobalError.New(dialErr.Error()))
				return
			}
			socket.conn = conn

			select {
			case socket.connected <- true:
			default:
			}

			this.Call("emit", "connect")

			if !callback.IsUndefined() {
				callback.Invoke()
			}
		}()

		return this, nil
	})

	class.ImplementMethod("_read", func(this js.Value, args []js.Value) (any, error) {
		size := args[0]

		stackId := this.Get("options").Get("stack").Get("stackId").Int()
		stack := Stacks.Get(uint32(stackId))

		socketId := this.Get("socketId").Int()
		socket := stack.sockets.Get(uint32(socketId))

		go func() {
			if socket.conn == nil {
				<-socket.connected
			}

			buffer := make([]byte, size.Int())

			// TODO: decide if we need to handle errors
			s, _ := socket.conn.Read(buffer)

			if s == 0 {
				this.Call("push", js.Null())
				this.Call("end")
				return
			}

			uint8Array := bridge.GlobalUint8Array.New(js.ValueOf(s))
			js.CopyBytesToJS(uint8Array, buffer[:s])

			this.Call("push", uint8Array)
		}()

		return nil, nil
	})

	class.ImplementMethod("_write", func(this js.Value, args []js.Value) (any, error) {
		chunk := args[0]
		callback := args[2]

		stackId := this.Get("options").Get("stack").Get("stackId").Int()
		stack := Stacks.Get(uint32(stackId))

		socketId := this.Get("socketId").Int()
		socket := stack.sockets.Get(uint32(socketId))

		go func() {
			if socket.conn == nil {
				<-socket.connected
			}

			buffer := make([]byte, chunk.Length())
			js.CopyBytesToGo(buffer, chunk)

			_, writeErr := socket.conn.Write(buffer)
			if writeErr != nil {
				callback.Invoke(bridge.GlobalError.New(writeErr.Error()))
				return
			}

			callback.Invoke(js.Null())
		}()

		return nil, nil
	})

	class.ImplementMethod("setNoDelay", func(this js.Value, args []js.Value) (any, error) {
		return nil, nil
	})
}
