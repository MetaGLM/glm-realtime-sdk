package samples

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"log"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"github.com/joho/godotenv"

	"github.com/MetaGLM/glm-realtime-sdk/golang/realtime-client/client"
	"github.com/MetaGLM/glm-realtime-sdk/golang/realtime-client/events"
	"github.com/MetaGLM/glm-realtime-sdk/golang/realtime-client/tools"
)

var (
	ZHIPU_REALTIME_URL, ZHIPU_API_KEY string
)

func init() {
	envFile := ".env"
	if _, err := os.Stat(envFile); err == nil {
		if err := godotenv.Load(envFile); err != nil {
			log.Fatalf("Error loading .env file\n")
		}
	}
	ZHIPU_REALTIME_URL, ZHIPU_API_KEY = os.Getenv("ZHIPU_REALTIME_URL"), os.Getenv("ZHIPU_API_KEY")
}

func doTestRealtimeClient(inputFilePath, outputFilePath string) {

	dir, err := os.Getwd()
	if err != nil {
	    log.Fatalf("Error getting pwd: %v\n", err)
		return
	}

	outputFilePath = dir + outputFilePath
	_ = os.Remove(outputFilePath)
	file, err := os.OpenFile(outputFilePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		log.Fatalf("Error opening file: %v\n", err)
		return
	}
	defer file.Close()

	wavBytes := make([][]byte, 0)
	var realtimeClient client.RealtimeClient
	onReceived := func(event *events.Event) error {
		if event.Type == events.RealtimeServerEventResponseAudioDelta {
			bytes, err := base64.StdEncoding.DecodeString(event.Delta)
			if err != nil || len(bytes) == 0 {
				log.Fatalf("Error decoding audio: %v\n", err)
				return err
			}
			bytes, err = tools.Pcm2Wav(bytes, 24000, 1, 16)
			if err != nil || len(bytes) == 0 {
				log.Fatalf("Error converting pcm to wav: %v\n", err)
				return err
			}
			wavBytes, event.Delta = append(wavBytes, bytes), "Ignored for logging"
		}
		s := event.ToJson()
		log.Printf("Received message: %s\n\n", s)
		if _, err = file.WriteString(s + "\n"); err != nil {
			log.Fatalf("Error writing to file: %v\n", err)
			return err
		}
		if event.Type == events.RealtimeServerEventResponseDone || event.Type == events.RealtimeServerEventError {
			log.Printf("Received event: %s, exiting...\n", event.Type)
			realtimeClient.Disconnect()
			if bytes, err := tools.ConcatWavBytes(wavBytes); err == nil && len(bytes) > 0{
			    os.WriteFile(outputFilePath + ".wav", bytes, 0644)
			}
		}
		return nil
    }
    realtimeClient = client.NewRealtimeClient(ZHIPU_REALTIME_URL, ZHIPU_API_KEY, onReceived)

    if err = realtimeClient.Connect(); err != nil {
        log.Fatalf("Connect failed, error: %v\n", err)
        return
    }
	defer realtimeClient.Disconnect()

	inputFile, err := os.Open(dir + inputFilePath)
	if err != nil {
		log.Fatalf("Error opening file: %v\n", err)
		return
	}
	defer inputFile.Close()

	scanner := bufio.NewScanner(inputFile)
	scanner.Buffer(make([]byte, 0, 1024*1024), int(bufio.MaxScanTokenSize))
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "{") {
			continue
		}
		event := &events.Event{}
		if err = json.Unmarshal([]byte(line), event); err != nil {
			log.Fatalf("Error unmarshalling event: %v\n", err)
			return
		}
		if err = realtimeClient.Send(event); err != nil {
			realtimeClient.Disconnect()
			break
		}
		if event.Type == events.RealtimeClientEventInputAudioBufferAppend {
			event.Audio = "Ignored for logging"
		} else if event.Type == events.RealtimeClientInputVideoFrameAppend {
			event.VideoFrame = nil
		}
		log.Printf("Sent message: %s\n\n", event.ToJson())
		time.Sleep(135*time.Millisecond)
	}

	if err = scanner.Err(); err != nil {
		log.Fatalf("Error reading file: %v\n", err)
	}

	realtimeClient.Wait()
}

