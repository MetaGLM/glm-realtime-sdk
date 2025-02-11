# Copyright (c) ZhiPu Corporation.
# Licensed under the MIT License.

from typing import Annotated, Any, Literal, Optional, Union

from pydantic import (
    BaseModel,
    Field,
)

from rtclient.util.model_helpers import ModelWithDefaults

Voice = str

AudioFormat = Literal["wav", "mp3", "pcm"]
Modality = Literal["text", "audio"]


class NoTurnDetection(ModelWithDefaults):
    type: Literal["none"] = "none"


class ServerVAD(ModelWithDefaults):
    type: Literal["server_vad"] = "server_vad"
    threshold: Optional[Annotated[float, Field(strict=True, ge=0.0, le=1.0)]] = 0.0
    prefix_padding_ms: Optional[int] = 0
    silence_duration_ms: Optional[int] = 0


class ClientVAD(ModelWithDefaults):

    type: Literal["client_vad"] = "client_vad"


TurnDetection = Annotated[Union[NoTurnDetection, ServerVAD, ClientVAD], Field(discriminator="type")]


class FunctionToolChoice(ModelWithDefaults):
    type: Literal["function"] = "function"
    function: str


ToolChoice = Literal["auto", "none", "required", ""] | FunctionToolChoice

MessageRole = Literal["system", "assistant", "user"]


class InputAudioTranscription(BaseModel):
    model: Literal["whisper-1"]


class ClientMessageBase(ModelWithDefaults):
    event_id: Optional[str] = ""
    client_timestamp: Optional[int] = None



Temperature = Annotated[float, Field(strict=True, ge=0, le=1.2)]
ToolsDefinition = list[Any]

MaxTokensType = Union[int, Literal["inf"]]


class SessionUpdateParams(BaseModel):
    model: Optional[str] = None
    modalities: Optional[set[Modality]] = None
    voice: Optional[Voice] = None
    instructions: Optional[str] = None
    input_audio_format: Optional[AudioFormat] = None
    output_audio_format: Optional[AudioFormat] = None
    input_audio_transcription: Optional[InputAudioTranscription] = None
    turn_detection: Optional[TurnDetection] = None
    tools: Optional[ToolsDefinition] = None
    tool_choice: Optional[ToolChoice] = None
    temperature: Optional[Temperature] = None
    max_output_tokens: Optional[MaxTokensType] = None
    beta_fields: Optional[dict] = None


class SessionUpdateMessage(ClientMessageBase):
    """
    Update the session configuration.
    """

    type: Literal["session.update"] = "session.update"
    session: SessionUpdateParams


class InputAudioBufferAppendMessage(ClientMessageBase):
    """
    Append audio data to the user audio buffer, this should be in the format specified by
    input_audio_format in the session config.
    """

    type: Literal["input_audio_buffer.append"] = "input_audio_buffer.append"
    audio: str # base64编码的音频数据


class InputVideoFrameAppendMessage(ClientMessageBase):
    """
    在视频通话模式中上报视频帧。
    """

    type: Literal["input_audio_buffer.append_video_frame"] = "input_audio_buffer.append_video_frame"
    video_frame: str  # base64编码的图片数据


class InputAudioBufferCommitMessage(ClientMessageBase):
    """
    Commit the pending user audio buffer, which creates a user message item with the audio content
    and clears the buffer.
    """

    type: Literal["input_audio_buffer.commit"] = "input_audio_buffer.commit"


class InputAudioBufferClearMessage(ClientMessageBase):
    """
    Clear the user audio buffer, discarding any pending audio data.
    """

    type: Literal["input_audio_buffer.clear"] = "input_audio_buffer.clear"


MessageItemType = Literal["message"]


class InputTextContentPart(ModelWithDefaults):
    """文本输入内容部分"""

    type: Literal["input_text"] = "input_text"
    text: str


class InputAudioContentPart(ModelWithDefaults):
    """音频输入内容部分"""

    type: Literal["input_audio"] = "input_audio"
    audio: str
    transcript: Optional[str] = ""


class OutputTextContentPart(ModelWithDefaults):
    """文本输出内容部分"""

    type: Literal["text"] = "text"
    text: str


SystemContentPart = InputTextContentPart
UserContentPart = Union[Annotated[Union[InputTextContentPart, InputAudioContentPart], Field(discriminator="type")]]
AssistantContentPart = OutputTextContentPart

ItemParamStatus = Literal["completed", "incomplete"]


