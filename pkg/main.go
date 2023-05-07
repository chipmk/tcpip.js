package main

import (
	"github.com/chipmk/userspace-tcpip-poc/pkg/impl"
)

func main() {
	impl.ImplementTcpipStack()
	impl.ImplementSocket()

	// Keep the program running
	<-make(chan bool)
}
