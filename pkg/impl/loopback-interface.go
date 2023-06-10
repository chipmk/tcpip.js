package impl

import (
	"errors"
	"fmt"
	"syscall/js"

	"github.com/chipmk/tcpip.js/pkg/bridge"
	"gvisor.dev/gvisor/pkg/tcpip"
	"gvisor.dev/gvisor/pkg/tcpip/link/loopback"
)

type LoopbackInterface struct {
	nicID tcpip.NICID
}

func ImplementLoopbackInterface() {
	class := bridge.NewJsClassBridge(bridge.TcpipNamespace.Get("LoopbackInterface"))

	class.ImplementMethod("_init", func(this js.Value, args []js.Value) (any, error) {
		options := args[0]

		if options.IsUndefined() {
			return nil, fmt.Errorf("options not set")
		}

		stackId := this.Get("stack").Get("stackId").Int()
		s := Stacks.Get(uint32(stackId))

		loopbackEndpoint := loopback.New()
		loopbackInterface := &LoopbackInterface{}

		interfaceId := s.interfaces.Set(loopbackInterface)
		bridge.GlobalObject.Call("defineProperty", this, "interfaceId", map[string]any{
			"value": interfaceId,
		})
		nicID := tcpip.NICID(interfaceId)
		loopbackInterface.nicID = nicID

		createNicErr := s.stack.CreateNIC(nicID, loopbackEndpoint)
		if createNicErr != nil {
			return nil, errors.New(createNicErr.String())
		}

		initError := initCommon(s.stack, nicID, options)
		if initError != nil {
			return nil, initError
		}

		return nil, nil
	})
}
