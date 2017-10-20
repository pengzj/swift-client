package sdk

import (
	"net"
	"log"
	"fmt"
	"github.com/pengzj/swift-protocol"
	"bytes"
	"encoding/json"
	"time"
	"math"
)


var (
	heartbeatInterval = 5 * time.Second
)

type route struct {
	Id int
	Name string
}

var routes []route


type swift struct {
	handleMap map[string]int
	eventHandleMap map[int]string
	eventMap map[string]func([]byte)
}

func  On(name string, handler func([]byte))  {
	std.eventMap[name] = handler
}

func  emit(name string, data[]byte)  {
	handler := std.eventMap[name]
	if handler != nil {
		handler(data)
	}
}

func hasRoute() bool {
	return len(std.handleMap) > 0
}

func getRouteId(name string) (routeId int) {
	routeId = std.handleMap[name]
	return
}


type Client struct {
	conn net.Conn
	reqId int

	send chan []byte

	receive chan []byte

}

func NewClient() *Client {
	return &Client{
		send:make(chan []byte, 10),
		receive:make(chan []byte),
	}
}

func (client *Client) Close()  {
	client.conn.Close()
}

func (client *Client) Connect(host, port string)  {
	conn, err := net.Dial("tcp", ":3301")
	if err != nil {
		log.Fatal(err)
	}

	client.conn = conn
	go client.readDump()
	go client.writeDump()

	fmt.Println("connect to server ...")

	if hasRoute() == false {
		//handshake get get route
		_, err = conn.Write(protocol.Encode(protocol.TYPE_HANDSHAKE, []byte{}))
		if err != nil {
			log.Fatal(err)
		}

		for {
			select {
			case <-client.receive:
				return
			}
		}
	}
}

func (client *Client) write(data []byte)  {
	client.send <- data
}

func (client *Client) Request(route string, data []byte) []byte  {
	client.reqId++
	var reqId = client.reqId

	var routeId = getRouteId(route)

	client.write(protocol.Encode(protocol.TYPE_DATA_REQUEST, protocol.MessageEncode(reqId, routeId, data)))

	//signal
	for {
		select {
		case message := <- client.receive:
			return message
		}
	}
}

func (client *Client) Notify(route string, data []byte)  {
	client.write(protocol.Encode(protocol.TYPE_DATA_NOTIFY, protocol.MessageEncode(0, 0, data)))
}

func (client *Client) readDump()  {
	var buffer bytes.Buffer
	var headerLength = protocol.GetHeadLength()
	var currentTotalLength int
	var length int
	for {
		data := make([]byte, math.MaxUint16)
		n, err := client.conn.Read(data)
		if err != nil {
			log.Fatal(err)
		}
		buf := make([]byte, n)
		copy(buf, data[0:n])

		buffer.Write(buf)

		//do with packet splicing
		for {
			currentTotalLength = len(buffer.Bytes())
			length = headerLength +  protocol.GetBodyLength(buffer.Bytes())
			message := make([]byte, length)

			if length > currentTotalLength {
				break
			}

			_, err = buffer.Read(message)
			if err != nil {
				log.Fatalf("read data error: %v", err)
			}

			client.handle(message)

			leftLength := currentTotalLength - length
			if leftLength > 0 {
				leftData := make([]byte, leftLength)
				_, err = buffer.Read(leftData)
				if err != nil {
					log.Fatal("package data error: %v", err)
				}
				buffer.Reset()
				buffer.Write(leftData)
			} else {
				buffer.Reset()
				break
			}
		}
	}
}

func (client *Client) handle(data []byte)  {
	packageType, body := protocol.Decode(data)
	switch packageType {
	case protocol.TYPE_HANDSHAKE_ACK:
		_, _, in := protocol.MessageDecode(body)
		client.onHandshake(in)
	case protocol.TYPE_DATA_PUSH:
		_, routeId, in := protocol.MessageDecode(body)
		client.onPush(routeId, in)
	case protocol.TYPE_HEARTBEAT:
		client.onHeartbeat(body)
	case protocol.TYPE_DATA_RESPONSE:
		messageId, routeId, msg := protocol.MessageDecode(body)
		client.onResponse(messageId,routeId,msg)

	}
}

func (client *Client) onHandshake(data []byte)  {
	err := json.Unmarshal(data, &routes)
	if err != nil {
		log.Fatal(err)
	}
	for _, v :=range routes {
		std.handleMap[v.Name] = v.Id

		for k, _ :=range std.eventMap {
			if v.Name == k {
				std.eventHandleMap[v.Id] = k
			}
		}
	}
	client.receive <- []byte{}
}

func (client *Client) onHeartbeat(data []byte)  {
	fmt.Println("receive heartbeat: ", string(data))
}

func (client *Client) onPush(routeId int, data []byte)  {
	name := std.eventHandleMap[routeId]
	if len(name) > 0 {
		std.eventMap[name](data)
	}
}

func (client *Client) onResponse(messageId, routeId int, data []byte)  {
	client.receive <- data
}

func (client *Client) writeDump()  {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()
	var buffer bytes.Buffer
	for {
		select {
		case message := <-client.send:
			buffer.Write(message)

			n := len(client.send)
			for i := 0; i < n; i++ {
				buffer.Write(<-client.send)
			}

			_, err := client.conn.Write(message)
			if err != nil {
				return
			}
		case <-ticker.C:
			_, err := client.conn.Write(protocol.Encode(protocol.TYPE_HEARTBEAT, []byte{}))
			if err != nil {
				return
			}
		}
	}
}


var std *swift


func init() {
	std = &swift{
		handleMap:make(map[string]int),
		eventHandleMap:make(map[int]string),
		eventMap:make(map[string]func([]byte)),
	}
}