package client

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/MetaGLM/glm-realtime-sdk/golang/events"
	"github.com/gorilla/websocket"
)

type RealtimeClient interface {
	Connect() error
	Disconnect() error
	Send(event *events.Event) error
	Wait()
}

type realtimeClient struct {
	url, apiKey string
	onReceived  func(event *events.Event) error
	conn        *websocket.Conn

	isConnected bool
	lock        sync.RWMutex
	wg          *sync.WaitGroup
}

func NewRealtimeClient(url, apiKey string, onReceived func(event *events.Event) error) *realtimeClient {
	return &realtimeClient{url: url, apiKey: apiKey, onReceived: onReceived}
}

func (r *realtimeClient) Connect() error {
	r.lock.Lock()
	defer r.lock.Unlock()
	if r.isConnected {
		return nil
	}
	var header http.Header
	if r.apiKey != "" {
		header = make(http.Header)
		header.Set("Authorization", fmt.Sprintf("Bearer %s", r.apiKey))
	}
	c, rsp, err := websocket.DefaultDialer.Dial(r.url, header)
	if err != nil {
		log.Printf("[RealtimeClient] WebSocket dial fail, url: %s, rsp: %v, err: %v\n", r.url, rsp, err)
		return err
	}
	c.SetCloseHandler(func(code int, reason string) error {
		log.Printf("[RealtimeClient] WebSocket closed with code: %d, reason: %s\n", code, reason)
		return nil
	})
	r.conn, r.isConnected, r.wg = c, true, &sync.WaitGroup{}

	r.wg.Add(1)
	go r.readWsMsg()

	return nil
}

func (r *realtimeClient) IsConnected() bool {
	r.lock.RLock()
	defer r.lock.RUnlock()
	return r.isConnected
}

func (r *realtimeClient) Disconnect() (err error) {
	r.lock.Lock()
	defer r.lock.Unlock()
	if !r.isConnected {
		return nil
	}
	r.isConnected = false
	return r.conn.Close()
}

func (r *realtimeClient) Wait() {
	log.Printf("[RealtimeClient] Waiting for exit...\n")
	r.wg.Wait()
	log.Printf("[RealtimeClient] Exited\n")
}

func (r *realtimeClient) Send(event *events.Event) (err error) {
	r.lock.RLock()
	defer r.lock.RUnlock()
	if !r.isConnected {
		log.Printf("[RealtimeClient] Sending event fail, err: not connected\n")
		return fmt.Errorf("not connected")
	}
	if event.ClientTimestamp <= 0 {
		event.ClientTimestamp = time.Now().UnixMilli()
	}
	if err = r.conn.WriteMessage(websocket.TextMessage, []byte(event.ToJson())); err != nil {
		log.Printf("[RealtimeClient] Send failed, error: %v\n", err)
	}
	return err
}

func (r *realtimeClient) readWsMsg() {
	defer r.wg.Done()
	for r.IsConnected() {
		messageType, message, err := r.conn.ReadMessage()
		if err != nil {
			log.Printf("[RealtimeClient] Read response failed, type: %d, message: %s, err: %v\n", messageType, string(message), err)
			return
		}
		// log.Printf("[RealtimeClient] Received message type: %d, message len: %d\n", messageType, len(message))
		if r.onReceived == nil {
			log.Printf("[RealtimeClient] OnReceived is nil, skipping...\n")
			continue
		}
		event := &events.Event{}
		if err = json.Unmarshal(message, event); err != nil {
			log.Printf("[RealtimeClient] Unmarshal failed, err: %v\n", err)
			_ = r.Disconnect()
			return
		}
		if err = r.onReceived(event); err != nil {
			log.Printf("[RealtimeClient] OnReceived failed, err: %v\n", err)
			_ = r.Disconnect()
			return
		}
	}
}
