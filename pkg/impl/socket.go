package impl

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"syscall/js"
	"time"

	"github.com/chipmk/tcpip.js/pkg/bridge"
	"gvisor.dev/gvisor/pkg/tcpip"
	"gvisor.dev/gvisor/pkg/tcpip/adapters/gonet"
	"gvisor.dev/gvisor/pkg/tcpip/network/ipv4"
	"gvisor.dev/gvisor/pkg/tcpip/stack"
	"gvisor.dev/gvisor/pkg/tcpip/transport/tcp"
	"gvisor.dev/gvisor/pkg/waiter"
)

type Socket struct {
	conn         net.Conn
	ep           tcpip.Endpoint
	connected    chan bool
	activity     chan bool
	resetTimeout chan bool
}

func ImplementSocket() {
	class := bridge.NewJsClassBridge(bridge.TcpipNamespace.Get("Socket"))

	class.ImplementMethod("_init", func(this js.Value, args []js.Value) (any, error) {
		options := args[0]

		if options.IsUndefined() {
			return nil, fmt.Errorf("missing options")
		}

		stackId := this.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		socket := &Socket{
			connected:    make(chan bool),
			activity:     make(chan bool),
			resetTimeout: make(chan bool),
		}
		socketId := s.sockets.Set(socket)
		bridge.GlobalObject.Call("defineProperty", this, "socketId", map[string]any{
			"value": socketId,
		})

		bridge.GlobalObject.Call("defineProperty", this, "localAddress", map[string]any{
			"get": bridge.FuncOf(func(this js.Value, args []js.Value) (any, error) {
				if socket.ep == nil {
					return js.Undefined(), nil
				}

				fullAddr, err := socket.ep.GetLocalAddress()
				if err != nil {
					return nil, errors.New(err.String())
				}

				return fullAddr.Addr.String(), nil
			}),
		})

		bridge.GlobalObject.Call("defineProperty", this, "localPort", map[string]any{
			"get": bridge.FuncOf(func(this js.Value, args []js.Value) (any, error) {
				if socket.ep == nil {
					return js.Undefined(), nil
				}

				fullAddr, err := socket.ep.GetLocalAddress()
				if err != nil {
					return nil, errors.New(err.String())
				}

				return fullAddr.Port, nil
			}),
		})

		bridge.GlobalObject.Call("defineProperty", this, "remoteAddress", map[string]any{
			"get": bridge.FuncOf(func(this js.Value, args []js.Value) (any, error) {
				if socket.ep == nil {
					return js.Undefined(), nil
				}

				fullAddr, err := socket.ep.GetRemoteAddress()
				if err != nil {
					return nil, errors.New(err.String())
				}

				return fullAddr.Addr.String(), nil
			}),
		})

		bridge.GlobalObject.Call("defineProperty", this, "remotePort", map[string]any{
			"get": bridge.FuncOf(func(this js.Value, args []js.Value) (any, error) {
				if socket.ep == nil {
					return js.Undefined(), nil
				}

				fullAddr, err := socket.ep.GetRemoteAddress()
				if err != nil {
					return js.Undefined(), errors.New(err.String())
				}

				return fullAddr.Port, nil
			}),
		})

		// TODO: implement net.Socket options

		return nil, nil
	})

	class.ImplementMethod("connect", func(this js.Value, args []js.Value) (any, error) {
		var options js.Value
		var port uint16
		var host string = "127.0.0.1"
		var noDelay bool = false
		var callback js.Value

		if args[0].Type() == js.TypeObject {
			options = args[0]

			if len(args) > 1 {
				callback = args[1]
			}

			if options.IsUndefined() {
				return nil, fmt.Errorf("missing options")
			}

			portJs := options.Get("port")

			if portJs.IsUndefined() {
				return nil, fmt.Errorf("port is required")
			}

			port = uint16(portJs.Int())

			hostJs := options.Get("host")

			if !hostJs.IsUndefined() {
				host = hostJs.String()

				// TODO: implement proper hosts file
				if host == "localhost" {
					host = "127.0.0.1"
				}
			}

			noDelayJs := options.Get("noDelay")
			if !noDelayJs.IsUndefined() {
				noDelay = noDelayJs.Bool()
			}
		} else {
			portJs := args[0]
			port = uint16(portJs.Int())

			if len(args) > 1 {
				if args[1].Type() == js.TypeString {
					hostJs := args[1]
					host = hostJs.String()

					// TODO: implement proper hosts file
					if host == "localhost" {
						host = "127.0.0.1"
					}
				} else {
					callback = args[1]
				}
			}

			if len(args) > 2 {
				callback = args[2]
			}
		}

		stackId := this.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		socketId := this.Get("socketId").Int()
		socket := s.sockets.Get(uint32(socketId))

		addr, parseErr := netip.ParseAddr(host)
		if parseErr != nil {
			return nil, parseErr
		}

		fullAddress := tcpip.FullAddress{
			Addr: tcpip.Address(addr.AsSlice()),
			Port: port,
		}

		// Start the connection after the current call stack
		js.Global().Call("setTimeout", js.FuncOf(func(self js.Value, args []js.Value) any {
			go func() {
				conn, ep, dialErr := DialTCPWithBind(context.Background(), s.stack, tcpip.FullAddress{}, fullAddress, ipv4.ProtocolNumber)
				if dialErr != nil {
					this.Call("emit", "error", bridge.GlobalError.New(dialErr.Error()))
					return
				}
				socket.conn = conn
				socket.ep = ep

				// Set connection options
				ep.SocketOptions().SetDelayOption(noDelay)

				select {
				case socket.connected <- true:
				default:
				}

				this.Call("emit", "connect")

				if !callback.IsUndefined() {
					callback.Invoke()
				}
			}()
			return nil
		}), 0)

		return this, nil
	})

	class.ImplementMethod("setNoDelay", func(this js.Value, args []js.Value) (any, error) {
		noDelay := true

		if len(args) > 0 {
			noDelay = args[0].Bool()
		}

		stackId := this.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		socketId := this.Get("socketId").Int()
		socket := s.sockets.Get(uint32(socketId))

		go func() {
			if socket.conn == nil {
				<-socket.connected
			}

			socket.ep.SocketOptions().SetDelayOption(!noDelay)
		}()

		return this, nil
	})

	class.ImplementMethod("setTimeout", func(this js.Value, args []js.Value) (any, error) {
		timeoutValue := args[0]

		var callback js.Value
		if len(args) > 1 {
			callback = args[1]
		}

		stackId := this.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		socketId := this.Get("socketId").Int()
		socket := s.sockets.Get(uint32(socketId))

		bridge.GlobalObject.Call("defineProperty", this, "timeout", map[string]any{
			"value":    timeoutValue,
			"writable": true,
		})

		// Reset any previous timeouts
		select {
		case socket.resetTimeout <- true:
		default:
		}

		timeout := timeoutValue.Int()

		if timeout == 0 {
			return nil, nil
		}

		go func() {
			if socket.conn == nil {
				<-socket.connected
			}
			for {
				select {
				case <-time.After(time.Duration(timeout) * time.Millisecond):
					if !callback.IsUndefined() {
						callback.Invoke()
					}
					this.Call("emit", "timeout")
					return
				case <-socket.activity:
				case <-socket.resetTimeout:
					return
				}
			}
		}()

		return nil, nil
	})

	class.ImplementMethod("_read", func(this js.Value, args []js.Value) (any, error) {
		size := args[0]

		stackId := this.Get("stack").Get("stackId").Int()
		stack := Stacks.Get(uint32(stackId))

		socketId := this.Get("socketId").Int()
		socket := stack.sockets.Get(uint32(socketId))

		timeout := this.Get("timeout")

		go func() {
			if socket.conn == nil {
				<-socket.connected
			}

			buffer := make([]byte, size.Int())

			// TODO: decide if we need to handle errors
			s, _ := socket.conn.Read(buffer)

			if !timeout.IsUndefined() && timeout.Int() > 0 {
				go func() {
					select {
					case socket.activity <- true:
					default:
					}
				}()
			}

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

		stackId := this.Get("stack").Get("stackId").Int()
		stack := Stacks.Get(uint32(stackId))

		socketId := this.Get("socketId").Int()
		socket := stack.sockets.Get(uint32(socketId))

		timeout := this.Get("timeout")

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

			if !timeout.IsUndefined() && timeout.Int() > 0 {
				go func() {
					select {
					case socket.activity <- true:
					default:
					}
				}()
			}

			callback.Invoke(js.Null())
		}()

		return nil, nil
	})
}