class SystemMessageItem(ModelWithDefaults):
    type: MessageItemType = "message"
    role: Literal["system"] = "system"
    id: Optional[str] = ""
    content: list[SystemContentPart]
    status: Optional[ItemParamStatus] = None


class UserMessageItem(ModelWithDefaults):
    type: MessageItemType = "message"
    role: Literal["user"] = "user"
    id: Optional[str] = ""
    content: list[UserContentPart]
    status: Optional[ItemParamStatus] = None


class AssistantMessageItem(ModelWithDefaults):
    type: MessageItemType = "message"
    role: Literal["assistant"] = "assistant"
    id: Optional[str] = ""
    content: list[AssistantContentPart]
    status: Optional[ItemParamStatus] = None


MessageItem = Annotated[Union[SystemMessageItem, UserMessageItem, AssistantMessageItem], Field(discriminator="role")]


class FunctionCallItem(ModelWithDefaults):
    type: Literal["function_call"] = "function_call"
    id: Optional[str] = ""
    name: str
    call_id: Optional[str] = ""
    arguments: str
    status: Optional[ItemParamStatus] = None


class FunctionCallOutputItem(ModelWithDefaults):
    type: Literal["function_call_output"] = "function_call_output"
    id: Optional[str] = ""
    call_id: Optional[str] = ""
    output: str
    status: Optional[ItemParamStatus] = None


Item = Annotated[Union[MessageItem, FunctionCallItem, FunctionCallOutputItem], Field(discriminator="type")]


class ItemCreateMessage(ClientMessageBase):
    type: Literal["conversation.item.create"] = "conversation.item.create"
    previous_item_id: Optional[str] = None
    item: Item




class ResponseCreateParams(BaseModel):
    commit: bool = True
    cancel_previous: bool = True
    append_input_items: Optional[list[Item]] = None
    input_items: Optional[list[Item]] = None
    instructions: Optional[str] = None
    modalities: Optional[set[Modality]] = None
    voice: Optional[Voice] = None
    temperature: Optional[Temperature] = None
    max_output_tokens: Optional[MaxTokensType] = None
    tools: Optional[ToolsDefinition] = None
    tool_choice: Optional[ToolChoice] = None
    output_audio_format: Optional[AudioFormat] = None


class ResponseCreateMessage(ClientMessageBase):
    """
    Trigger model inference to generate a model turn.
    """

    type: Literal["response.create"] = "response.create"
    response: Optional[ResponseCreateParams] = None


class ResponseCancelMessage(ClientMessageBase):
    type: Literal["response.cancel"] = "response.cancel"


class RealtimeError(BaseModel):
    message: str
    type: Optional[str] = None
    code: Optional[str] = None
    param: Optional[str] = None
    event_id: Optional[str] = None


class ServerMessageBase(BaseModel):
    event_id: Optional[str] = None


class ErrorMessage(ServerMessageBase):
    type: Literal["error"] = "error"
    error: RealtimeError


class Session(BaseModel):
    id: str
    model: str
    modalities: set[Modality]
    instructions: str
    voice: Voice
    input_audio_format: AudioFormat
    output_audio_format: AudioFormat
    input_audio_transcription: Optional[InputAudioTranscription] = None
    turn_detection: Optional[TurnDetection] = None
    tools: Optional[ToolsDefinition] = None
    tool_choice: ToolChoice
    temperature: Temperature
    beta_fields: dict


class SessionCreatedMessage(ServerMessageBase):
    type: Literal["session.created"] = "session.created"
    session: Session


class SessionUpdatedMessage(ServerMessageBase):
    type: Literal["session.updated"] = "session.updated"
    session: Session


class InputAudioBufferCommittedMessage(ServerMessageBase):
    """
    Signals the server has received and processed the audio buffer.
    """

    type: Literal["input_audio_buffer.committed"] = "input_audio_buffer.committed"
    previous_item_id: Optional[str] = None
    item_id: Optional[str] = None


class InputAudioBufferSpeechStartedMessage(ServerMessageBase):
    """
    If the server VAD is enabled, this event is sent when speech is detected in the user audio buffer.
    It tells you where in the audio stream (in milliseconds) the speech started, plus an item_id
    which will be used in the corresponding speech_stopped event and the item created in the conversation
    when speech stops.
    """

    type: Literal["input_audio_buffer.speech_started"] = "input_audio_buffer.speech_started"
    audio_start_ms: Optional[int] = None
    item_id: Optional[str] = None


