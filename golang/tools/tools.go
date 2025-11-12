package tools

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/go-audio/audio"
	"github.com/go-audio/wav"
)

func ConcatWavBytes(wavBytes [][]byte) ([]byte, error) {
	var combinedFrames []audio.IntBuffer
	var params *audio.Format
	var bitDepth int

	for _, wavData := range wavBytes {

		wavReader := bytes.NewReader(wavData)
		decoder := wav.NewDecoder(wavReader)

		if !decoder.IsValidFile() {
			return nil, fmt.Errorf("invalid WAV file")
		}

		buf, err := decoder.FullPCMBuffer()
		if err != nil {
			return nil, err
		}

		if params == nil {
			params = buf.Format
		} else {
			currentParams := buf.Format
			if params.SampleRate != currentParams.SampleRate ||
				params.NumChannels != currentParams.NumChannels {
				return nil, fmt.Errorf("所有 WAV 文件的参数必须相同")
			}
		}

		combinedFrames = append(combinedFrames, *buf)
		bitDepth = int(decoder.BitDepth)
	}
	if params == nil {
		return nil, fmt.Errorf("拼接音频失败，params 为空")
	}

	// 创建一个临时文件
	tempFile, err := os.CreateTemp("", "output-*.wav")
	if err != nil {
		return nil, err
	}
	defer tempFile.Close() // 确保文件会被关闭

	encoder := wav.NewEncoder(tempFile, params.SampleRate, bitDepth, params.NumChannels, 1)

	// 合并所有帧数据
	for _, buffer := range combinedFrames {
		if err := encoder.Write(&buffer); err != nil {
			return nil, err
		}
	}

	if err := encoder.Close(); err != nil {
		return nil, err
	}

	// 读取临时文件的数据到内存中
	tempFile.Seek(0, io.SeekStart)
	outputBuffer, err := io.ReadAll(tempFile)
	if err != nil {
		return nil, err
	}

	return outputBuffer, nil
}

// Pcm2Wav 将 PCM 数据转换为 WAV 格式，通过添加 WAV 文件头
// sampleRate: 采样率 (例如 16000, 44100)
// numChannels: 声道数 (1: 单声道, 2: 双声道)
// bitDepth: 位深度 (通常是 16)
func Pcm2Wav(pcmBytes []byte, sampleRate, numChannels, bitDepth int) ([]byte, error) {
	// WAV 文件头大小为 44 字节
	headerSize := 44
	fileSize := len(pcmBytes) + headerSize

	// 创建包含文件头的字节切片
	wavData := make([]byte, fileSize)

	// 1. RIFF 头
	copy(wavData[0:4], []byte("RIFF"))
	// 2. 文件大小 (文件总字节数 - 8)
	binary.LittleEndian.PutUint32(wavData[4:8], uint32(fileSize-8))
	// 3. WAVE 标记
	copy(wavData[8:12], []byte("WAVE"))
	// 4. fmt 子块
	copy(wavData[12:16], []byte("fmt "))
	// 5. fmt 子块大小 (16 表示 PCM 格式)
	binary.LittleEndian.PutUint32(wavData[16:20], 16)
	// 6. 音频格式 (1 表示 PCM)
	binary.LittleEndian.PutUint16(wavData[20:22], 1)
	// 7. 声道数
	binary.LittleEndian.PutUint16(wavData[22:24], uint16(numChannels))
	// 8. 采样率
	binary.LittleEndian.PutUint32(wavData[24:28], uint32(sampleRate))
	// 9. 字节率 (采样率 * 通道数 * 位深度 / 8)
	binary.LittleEndian.PutUint32(wavData[28:32], uint32(sampleRate*numChannels*bitDepth/8))
	// 10. 数据块对齐 (通道数 * 位深度 / 8)
	binary.LittleEndian.PutUint16(wavData[32:34], uint16(numChannels*bitDepth/8))
	// 11. 位深度
	binary.LittleEndian.PutUint16(wavData[34:36], uint16(bitDepth))
	// 12. data 子块
	copy(wavData[36:40], []byte("data"))
	// 13. 数据大小
	binary.LittleEndian.PutUint32(wavData[40:44], uint32(len(pcmBytes)))

	// 复制 PCM 数据
	copy(wavData[44:], pcmBytes)

	return wavData, nil
}

