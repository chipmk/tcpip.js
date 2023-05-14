package main

import (
	"github.com/chipmk/tcpip.js/pkg/impl"
)

func main() {
	impl.ImplementTcpipStack()
	impl.ImplementLoopbackInterface()
	impl.ImplementTapInterface()
	impl.ImplementTunInterface()
	impl.ImplementSocket()
	impl.ImplementServer()

	// Keep the program running
	<-make(chan bool)
}
