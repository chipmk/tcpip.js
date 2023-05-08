package impl

import (
	"fmt"
	"log"
	"syscall/js"

	"github.com/chipmk/tcpip.js/pkg/bridge"
	"gvisor.dev/gvisor/pkg/tcpip"
	"gvisor.dev/gvisor/pkg/tcpip/adapters/gonet"
	"gvisor.dev/gvisor/pkg/tcpip/network/ipv4"
)

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

		stackId := this.Get("options").Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		addr := tcpip.FullAddress{
			NIC: 1,
			// TODO: don't hardcode address
			Addr: tcpip.Address("127.0.0.1"),
			Port: uint16(port.Int()),
		}

		go func() {
			conn, dialErr := gonet.DialTCP(s.stack, addr, ipv4.ProtocolNumber)
			if dialErr != nil {
				// TODO: reject in callback/event
				log.Fatal("dial error")
			}

			for {
				buffer := make([]byte, 512)
				s, readErr := conn.Read(buffer)
				if readErr != nil {
					// TODO: reject in event
					log.Fatal("read error")
				}

				uint8Array := bridge.GlobalUint8Array.New(js.ValueOf(s))
				js.CopyBytesToJS(uint8Array, buffer[:s])

				this.Call("emit", "data", uint8Array)
			}
		}()

		return this, nil
	})

}