// ExtractFramesToBase64 接收 base64 编码的 H.264 数据，返回抽帧后图片的 base64 数组
func ExtractFramesToBase64(data []byte, spsB64, ppsB64 string) ([][]byte, error) {
	var images [][]byte
	// 创建临时目录
	tempDir, err := os.MkdirTemp("", "video_process_*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp dir: %v", err)
	}
	defer func(path string) {
		err := os.RemoveAll(path)
		if err != nil {
			log.Printf("failed to remove temp dir: %v", err)
		}
	}(tempDir) // 自动清理

	// 1. 解码 base64 到 .h264 文件
	h264Path := filepath.Join(tempDir, "input.h264")
	// 注入 SPS/PPS
	fixedData, err := InjectSPSPPS(data, spsB64, ppsB64)
	if err != nil {
		log.Fatal(err)
	}

	if err := os.WriteFile(h264Path, fixedData, 0644); err != nil {
		return nil, fmt.Errorf("write h264 file failed: %v", err)
	}

	// 2. 设置输出帧路径
	framePattern := filepath.Join(tempDir, "frame_%04d.jpg")

	// 3. 调用 ffmpeg 抽帧
	cmd := exec.Command(
		"ffmpeg",
		"-f", "h264",
		"-i", h264Path,
		"-vf", "fps=2", // 每秒 2 帧
		"-qscale:v", "2", // 高质量 JPEG
		"-y", // 允许覆盖
		framePattern,
	)

	// 捕获输出用于调试（可选）
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	log.Printf("Running command: %v", cmd.Args)
	err = cmd.Run()
	if err != nil {
		return nil, fmt.Errorf("ffmpeg execution failed: %v", err)
	}

	// 4. 查找所有生成的 jpg 文件并转为 base64
	matches, err := filepath.Glob(filepath.Join(tempDir, "frame_*.jpg"))
	if err != nil {
		return nil, fmt.Errorf("glob pattern error: %v", err)
	}

	// 按文件名排序（保证顺序）
	sortFiles(matches)

	for _, imgPath := range matches {
		imgData, err := os.ReadFile(imgPath) // 替代 ioutil.ReadFile
		if err != nil {
			return nil, fmt.Errorf("read image file failed: %v", err)
		}
		images = append(images, imgData)
	}

	log.Printf("Successfully extracted %d frames.", len(images))
	return images, nil
}

func InjectSPSPPS(rawH264 []byte, b64SPS, b64PPS string) ([]byte, error) {
	sps, err := base64.StdEncoding.DecodeString(b64SPS)
	if err != nil {
		return nil, fmt.Errorf("decode SPS failed: %v", err)
	}
	pps, err := base64.StdEncoding.DecodeString(b64PPS)
	if err != nil {
		return nil, fmt.Errorf("decode PPS failed: %v", err)
	}

	// 构造完整数据：[start code][SPS][start code][PPS][原始数据]
	var result []byte

	// 写入 SPS
	result = append(result, 0x00, 0x00, 0x00, 0x01)
	result = append(result, sps...)

	// 写入 PPS
	result = append(result, 0x00, 0x00, 0x00, 0x01)
	result = append(result, pps...)

	// 写入原始数据（即你现在拿到的 Type 1 流）
	result = append(result, rawH264...)

	return result, nil
}

// sortFiles 简单排序文件名（如 frame_0001.jpg, frame_0002.jpg）
func sortFiles(files []string) {
	// 使用标准库排序
	for i := 0; i < len(files); i++ {
		for j := i + 1; j < len(files); j++ {
			if files[i] > files[j] {
				files[i], files[j] = files[j], files[i]
			}
		}
	}
}
