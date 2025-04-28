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

func TestRealtimeClientAudioClientVadText(t *testing.T) {
	doTestRealtimeClient("/files/Audio.ClientVad.Text.Input", "/files/Audio.ClientVad.Text.Output")
}

func TestRealtimeClientVideoClientVadText(t *testing.T) {
	doTestRealtimeClient("/files/Video.ClientVad.Text.Input", "/files/Video.ClientVad.Text.Output")
}

// 音频服务端VAD模式示例
func TestRealtimeClientAudioServerVad43(t *testing.T) {
	doTestRealtimeClient("/files/Audio.ServerVad.4.3.Input", "/files/Audio.ServerVad.4.3.Output")
}

func TestRealtimeClientVideoClientVadTextIn(t *testing.T) {
	doTestRealtimeClient("/files/Video.ClientVad.TextIn.Input", "/files/Video.ClientVad.TextIn.Output")
}

func TestRealtimeVideoClientVadWithFunctionCall(t *testing.T) {
	doTestRealtimeClientWithFC("/files/Video.ClientVad.FC.Input", "/files/Video.ClientVad.FC.Output")
}
