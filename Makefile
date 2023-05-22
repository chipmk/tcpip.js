build::
	GOOS=js GOARCH=wasm go build -o packages/tcpip/dist/tcpip.wasm pkg/main.go

build-wstunnel::
	go build -o wstunnel pkg/wstunnel/main.go

setup-tap::
	sudo ip addr add 10.1.0.10/24 dev tap0
	sudo ip link set dev tap0 up

setup-tun-macos::
	sudo ifconfig $(name) 10.2.0.2/24 10.2.0.1 up