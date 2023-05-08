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

type Socket struct {
	conn *gonet.TCPConn
}

func ImplementSocket() {
	class := bridge.NewJsClassBridge(js.Global().Get("Socket"))

	class.ImplementMethod("_init", func(this js.Value, args []js.Value) (any, error) {
		options := args[0]

		if options.IsUndefined() {
			return nil, fmt.Errorf("missing options")
		}

		// TODO: implement net.Socket options

		return nil, nil
	})

	class.ImplementMethod("connect", func(this js.Value, args []js.Value) (any, error) {
		options := args[0]

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

		socket := &Socket{}
		socketId := s.sockets.Set(socket)
		bridge.GlobalObject.Call("defineProperty", this, "socketId", map[string]any{
			"value": socketId,
		})

		hostString := "127.0.0.1"
		if !host.IsUndefined() {
			hostString = host.String()
		}

		addr, parseErr := netip.ParseAddr(hostString)
		if parseErr != nil {
			return nil, parseErr
		}

		fullAddress := tcpip.FullAddress{
			NIC:  1,
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
		}()

		return this, nil
	})

	class.ImplementMethod("_read", func(this js.Value, args []js.Value) (any, error) {
		size := args[0]

		stackId := this.Get("options").Get("stack").Get("stackId").Int()
		stack := Stacks.Get(uint32(stackId))

		socketId := this.Get("socketId").Int()
		socket := stack.sockets.Get(uint32(socketId))

		if socket.conn == nil {
			return nil, nil
		}

		buffer := make([]byte, size.Int())
		s, readErr := socket.conn.Read(buffer)
		if readErr != nil {
			this.Call("emit", "error", bridge.GlobalError.New(readErr.Error()))
			return nil, nil
		}

		uint8Array := bridge.GlobalUint8Array.New(js.ValueOf(s))
		js.CopyBytesToJS(uint8Array, buffer[:s])

		return uint8Array, nil
	})

}
