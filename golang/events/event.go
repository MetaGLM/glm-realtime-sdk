package events

import (
	"encoding/json"
)

type EventType string

const (
	// Client events
	RealtimeClientEventSessionUpdate              EventType = "session.update"
	RealtimeClientEventTranscriptionSessionUpdate EventType = "transcription_session.update"
	RealtimeClientEventInputAudioBufferAppend     EventType = "input_audio_buffer.append"
	RealtimeClientVideoAppend                     EventType = "input_audio_buffer.append_video_frame"
	RealtimeClientEventInputAudioBufferCommit     EventType = "input_audio_buffer.commit"
	RealtimeClientEventInputAudioBufferClear      EventType = "input_audio_buffer.clear"
	RealtimeClientEventConversationItemCreate     EventType = "conversation.item.create"
	RealtimeClientEventConversationItemRetrieve   EventType = "conversation.item.retrieve"
	RealtimeClientEventConversationItemTruncate   EventType = "conversation.item.truncate"
	RealtimeClientEventConversationItemDelete     EventType = "conversation.item.delete"
	RealtimeClientEventResponseCreate             EventType = "response.create"
	RealtimeClientEventResponseCancel             EventType = "response.cancel"

	// Server events
	RealtimeServerEventError                                            EventType = "error"
	RealtimeServerEventSessionCreated                                   EventType = "session.created"
	RealtimeServerEventSessionUpdated                                   EventType = "session.updated"
	RealtimeServerEventConversationCreated                              EventType = "conversation.created"
	RealtimeServerEventConversationItemCreated                          EventType = "conversation.item.created"
	RealtimeServerEventConversationItemRetrieved                        EventType = "conversation.item.retrieved"
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
	RealtimeServerEventTranscriptionSessionUpdated                      EventType = "transcription_session.updated"
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
	Text            *string       `json:"text,omitempty"`
	Transcript      *string       `json:"transcript,omitempty"`
	Name            string        `json:"name,omitempty"`
	CallID          string        `json:"call_id,omitempty"`
	Arguments       string        `json:"arguments,omitempty"`
	VideoFrame      []byte        `json:"video_frame,omitempty"`
	Instructions    string        `json:"instructions,omitempty"`
	Error           *EventError   `json:"error,omitempty"`
	Conversation    *Conversation `json:"conversation,omitempty"`
	Part            *ContentPart  `json:"part,omitempty"`
	AudioStartMS    int64         `json:"audio_start_ms,omitempty"`
	AudioEndMS      int64         `json:"audio_end_ms,omitempty"`
	RateLimits      []RateLimit   `json:"rate_limits,omitempty"`
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

type ContentPart struct {
	Type       ContentType `json:"type"`
	Text       string      `json:"text,omitempty"`
	Audio      string      `json:"audio,omitempty"`
	Transcript string      `json:"transcript,omitempty"`
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
type DenoiseType string

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

var DefaultModalities = []Modality{ModalityText, ModalityAudio}

const (
	DenoiseTypeNearField DenoiseType = "near_field"
	DenoiseTypeFarField  DenoiseType = "far_field"
)

type Session struct {
	ID                       string                   `json:"id,omitempty"`
	Object                   string                   `json:"object,omitempty"`
	Model                    string                   `json:"model,omitempty"`
	Modalities               []Modality               `json:"modalities,omitempty"`
	Instructions             string                   `json:"instructions,omitempty"`
	Voice                    string                   `json:"voice,omitempty"`
	InputAudioFormat         string                   `json:"input_audio_format,omitempty"`
	OutputAudioFormat        string                   `json:"output_audio_format,omitempty"`
	InputAudioTranscription  *InputAudioTranscription `json:"input_audio_transcription,omitempty"`
	TurnDetection            *TurnDetection           `json:"turn_detection,omitempty"`
	Tools                    []Tool                   `json:"tools,omitempty"`
	ToolChoice               string                   `json:"tool_choice,omitempty"`
	Temperature              float64                  `json:"temperature,omitempty"`
	MaxResponseOutputTokens  any                      `json:"max_response_output_tokens,omitempty"` // "inf" or int
	InputAudioNoiseReduction *NoiseReduction          `json:"input_audio_noise_reduction,omitempty"`
	BetaFields               *BetaFields              `json:"beta_fields,omitempty"`
	// 这里是专门为了调式用的， 必须为指针，内部字段不暴露
	FlowBackend *string `json:"flow_backend,omitempty"`
	TTSBackend  *string `json:"tts_backend,omitempty"`
}

type InputAudioTranscription struct {
	Enabled bool   `json:"enabled"`
	Model   string `json:"model"`
}

type TurnDetection struct {
	Type              string  `json:"type,omitempty"`
	Threshold         float64 `json:"threshold,omitempty"`
	PrefixPaddingMs   int     `json:"prefix_padding_ms,omitempty"`
	SilenceDurationMs int     `json:"silence_duration_ms,omitempty"`
	CreateResponse    bool    `json:"create_response,omitempty"`
	InterruptResponse bool    `json:"interrupt_response,omitempty"`
}

type NoiseReduction struct {
	Type DenoiseType `json:"type"`
}

type RateLimit struct {
	Name         string  `json:"name"`
	Limit        int     `json:"limit"`
	Remaining    int     `json:"remaining"`
	ResetSeconds float32 `json:"reset_seconds"`
}

type SimpleBrowser struct {
	Description  string `json:"description"`
	SearchMeta   string `json:"search_meta"`
	Meta         string `json:"meta"`
	TextCitation string `json:"text_citation"`
}

type BetaFields struct {
	ChatMode      ChatMode       `json:"chat_mode,omitempty"`
	FPS           int            `json:"fps,omitempty"`
	TTSSource     string         `json:"tts_source,omitempty"`
	TTSCloned     *ClonedInfo    `json:"tts_cloned,omitempty"`
	SimpleBrowser *SimpleBrowser `json:"simple_browser,omitempty"`
	AutoSearch    *bool          `json:"auto_search,omitempty"` // 是否自动搜索
}

type ClonedInfo struct {
	Audio string `json:"audio,omitempty"`
	Text  string `json:"text,omitempty"`
}
