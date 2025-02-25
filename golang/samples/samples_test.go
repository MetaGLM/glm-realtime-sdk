package samples

import (
	"testing"
)

// 音频客户端VAD模式示例
func TestRealtimeClientAudioClientVad(t *testing.T) {
    doTestRealtimeClient("/files/Audio.ClientVad.Input", "/files/Audio.ClientVad.Output")
}

// 音频服务端VAD模式示例
func TestRealtimeClientAudioServerVad(t *testing.T) {
    doTestRealtimeClient("/files/Audio.ServerVad.Input", "/files/Audio.ServerVad.Output")
}

// 视频客户端VAD模式示例
func TestRealtimeClientVideoClientVad(t *testing.T) {
    doTestRealtimeClient("/files/Video.ClientVad.Input", "/files/Video.ClientVad.Output")
}

// 音频客户端VAD模式函数调用示例
func TestRealtimeAudioClientVadWithFunctionCall(t *testing.T) {
    doTestRealtimeClientWithFC("/files/Audio.ClientVad.FC.Input", "/files/Audio.ClientVad.FC.Output")
}
