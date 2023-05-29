package main

import (
	"github.com/chipmk/tcpip.js/pkg/impl"
)

func main() {
	impl.ImplementStack()
	impl.ImplementLoopbackInterface()
	impl.ImplementTapInterface()
	impl.ImplementTunInterface()
	impl.ImplementSocket()
	impl.ImplementServer()

	// Keep the program running
	select {}
}
