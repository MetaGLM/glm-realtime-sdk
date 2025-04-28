package events

type ContentType string

const (
	ContentTypeText       ContentType = "text"
	ContentTypeAudio      ContentType = "audio"
	ContentTypeInputText  ContentType = "input_text"
	ContentTypeInputAudio ContentType = "input_audio"
)

type Content struct {
	Type       ContentType `json:"type,omitempty"`
	Transcript *string     `json:"transcript,omitempty"`
	Text       *string     `json:"text,omitempty"`
}

type ItemStatus string

const (
	ItemStatusInProgress ItemStatus = "in_progress"
	ItemStatusCompleted  ItemStatus = "completed"
	ItemStatusIncomplete ItemStatus = "incomplete"
)

type ItemType string

const (
	ItemTypeMessage            ItemType = "message"
	ItemTypeFunctionCall       ItemType = "function_call"
	ItemTypeFunctionCallOutput ItemType = "function_call_output"
)

type ItemRole string

const (
	ItemRoleUser      ItemRole = "user"
	ItemRoleAssistant ItemRole = "assistant"
	ItemRoleSystem    ItemRole = "system"
)

type ItemObject string

const (
	ItemObjectRealTimeItem ItemObject = "realtime.item"
)

type Item struct {
	ID        string     `json:"id"`
	Object    ItemObject `json:"object"`
	Type      ItemType   `json:"type"`
	Status    ItemStatus `json:"status"`
	Role      ItemRole   `json:"role,omitempty"`
	Content   []Content  `json:"content,omitempty"`
	Output    *string    `json:"output,omitempty"`
	Name      string     `json:"name,omitempty"`
	CallId    string     `json:"call_id,omitempty"`
	Arguments string     `json:"arguments,omitempty"`
}
