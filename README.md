# 智谱 Realtime Python Low Level SDK

## 接口文档 

最新接口文档参考 https://open.bigmodel.cn/dev/api/rtav/GLM-Realtime

## 项目结构
```
.
├── LICENSE.md               # 许可证文件
├── README.md               # 项目说明文档
├── GLM-Realtime-Doc-For-LLM.md      # 智谱 Realtime 接口文档 , 为 LLM 优化
├── python/                 # Python SDK 主目录
│   ├── rtclient/          # SDK 核心代码
│   │   ├── __init__.py    # 包初始化文件
│   │   ├── models.py      # 数据模型定义
│   │   ├── deprecated_models.py  # 暂未实现的 openai数据模型定义,逐步对齐中
│   │   └── low_level_client.py  # 底层客户端实现
│   ├── samples/           # 示例代码
│   │   ├── input/        # 示例输入文件
│   │   ├── low_level_sample_audio.py  # 音频模式示例
│   │   └── low_level_sample_video.py  # 视频模式示例
│   │   └── low_level_sample_server_vad.py  # 服务端VAD示例
│   │   └── low_level_sample_function_call.py  # 函数调用示例
│   ├── pyproject.toml    # Poetry 项目配置文件
│   ├── poetry.lock       # Poetry 依赖锁定文件
│   └── .env.example      # 环境变量示例文件
└── CHANGELOG.md          # 版本更新日志
```

## 快速开始

### 1. 环境准备

首先确保您已安装 Python 3.10 或更高版本(推荐 3.11)。

### 2. 安装配置

进入 Python SDK 目录：
```bash
cd python
```

#### 2.1 安装 Poetry (一个现代的 Python 包管理工具)

```bash
pip install poetry
```

#### 2.2 安装项目依赖

```bash
poetry install
```

#### 2.3 激活虚拟环境

```bash
poetry shell
```

### 3. 配置 API 密钥

您需要设置 ZHIPU_API_KEY 环境变量。可以通过以下两种方式之一进行设置：

#### 方式一：直接设置环境变量

```bash
export ZHIPU_API_KEY=your_api_key
```

#### 方式二：使用 .env 文件

复制环境变量示例文件并修改：
```bash
cp .env.example .env
```
然后编辑 .env 文件，填入您的 API 密钥：
```
ZHIPU_API_KEY=your_api_key
```

> 注：API 密钥可在 [智谱 AI 开放平台](https://www.bigmodel.cn/) 注册开发者账号后创建获取

### 4. 运行示例

#### 4.1 音频模式示例

```bash
python samples/low_level_sample_audio.py samples/input/give_me_a_joke.wav
```

#### 4.2 视频模式示例

```bash
python samples/low_level_sample_video.py samples/input/what_you_see_tts.wav samples/input/programmer.jpg
```

#### 4.3 函数调用示例

```bash
python samples/low_level_sample_function_call.py samples/input/call_zhangsan.wav
```

#### 4.4 服务端VAD示例

```bash
python samples/low_level_sample_server_vad.py samples/input/give_me_a_joke.wav
```




## 许可证

本项目采用 [LICENSE.md](LICENSE.md) 中规定的许可证。

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)。
