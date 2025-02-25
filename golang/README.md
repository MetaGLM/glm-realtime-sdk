
# 智谱 Realtime Golang Low Level SDK

## 接口文档 

最新接口文档参考 https://open.bigmodel.cn/dev/api/rtav/GLM-Realtime

## 项目结构
```Text
.
├── README.md                        # 项目说明文档
├── client                           # SDK 核心代码
│   └── client.go
├── events                           # 数据模型定义
│   ├── event.go
│   ├── items.go
│   ├── response.go
│   └── tools.go
├── go.mod
├── go.sum
└── samples                          # 示例代码目录
    ├── .env.example                 # 环境变量示例文件
    ├── files                        # 示例输入输出数据目录
    │   ├── Audio.ClientVad.FC.Input # 音频客户端VAD模式函数调用示例输入数据
    │   ├── Audio.ClientVad.Input    # 音频客户端VAD模式示例输入数据
    │   ├── Audio.ServerVad.Input    # 音频服务端VAD模式示例输入数据
    │   ├── Video.ClientVad.Input    # 视频客户端VAD模式示例输入数据
    │   └── pics
    │       └── kunkun.jpg           # 视频客户端VAD模式示例上传图片
    ├── samples.go                   # 示例代码
    └── samples_test.go              # 示例代码单元测试
```

## 快速开始

### 1. 环境准备

首先确保您已安装 Golang 1.22.3 或更高版本。

### 2. 配置 API URL和密钥

您需要设置 ZHIPU_REALTIME_URL 和 ZHIPU_API_KEY 环境变量。
可以通过以下两种方式之一进行设置：

#### 方式一：直接设置环境变量

```bash
export ZHIPU_REALTIME_URL=zhipu_realtime_url
export ZHIPU_API_KEY=your_api_key
```

#### 方式二：使用 .env 文件

复制环境变量示例文件并修改：
```bash
cp .env.example .env
```
然后编辑 .env 文件，填入您的 API 密钥：
```
ZHIPU_REALTIME_URL=zhipu_realtime_url
ZHIPU_API_KEY=your_api_key
```

> 注：API 密钥可在 [智谱 AI 开放平台](https://www.bigmodel.cn/) 注册开发者账号后创建获取

### 3. 运行示例

可直接在IDE中运行samples/samples_test.go中的单元测试，或者在命令行中运行以下命令：

#### 3.1 音频客户端VAD模式示例

```bash
go test -v ./samples -run TestRealtimeClientAudioClientVad
```

#### 3.2 音频服务端VAD模式示例

```bash
go test -v ./samples -run TestRealtimeClientAudioServerVad
```

#### 3.3 视频客户端VAD模式示例

```bash
go test -v ./samples -run TestRealtimeClientVideoClientVad
```

#### 3.4 音频客户端VAD模式函数调用示例

```bash
go test -v ./samples -run TestRealtimeAudioClientVadWithFunctionCall
```

## 许可证

本项目采用 [LICENSE.md](../LICENSE.md) 中规定的许可证。

## 更新日志

详见 [CHANGELOG.md](../CHANGELOG.md)。