class InputAudioBufferSpeechStoppedMessage(ServerMessageBase):
    """
    If the server VAD is enabled, this event is sent when speech stops in the user audio buffer.
    It tells you where in the audio stream (in milliseconds) the speech stopped, plus an item_id
    which will be used in the corresponding speech_started event and the item created in the conversation
    when speech starts.
    """

    type: Literal["input_audio_buffer.speech_stopped"] = "input_audio_buffer.speech_stopped"
    audio_end_ms: Optional[int] = None
    item_id: Optional[str] = None


ResponseItemStatus = Literal["in_progress", "completed", "incomplete"]


class ResponseItemInputTextContentPart(BaseModel):
    """响应项文本输入内容部分"""

    type: Literal["input_text"] = "input_text"
    text: str


class ResponseItemInputAudioContentPart(BaseModel):
    """响应项音频输入内容部分"""

    type: Literal["input_audio"] = "input_audio"
    transcript: Optional[str] = None


class ResponseItemTextContentPart(BaseModel):
    """响应项文本内容部分"""

    type: Literal["text"] = "text"
    text: str


class ResponseItemAudioContentPart(BaseModel):
    """响应项音频内容部分"""

    type: Literal["audio"] = "audio"
    transcript: Optional[str] = None


ResponseItemContentPart = Annotated[
    Union[
        ResponseItemInputTextContentPart,
        ResponseItemInputAudioContentPart,
        ResponseItemTextContentPart,
        ResponseItemAudioContentPart,
    ],
    Field(discriminator="type"),
]


class ResponseItemBase(BaseModel):
    id: Optional[str]


class ResponseMessageItem(ResponseItemBase):
    """响应消息项"""

    type: Literal["message"] = "message"
    status: Optional[ItemParamStatus] = None
    role: Optional[MessageRole] = None
    content: Optional[list[ResponseItemContentPart]] = None


class ResponseFunctionCallItem(ResponseItemBase):
    """函数调用项"""

    type: Literal["function_call"] = "function_call"
    status: Optional[ItemParamStatus] = None
    name: str
    call_id: Optional[str] = ""
    arguments: str


class ResponseFunctionCallOutputItem(ResponseItemBase):
    """函数调用输出项"""

    type: Literal["function_call_output"] = "function_call_output"
    call_id: Optional[str] = ""
    output: str


ResponseItem = Annotated[
    Union[ResponseMessageItem, ResponseFunctionCallItem, ResponseFunctionCallOutputItem],
    Field(discriminator="type"),
]


class ItemCreatedMessage(ServerMessageBase):
    type: Literal["conversation.item.created"] = "conversation.item.created"
    previous_item_id: Optional[str] = ""
    item: ResponseItem


class ItemInputAudioTranscriptionCompletedMessage(ServerMessageBase):
    type: Literal["conversation.item.input_audio_transcription.completed"] = (
        "conversation.item.input_audio_transcription.completed"
    )
    item_id: Optional[str] = ""
    content_index: Optional[int] = 0
    transcript: Optional[str] = ""


ResponseStatus = Literal["in_progress", "completed", "cancelled", "incomplete", "failed"]


class ResponseCancelledDetails(BaseModel):
    type: Literal["cancelled"] = "cancelled"
    reason: Literal["turn_detected", "client_cancelled"]


class ResponseIncompleteDetails(BaseModel):
    type: Literal["incomplete"] = "incomplete"
    reason: Literal["max_output_tokens", "content_filter"]


class ResponseFailedDetails(BaseModel):
    type: Literal["failed"] = "failed"
    error: Any


ResponseStatusDetails = Annotated[
    Union[ResponseCancelledDetails, ResponseIncompleteDetails, ResponseFailedDetails],
    Field(discriminator="type"),
]


class InputTokenDetails(BaseModel):
    cached_tokens: Optional[int] = 0
    text_tokens: Optional[int] = 0
    audio_tokens: Optional[int] = 0


class OutputTokenDetails(BaseModel):
    text_tokens: Optional[int] = 0
    audio_tokens: Optional[int] = 0


class Usage(BaseModel):
    total_tokens: Optional[int] = 0
    input_tokens: Optional[int] = 0
    output_tokens: Optional[int] = 0
    input_token_details: Optional[InputTokenDetails] = None
    output_token_details: Optional[OutputTokenDetails] = None


class Response(BaseModel):
    """服务器返回的响应对象结构"""

    id: str
    object: Literal["realtime.response"] = "realtime.response"
    status: ResponseStatus
    status_details: Optional[ResponseStatusDetails] = None
    output: Optional[list[ResponseItem]] = None
    usage: Optional[Usage] = None


