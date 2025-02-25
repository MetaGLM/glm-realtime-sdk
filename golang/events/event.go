package events

import (
	"encoding/json"
)

type EventType string

const (
	// Client events
	RealtimeClientEventSessionUpdate            EventType = "session.update"
	RealtimeClientEventInputAudioBufferAppend   EventType = "input_audio_buffer.append"
	RealtimeClientEventInputAudioBufferCommit   EventType = "input_audio_buffer.commit"
	RealtimeClientEventInputAudioBufferClear    EventType = "input_audio_buffer.clear"
	RealtimeClientEventConversationItemCreate   EventType = "conversation.item.create"
	RealtimeClientEventConversationItemTruncate EventType = "conversation.item.truncate"
	RealtimeClientEventConversationItemDelete   EventType = "conversation.item.delete"
	RealtimeClientEventResponseCreate           EventType = "response.create"
	RealtimeClientEventResponseCancel           EventType = "response.cancel"

	// Server events
	RealtimeServerEventError                                            EventType = "error"
	RealtimeServerEventSessionCreated                                   EventType = "session.created"
	RealtimeServerEventSessionUpdated                                   EventType = "session.updated"
	RealtimeServerEventConversationCreated                              EventType = "conversation.created"
	RealtimeServerEventConversationItemCreated                          EventType = "conversation.item.created"
	RealtimeServerEventConversationItemInputAudioTranscriptionCompleted EventType = "conversation.item.input_audio_transcription.completed"
	RealtimeServerEventConversationItemInputAudioTranscriptionFailed    EventType = "conversation.item.input_audio_transcription.failed"
	RealtimeServerEventConversationItemTruncated                        EventType = "conversation.item.truncated"
	RealtimeServerEventConversationItemDeleted                          EventType = "conversation.item.deleted"
	RealtimeServerEventInputAudioBufferCommitted                        EventType = "input_audio_buffer.committed"
	RealtimeServerEventInputAudioBufferCleared                          EventType = "input_audio_buffer.cleared"
	RealtimeServerEventInputAudioBufferSpeechStarted                    EventType = "input_audio_buffer.speech_started"
	RealtimeServerEventInputAudioBufferSpeechStopped                    EventType = "input_audio_buffer.speech_stopped"
	RealtimeServerEventResponseCreated                                  EventType = "response.created"
	RealtimeServerEventResponseDone                                     EventType = "response.done"
	RealtimeServerEventResponseOutputItemAdded                          EventType = "response.output_item.added"
	RealtimeServerEventResponseOutputItemDone                           EventType = "response.output_item.done"
	RealtimeServerEventResponseContentPartAdded                         EventType = "response.content_part.added"
	RealtimeServerEventResponseContentPartDone                          EventType = "response.content_part.done"
	RealtimeServerEventResponseTextDelta                                EventType = "response.text.delta"
	RealtimeServerEventResponseTextDone                                 EventType = "response.text.done"
	RealtimeServerEventResponseAudioTranscriptDelta                     EventType = "response.audio_transcript.delta"
	RealtimeServerEventResponseAudioTranscriptDone                      EventType = "response.audio_transcript.done"
	RealtimeServerEventResponseAudioDelta                               EventType = "response.audio.delta"
	RealtimeServerEventResponseAudioDone                                EventType = "response.audio.done"
	RealtimeServerEventResponseFunctionCallArgumentsDelta               EventType = "response.function_call_arguments.delta"
	RealtimeServerEventResponseFunctionCallArgumentsDone                EventType = "response.function_call_arguments.done"
	RealtimeServerEventRateLimitsUpdated                                EventType = "rate_limits.updated"

	// Customized events
	RealtimeClientInputVideoFrameAppend                        EventType = "input_audio_buffer.append_video_frame"
	RealtimeServerResponseFunctionCallSimpleBrowserEvent       EventType = "response.function_call.simple_browser"
	RealtimeServerResponseFunctionCallSimpleBrowserResultEvent EventType = "response.function_call.simple_browser.result"
)

