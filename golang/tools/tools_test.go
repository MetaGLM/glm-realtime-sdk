package tools

import (
	"encoding/base64"
	"fmt"
	"log"
	"testing"
)

func TestExtractFramesToBase64(t *testing.T) {
	video := ""
	// 解码为 []byte
	data, err := base64.StdEncoding.DecodeString(video)
	if err != nil {
		log.Fatal("解码失败：", err)
	}
	frames, err := ExtractFramesToBase64(data, "Z0LADJoFAAABMA==", "aM48gA==")
	if err != nil {
		panic(err)
	}
	for _, frame := range frames {
		fmt.Println(frame)
	}
}
