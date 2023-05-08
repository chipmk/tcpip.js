package main

import (
	"github.com/chipmk/tcpip.js/pkg/impl"
)

func main() {
	impl.ImplementTcpipStack()
	impl.ImplementSocket()

	// Keep the program running
	<-make(chan bool)
}
