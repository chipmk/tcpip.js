package main

import (
	"flag"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/songgao/water"
)

var addr = flag.String("addr", "localhost:8080", "http service address")

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func main() {
	ifce, err := water.New(water.Config{
		DeviceType: water.TUN,
	})
	if err != nil {
		log.Fatal(err)
	}

	log.Printf("Interface Name: %s\n", ifce.Name())

	http.HandleFunc("/tun-proxy", func(w http.ResponseWriter, r *http.Request) {
		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Print("upgrade:", err)
			return
		}
		defer c.Close()

		log.Printf("Websocket client connected\n")

		packet := make([]byte, 2000)

		// TODO: decouple TUN interface from single websocket connection
		go func() {
			for {
				n, err := ifce.Read(packet)
				if err != nil {
					log.Fatal(err)
				}
				log.Printf("Outgoing packet: % x\n", packet[:n])

				err = c.WriteMessage(websocket.BinaryMessage, packet[:n])
				if err != nil {
					log.Println("write:", err)
					break
				}
			}
		}()

		for {
			mt, message, err := c.ReadMessage()
			if mt != websocket.BinaryMessage {
				// TODO: throw error
				break
			}
			if err != nil {
				log.Println("read:", err)
				break
			}
			log.Printf("Incoming packet: % x", message)
			ifce.Write(message)
		}
	})

	log.Fatal(http.ListenAndServe(*addr, nil))
}