func doTestRealtimeClientWithFC(inputFilePath, outputFilePath string) {

	dir, err := os.Getwd()
	if err != nil {
	    log.Fatalf("Error getting pwd: %v\n", err)
		return
	}

	outputFilePath = dir + outputFilePath
	_ = os.Remove(outputFilePath)
	file, err := os.OpenFile(outputFilePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		log.Fatalf("Error opening file: %v\n", err)
		return
	}
	defer file.Close()

	wavBytes := make([][]byte, 0)
	var status atomic.Uint32
	var realtimeClient client.RealtimeClient
	onReceived := func(event *events.Event) error {
		if event.Type == events.RealtimeServerEventResponseAudioDelta {
			bytes, err := base64.StdEncoding.DecodeString(event.Delta)
			if err != nil || len(bytes) == 0 {
				log.Fatalf("Error decoding audio: %v\n", err)
				return err
			}
			bytes, err = tools.Pcm2Wav(bytes, 24000, 1, 16)
			if err != nil || len(bytes) == 0 {
				log.Fatalf("Error converting pcm to wav: %v\n", err)
				return err
			}
			wavBytes, event.Delta = append(wavBytes, bytes), "Ignored for logging"
		}
		s := event.ToJson()
		log.Printf("Received message: %s\n\n", s)
		if _, err = file.WriteString(s + "\n"); err != nil {
			log.Fatalf("Error writing to file: %v\n", err)
			return err
		}
		if event.Type == events.RealtimeServerEventResponseFunctionCallArgumentsDone || event.Type == events.RealtimeServerEventResponseDone  {
			status.Add(1)
		}
		if status.Load() > 2 && event.Type == events.RealtimeServerEventResponseDone || event.Type == events.RealtimeServerEventError {
			log.Printf("Received event: %s, exiting...\n", event.Type)
			realtimeClient.Disconnect()
			if bytes, err := tools.ConcatWavBytes(wavBytes); err == nil && len(bytes) > 0{
			    os.WriteFile(outputFilePath + ".wav", bytes, 0644)
			}
		}
		return nil
    }
    realtimeClient = client.NewRealtimeClient(ZHIPU_REALTIME_URL, ZHIPU_API_KEY, onReceived)

    if err = realtimeClient.Connect(); err != nil {
        log.Fatalf("Connect failed, error: %v\n", err)
        return
    }
	defer realtimeClient.Disconnect()

	inputFile, err := os.Open(dir + inputFilePath)
	if err != nil {
		log.Fatalf("Error opening file: %v\n", err)
		return
	}
	defer inputFile.Close()

	scanner := bufio.NewScanner(inputFile)
	scanner.Buffer(make([]byte, 0, 1024*1024), int(bufio.MaxScanTokenSize))
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "{") {
			continue
		}
		event := &events.Event{}
		if err = json.Unmarshal([]byte(line), event); err != nil {
			log.Fatalf("Error unmarshalling event: %v\n", err)
			return
		}
		for event.Type == events.RealtimeClientEventConversationItemCreate && status.Load() < 2 {
			time.Sleep(time.Second)
		}
		if err = realtimeClient.Send(event); err != nil {
			realtimeClient.Disconnect()
			break
		}
		if event.Type == events.RealtimeClientEventInputAudioBufferAppend {
			event.Audio = "Ignored for logging"
		} else if event.Type == events.RealtimeClientInputVideoFrameAppend {
			event.VideoFrame = nil
		}
		log.Printf("Sent message: %s\n\n", event.ToJson())
		time.Sleep(135*time.Millisecond)
	}

	if err = scanner.Err(); err != nil {
		log.Fatalf("Error reading file: %v\n", err)
	}

	realtimeClient.Wait()
}