class ResponseCreatedMessage(ServerMessageBase):
    type: Literal["response.created"] = "response.created"
    response: Response


class ResponseDoneMessage(ServerMessageBase):
    type: Literal["response.done"] = "response.done"
    response: Response


class ResponseAudioTranscriptDeltaMessage(ServerMessageBase):
    type: Literal["response.audio_transcript.delta"] = "response.audio_transcript.delta"
    response_id: Optional[str] = None
    item_id: Optional[str] = None
    output_index: Optional[int] = None
    content_index: Optional[int] = None
    delta: Optional[str] = None


class ResponseAudioTranscriptDoneMessage(ServerMessageBase):
    type: Literal["response.audio_transcript.done"] = "response.audio_transcript.done"
    response_id: Optional[str] = None
    item_id: Optional[str] = None
    output_index: Optional[int] = None
    content_index: Optional[int] = None
    transcript: Optional[str] = None


class ResponseAudioDeltaMessage(ServerMessageBase):
    type: Literal["response.audio.delta"] = "response.audio.delta"
    response_id: Optional[str] = None
    item_id: Optional[str] = None
    output_index: Optional[int] = None
    content_index: Optional[int] = None
    delta: Optional[str] = None


class ResponseFunctionCallArgumentsDoneMessage(ServerMessageBase):
    type: Literal["response.function_call_arguments.done"] = "response.function_call_arguments.done"
    response_id: str
    item_id: Optional[str] = ""
    output_index: Optional[int] = 0
    call_id: Optional[str] = ""
    name: str = ""
    arguments: str = ""


class HeartbeatMessage(ServerMessageBase):
    """服务器心跳消息"""

    type: Literal["heartbeat"] = "heartbeat"


UserMessageType = Annotated[
    Union[
        SessionUpdateMessage,
        InputAudioBufferAppendMessage,
        InputVideoFrameAppendMessage,
        InputAudioBufferCommitMessage,
        InputAudioBufferClearMessage,
        ItemCreateMessage,
        ResponseCreateMessage,
        ResponseCancelMessage,
    ],
    Field(discriminator="type"),
]
ServerMessageType = Annotated[
    Union[
        ErrorMessage,
        HeartbeatMessage,
        SessionCreatedMessage,
        SessionUpdatedMessage,
        InputAudioBufferCommittedMessage,
        InputAudioBufferSpeechStartedMessage,
        InputAudioBufferSpeechStoppedMessage,
        ItemCreatedMessage,
        ItemInputAudioTranscriptionCompletedMessage,
        ResponseCreatedMessage,
        ResponseDoneMessage,
        ResponseAudioTranscriptDeltaMessage,
        ResponseAudioTranscriptDoneMessage,
        ResponseAudioDeltaMessage,
        ResponseFunctionCallArgumentsDoneMessage,
    ],
    Field(discriminator="type"),
]


def create_message_from_dict(data: dict) -> ServerMessageType:
    event_type = data.get("type")
    try:
        match event_type:
            case "error":
                return ErrorMessage(**data)
            case "heartbeat":
                return HeartbeatMessage(**data)
            case "session.created":
                return SessionCreatedMessage(**data)
            case "session.updated":
                return SessionUpdatedMessage(**data)
            case "input_audio_buffer.committed":
                return InputAudioBufferCommittedMessage(**data)
            case "input_audio_buffer.speech_started":
                return InputAudioBufferSpeechStartedMessage(**data)
            case "input_audio_buffer.speech_stopped":
                return InputAudioBufferSpeechStoppedMessage(**data)
            case "conversation.item.created":
                return ItemCreatedMessage(**data)
            case "conversation.item.input_audio_transcription.completed":
                return ItemInputAudioTranscriptionCompletedMessage(**data)
            case "response.created":
                return ResponseCreatedMessage(**data)
            case "response.done":
                return ResponseDoneMessage(**data)
            case "response.audio_transcript.delta":
                return ResponseAudioTranscriptDeltaMessage(**data)
            case "response.audio_transcript.done":
                return ResponseAudioTranscriptDoneMessage(**data)
            case "response.audio.delta":
                return ResponseAudioDeltaMessage(**data)
            case "response.function_call_arguments.done":
                return ResponseFunctionCallArgumentsDoneMessage(**data)
            case _:
                raise ValueError(f"Unknown event type: {event_type}")
    except Exception as e:
        print(f"解析消息失败: {str(e)}, 原始消息: {data}")
        return data
