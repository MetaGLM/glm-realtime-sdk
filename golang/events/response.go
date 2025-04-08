package events

type ResponseObject string

const (
	ResponseObjectResponse ResponseObject = "realtime.response"
)

type ResponseStatus string

const (
	ResponseStatusInProgress ResponseStatus = "in_progress"
	ResponseStatusCancelled  ResponseStatus = "cancelled"
	ResponseStatusCompleted  ResponseStatus = "completed"
)

type Response struct {
	ID                string         `json:"id,omitempty"`
	Modalities        []Modality     `json:"modalities,omitempty"`
	Object            ResponseObject `json:"object,omitempty"`
	Status            ResponseStatus `json:"status,omitempty"`
	Instructions      string         `json:"instructions,omitempty"`
	Voice             string         `json:"voice,omitempty"`
	OutputAudioFormat string         `json:"output_audio_format,omitempty"`
	Tools             []Tool         `json:"tools,omitempty"`
	ToolChoice        string         `json:"tool_choice,omitempty"`
	Temperature       float64        `json:"temperature,omitempty"`
	MaxOutputTokens   int            `json:"max_output_tokens,omitempty"`
	Usage             *Usage         `json:"usage,omitempty"`
	Output            []Item         `json:"output,omitempty"`
}

// 上游返回的token使用情况
type TokenUsageFromUpstream struct {
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
	TotalTokens      int64 `json:"total_tokens"`
}

type Usage struct {
	TotalTokens        int64        `json:"total_tokens"`
	InputTokens        int64        `json:"input_tokens"`
	OutputTokens       int64        `json:"output_tokens"`
	InputTokenDetails  TokenDetails `json:"input_token_details"`
	OutputTokenDetails TokenDetails `json:"output_token_details"`
}

type TokenDetails struct {
	TextTokens  int `json:"text_tokens"`
	AudioTokens int `json:"audio_tokens"`
}
