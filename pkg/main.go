package main

import (
	"github.com/chipmk/tcpip.js/pkg/impl"
)

func main() {
	impl.ImplementTcpipStack()
	impl.ImplementTapInterface()
	impl.ImplementSocket()
	impl.ImplementServer()

	// Keep the program running
	<-make(chan bool)
}