type Event struct {
	EventID         string        `json:"event_id,omitempty"`
	Type            EventType     `json:"type"`
	Session         *Session      `json:"session,omitempty"`
	Audio           string        `json:"audio,omitempty"`
	Response        *Response     `json:"response,omitempty"`
	ItemID          string        `json:"item_id,omitempty"`
	PreviousItemID  string        `json:"previous_item_id,omitempty"`
	ResponseID      string        `json:"response_id,omitempty"`
	OutputIndex     int           `json:"output_index,omitempty"`
	ContentIndex    int           `json:"content_index,omitempty"`
	Delta           string        `json:"delta"`
	Item            *Item         `json:"item,omitempty"`
	ClientTimestamp int64         `json:"client_timestamp,omitempty"`
	Transcript      string        `json:"transcript,omitempty"`
	Name            string        `json:"name,omitempty"`
	Arguments       string        `json:"arguments,omitempty"`
	VideoFrame      []byte        `json:"video_frame,omitempty"`
	Instructions    string        `json:"instructions,omitempty"`
	Error           *EventError   `json:"error,omitempty"`
	Conversation    *Conversation `json:"conversation,omitempty"`
	// BetaFields      *BetaFields `json:"beta_fields,omitempty"`
}

type EventError struct {
	Type    string `json:"type"`
	Code    string `json:"code"`
	Message string `json:"message"`
	Param   string `json:"param,omitempty"`
}

type Conversation struct {
	ID     string `json:"id"`
	Object string `json:"object"`
}

func (e *Event) ToJson() string {
	json, err := json.Marshal(e)
	if err != nil {
		return ""
	}
	return string(json)
}

type Modality string
type ChatMode string

const (
	ModalityText  Modality = "text"
	ModalityAudio Modality = "audio"
	ModalityVideo Modality = "video"
)

const (
	ChatModeAudio          ChatMode = "audio"
	ChatModeVideoPassive   ChatMode = "video_passive"
	ChatModeVideoProactive ChatMode = "video_preactive"
)

type Session struct {
	ID                      string                   `json:"id,omitempty"`
	Object                  string                   `json:"object,omitempty"`
	Model                   string                   `json:"model,omitempty"`
	Modalities              []Modality               `json:"modalities,omitempty"`
	Instructions            string                   `json:"instructions"`
	Voice                   string                   `json:"voice,omitempty"`
	InputAudioFormat        string                   `json:"input_audio_format"`
	OutputAudioFormat       string                   `json:"output_audio_format"`
	InputAudioTranscription *InputAudioTranscription `json:"input_audio_transcription,omitempty"`
	TurnDetection           *TurnDetection           `json:"turn_detection,omitempty"`
	Tools                   []Tool                   `json:"tools"`
	ToolChoice              string                   `json:"tool_choice,omitempty"`
	Temperature             float64                  `json:"temperature,omitempty"`
	MaxOutputTokens         any                      `json:"max_output_tokens,omitempty"` // "inf" or int
	BetaFields              *BetaFields              `json:"beta_fields"`
}

type InputAudioTranscription struct {
	Enabled bool   `json:"enabled"`
	Model   string `json:"model"`
}

type TurnDetection struct {
	Type              string  `json:"type"`
	Threshold         float64 `json:"threshold,omitempty"`
	PrefixPaddingMs   int     `json:"prefix_padding_ms,omitempty"`
	SilenceDurationMs int     `json:"silence_duration_ms,omitempty"`
}

type TTSExtra struct {
	Index    int    `json:"index"`
	SubIndex int    `json:"sub_index"`
	SubText  string `json:"sub_text"`
	IsEnd    bool   `json:"is_end"`
}

type SimpleBrowser struct {
	Description  string `json:"description"`
	SearchMeta   string `json:"search_meta"`
	Meta         string `json:"meta"`
	TextCitation string `json:"text_citation"`
}

type BetaFields struct {
	ChatMode        ChatMode       `json:"chat_mode,omitempty"`
	ImageSizeX      int            `json:"image_size_x,omitempty"`
	ImageSizeY      int            `json:"image_size_y,omitempty"`
	FPS             int            `json:"fps,omitempty"`
	TTSSource       string         `json:"tts_source,omitempty"`
	TTSExtra        *TTSExtra      `json:"tts_extra,omitempty"`
	SimpleBrowser   *SimpleBrowser `json:"simple_browser,omitempty"`
	IsLastText      bool           `json:"is_last_text,omitempty"`
	MessageID       string         `json:"message_id,omitempty"`
	AutoSearch      *bool          `json:"auto_search,omitempty"`
}