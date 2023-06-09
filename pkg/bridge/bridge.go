package bridge

import "syscall/js"

var GlobalObject = js.Global().Get("Object")
var GlobalError = js.Global().Get("Error")
var GlobalUint8Array = js.Global().Get("Uint8Array")
var TcpipNamespace = js.Global().Get("@tcpip/stack")

func FuncOf(fn func(this js.Value, args []js.Value) (any, error)) js.Value {
	unwrapFn := TcpipNamespace.Get("unwrap")

	wrappedFn := js.FuncOf(func(this js.Value, args []js.Value) any {
		res, err := fn(this, args)

		if err != nil {
			return []interface{}{nil, GlobalError.New(err.Error())}
		}

		return []interface{}{res, nil}
	})

	return unwrapFn.Invoke(wrappedFn)
}

type JsClass struct {
	class     js.Value
	prototype js.Value
}

func NewJsClassBridge(classRef js.Value) *JsClass {
	prototype := classRef.Get("prototype")
	return &JsClass{
		class:     classRef,
		prototype: prototype,
	}
}

func (c *JsClass) ImplementMethod(methodName string, fn func(this js.Value, args []js.Value) (any, error)) {
	c.prototype.Set(methodName, FuncOf(fn))
}