// gonet.DialTCPWithBind modified to return internal tcpip.Endpoint.
func DialTCPWithBind(ctx context.Context, s *stack.Stack, localAddr, remoteAddr tcpip.FullAddress, network tcpip.NetworkProtocolNumber) (*gonet.TCPConn, tcpip.Endpoint, error) {
	// Create TCP endpoint, then connect.
	var wq waiter.Queue
	ep, err := s.NewEndpoint(tcp.ProtocolNumber, network, &wq)
	if err != nil {
		return nil, nil, errors.New(err.String())
	}

	// Create wait queue entry that notifies a channel.
	//
	// We do this unconditionally as Connect will always return an error.
	waitEntry, notifyCh := waiter.NewChannelEntry(waiter.WritableEvents)
	wq.EventRegister(&waitEntry)
	defer wq.EventUnregister(&waitEntry)

	select {
	case <-ctx.Done():
		return nil, nil, ctx.Err()
	default:
	}

	// Bind before connect if requested.
	if localAddr != (tcpip.FullAddress{}) {
		if err = ep.Bind(localAddr); err != nil {
			return nil, nil, fmt.Errorf("ep.Bind(%+v) = %s", localAddr, err)
		}
	}

	err = ep.Connect(remoteAddr)
	if _, ok := err.(*tcpip.ErrConnectStarted); ok {
		select {
		case <-ctx.Done():
			ep.Close()
			return nil, nil, ctx.Err()
		case <-notifyCh:
		}

		err = ep.LastError()
	}
	if err != nil {
		ep.Close()
		return nil, nil, &net.OpError{
			Op:   "connect",
			Net:  "tcp",
			Addr: fullToTCPAddr(remoteAddr),
			Err:  errors.New(err.String()),
		}
	}

	return gonet.NewTCPConn(&wq, ep), ep, nil
}

func fullToTCPAddr(addr tcpip.FullAddress) *net.TCPAddr {
	return &net.TCPAddr{IP: net.IP(addr.Addr), Port: int(addr.Port)}
}
