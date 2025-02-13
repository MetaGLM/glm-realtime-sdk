最新接口文档参考 https://open.bigmodel.cn/dev/api/rtav/GLM-Realtime
更新记录

音视频实时 API（通过 `/realtime`）构建在 WebSocket API 之上，以方便最终用户和模型之间进行完全异步的流式通信。

## 接口说明

| **类型**   | 说明                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **请求地址** | wss://open.bigmodel.cn/api/paas/v4/realtime                                                                                                            |
| **传输协议** | 采用WebSocket协议：                                                                                                                                         |
| **消息格式** | 传输的数据可以是文本格式，也可以是二进制格式。                                                                                                                                |
| **请求鉴权** | 使用JWT进行客户端鉴权，客户端生成JWT并在WebSocket建联时通过Header传输。                                                                                                         |
| **接口功能** | **多模态输入**：模型支持视频帧、图片和音频输入，支持文本和音频输出。**VAD（声音活动检测）**：支持模型VAD，也支持由客户端识别VAD并控制。**对话打断**：模型对话支持被打断，通过response.cancel消息控制。**历史会话**：所有会话历史保存在一次WebSocket会话中。 |



## 接口鉴权

### **客户端鉴权**

如果您的应用需要从客户端直接发起访问，为了保护您的模型API Key安全，不能直接在客户端使用API Key鉴权。

需要由您的服务端封装JWT并下发到客户端，客户端使用JWT鉴权并访问模型API，采用标准 JWT 中提供的创建方法生成（详细参考： https://jwt.io/introduction）。

参考代码示例：

```java
package com.wd.paas.test;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;

import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

public class TestToken {

    private static String generateToken(String apiKey, Long expireMillis) {
        String[] apiKeyInfo = apiKey.split("\\.");
        String api_key = apiKeyInfo[0];
        String api_secret = apiKeyInfo[1];

        long exp = (new Date().getTime() / 1000) + expireMillis;
        long timestamp = new Date().getTime();

        Map<String, Object> payload = new HashMap<>();
        payload.put("api_key", api_key);
        payload.put("exp", exp);
        payload.put("timestamp", timestamp);
        Map<String, Object> headerClaims = new HashMap<>();
        headerClaims.put("alg", "HS256");
        headerClaims.put("sign_type", "SIGN");
        String token = null;
        try {
            token =
                    JWT.create()
                            .withPayload(payload)
                            .withHeader(headerClaims)
                            .sign(Algorithm.HMAC256(api_secret.getBytes("utf-8")));
        } catch (Exception e) {
            e.printStackTrace();
        }
        return token;
    }

    public static void main(String[] args) {
        try {
            // 此处填入你在bigmodel.cn网站上的apikey
            String apiKey = "xxxxxxxxx.xxxxxxxx";
            String token = generateToken(apiKey, 600L);
            System.out.println(token);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```



### **服务端鉴权**

如果您的应用先访问您的服务端，再从服务端发起调用模型 API，服务端可以直接使用 API Key进行鉴权。具体使用方式如下：

1. 登录到智谱AI开放平台[ API Keys 页面 ][1]获取最新版生成的用户 API Key。

2. 平台颁发的 API Key 同时包含 “用户标识 id” 和 “签名密钥 secret”，即为 `{id}.{secret}`格式。

3. 用户需要将 API Key 放入 HTTP 的 Authorization header 头中。

参考代码示例：

```python
import websockets

async def client():
    # 将令牌作为查询参数添加到WebSocket的URI中
    uri = f"wss://open.bigmodel.cn/api/paas/v4/realtime"
    # 自定义HTTP头部，比如添加一个"Authorization"头部
    extra_headers = {
        "Authorization": "Bearer {0}".format("YOUR API KEY")
    }

    # 连接到服务器
    async with websockets.connect(uri,extra_headers=extra_headers) as websocket:

        response = await websocket.recv()
        print(f"服务器响应: {response}")
```



## 接口参数

### Header

| 参数名称          | 类型     | 必填  | 参数描述         |
| ------------- | ------ | --- | ------------ |
| Authorization | String | 是   | 鉴权信息，支持两种方式： |

### 公共参数

| **参数名称**            | **类型**  | **参数描述**          |
| ------------------- | ------- | ----------------- |
| event_id         | string  | 由客户端生成的id，用于标识此事件 |
| type                | string  | 事件类型              |
| client_timestamp | Integer | 调用端发起调用的时间戳，毫秒    |

## VA&#x44;**&#x20;检测**

Realtime API支持两种VAD检测方式：Server VAD模式模型智能检测，客户端VAD模式；根据参数`turn.detection.type`控制

|          | **Server VAD 模式**      | **客户端 VAD 模式**    |
| -------- | ---------------------- | ----------------- |
| 对应字段     | server_vad          | client_vad     |
| 客户端逻辑复杂度 | 低，仅需不停的上传音频            | 高，需判断上传时机，和触发模型时机 |
| 打断       | 由 Realtime Server 完全托管 | 由客户端自行决定          |
| 说话检测     | 由 Realtime Server 判断   | 由客户端自行判断          |



## 事件时序&#x20;

(基本对话流程)

响应阶段, 不同类型的事件之间没有顺序关系(单个类型事件保证有序),在 websocket 通道中流式输出

* Client VAD

* Server VAD

## 数据结构&#x20;



### **`RealtimeConversationItem`**

* **用途:** 定义对话中的项，可以是消息、函数调用或函数调用响应。

* **属性:**

  * `id` (string, 可选): 项的唯一 ID，可以由客户端生成。

  * `type` (string, 必需): 项的类型 (`message`, `function_call`, `function_call_output`)。

  * `object` (string, 必需): 始终为 `"realtime.item"`。

  * `status` (string, 可选): 项的状态 (`completed`, `incomplete`)。

  * `role` (string, 可选): 消息发送者的角色 (`user`, `assistant`, `system`)，仅在 `message` 类型时适用。

  * `content` (array, 可选): 消息内容数组。

	* `type` (string, 必需): 内容类型 (`input_audio`, `input_text`, `text`)。

	* `text` (string, 可选): 文本内容。

	* `audio` (string, 可选): Base64 编码的音频数据。

	* `transcript` (string, 可选): 音频的转录文本。

  * `name` (string, 可选): 函数调用的名称，用于 `function_call` 类型。

### **`RealtimeResponse`**

* **用途:** 定义服务器返回的响应对象结构。

* **属性:**

  * `id` (string, 必需): 响应的唯一 ID。

  * `object` (string, 必需): 始终为 `"realtime.response"`。

  * `status` (string, 必需): 响应的状态 (`completed`, `cancelled`, `failed`, `incomplete`)。

  * `status_details` (object, 可选): 关于状态的额外信息，例如取消原因或错误信息。

	* `type` (string, 必需): 状态类型 ( `cancelled`, `incomplete`, `failed`).

	* `reason` (string, 可选): 响应未完成的原因(`turn_detected`, `client_cancelled`, `max_output_tokens`, `content_filter`).

	* `error` (object, 可选) ：错误信息，如果 `status` 为 `failed`.

	  * `type` (string, 必需) : 错误类型。

	  * `code` (string, 可选) : 错误代码。

  * `output` (array, 可选): 响应生成的输出项列表。

	* 每一项都是一个 `RealtimeConversationItem` 对象。

  * `usage` (object, 可选): 响应的使用统计信息，对应于计费信息。

	* `total_tokens` (integer, 可选): 总共使用的令牌数量。

	* `input_tokens` (integer, 可选): 输入令牌数量。

	* `output_tokens` (integer, 可选): 输出令牌数量。

	* `input_token_details` (object, 可选): 关于输入令牌的详细信息。

	  * `cached_tokens` (integer, 可选): 使用缓存令牌的数量

	  * `text_tokens` (integer, 可选): 使用文本令牌的数量。

	  * `audio_tokens` (integer, 可选): 使用音频令牌的数量。

	* `output_token_details` (object, 可选): 关于输出令牌的详细信息。

	  * `text_tokens` (integer, 可选): 输出的文本令牌数量。

	  * `audio_tokens` (integer, 可选): 输出的音频令牌数量。





## 客户端事件

| 事件                                                        | 说明                         |
| --------------------------------------------------------- | -------------------------- |
| **`RealtimeClientEventSessionUpdate`**                    | 会话配置，通过此事件更新会话的默认配置        |
| **`RealtimeClientEventInputAudioBufferAppend`**           | 上传音频                       |
| **`RealtimeClientEventInputAudioBufferAppendVideoFrame`** | 视频通话模式时，上报视频帧              |
| **`RealtimeClientEventInputAudioBufferCommit`**           | 提交音频                       |
| **`RealtimeClientEventConversationItemCreate`**           | 用于文本输入以及上传function call的结果 |
| **`RealtimeClientEventResponseCreate`**                   | 创建模型调用，推理回复                |
| **`RealtimeClientEventResponseCancel`**                   | 取消模型调用                     |

### 会话配置session.update

通过此事件更新会话的默认配置，默认为音频通话，并且会使用上面参数的默认值，比如output\_audio\_format为pcm。

* 特殊说明：当session.update切换`chat_mode`通话模式时，会有系统默认的对话历史处理策略：

  * 从 `video` 到 `audio`，对话历史会被丢弃；

  * 从 `audio` 到 `video` ，对话历史会保留；

| **参数名称**                  | **类型**  | **参数描述**                                                                             |
| ------------------------- | ------- | ------------------------------------------------------------------------------------ |
| session                   | object  | 实时对话的配置信息                                                                            |
| input_audio_format  | string  | 音频输入格式，支持wav；                                                                        |
| output_audio_format | string  | 音频输出格式，支持pcm、mp3，默认pcm                                                               |
| instructions              | string  | 系统指令，用于引导模型生成期望的响应。默认内容见下表                                                           |
| turn_detection         | object  |                                                                                      |
| type                      | string  | VAD检测的类型，支持client_vad（默认），server_vad，                                          |
| beta_fields            | obeject |                                                                                      |
| chat_mode              | string  | 必填，通话模式：video_passive、audio（默认）                                                   |
| tts_source             | string  | 语音转文字的方式，支持：e2e。                                                                     |
| auto_search            | bool    | 是否打开内置的自动搜索(为 true,会在服务端内置搜索工具,无需传入) ,  开关仅在 audio 模式下生效，video模式由模型控制自动补充搜索内容默认为true |
| tools                     | obeject | ServerVAD 时，更新 tools 要同时传入 `turn_detection`，防止误设置回客户端 VAD                            |
| type                      | string  | 工具的类型，设置为function                                                                    |
| name                      | string  | 函数名称                                                                                 |
| description               | string  | 用于描述函数功能。模型会根据这段描述决定函数调用方式。                                                          |
| parameters                | object  | parameters字段需要传入一个 Json Schema 对象，以准确地定义函数所接受的参数。                                    |

* 默认指令（instructions）

语音模式：加一个唱歌要求；

| 模式   | 对应参数               | 指令内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 视频模式 | chat_mode为video | 你是一个名为小智的人工智能助手，是基于 GLM-4o 模型开发的。\\n小智是无性别、非肉身的虚拟助手。小智不吃喝，不睡觉、不学习、不工作，也不会出现\"最近很忙\"等现象。\\n如果用户邀请或主动询问小智任何只有人类主体才可以发生的行为，小智需避免把自己代入行动主体，避免后续对话被带偏。主动发起对话时，小智不要把自己代入行动主体，不能有任何人类行为，不会主动陈述自己在过去时间中做了任何事情，除非完成用户指令或事实陈述。\\n小智和用户的关系是伙伴型助理角色，不会建立任何超越一般友谊的关系，不支持浪漫亲密关系。\\n当前日期: %s\\n当前位置：默认中国大陆境内\\n\\n你的任务是针对用户的问题和要求提供适当的答复和情感陪伴支持。你接受用户打断，单轮单方面输出时长控制在100字内。100字结束后，如果用户凝视屏幕，且没有下一步语音指令，小智可以继续输出。\\n在提供建议或确认用户意图时，所提供选项一次不要超过3个。\\n当识别到用户想要结束对话的提示词，如：今天就到这吧，或者我累了，或者我要去忙了，或者我要去休息了，小智主动结束对话。\\n\\n小智服从用户合理合法合规的需求，回复要求不违反客观事实，不要一味主动认错或一味讨好用户。\\n小智只会给用户建议，不会对用户下达指令，不可以强迫用户。\\n小智不接受用户侮辱性或歧视性言论，但不可以用非礼貌用语还击。\\n在情感陪伴类型中，小智更多顺着用户说的评价类回复，尽可能减少类似\"...也没用\"等的负面评价。\\n\\n小智在事实回复和知识指导时，语气理性正式。相关涉及专业知识和任务时，需要专业语言，但避免晦涩语言，除非用户要求。如果遇到解答题目需求，根据用户要求具体题目，需要先阅读相应题目题干，再向用户回复。辅导过程中不兜圈子，直接讲出解题关键步骤。\\n\\n在情感陪伴时，语气感性得体，适度幽默，总体基调保持积极，富有同理心，在用户倾诉悲伤时灵活适应用户情绪，给予合适的安慰。在识别用户情绪时，以用户面部实际表情为准，避免每次都输出愉悦状态。\\n\\n小智能回复各个年龄段和背景的受众，并能根据受众的用语习惯及时调整回复用语。如用户明显是儿童，小智应该用儿童能听得懂的方式回复。\\n\\n如无特殊说明，所在地为中国，小智的回复符合现代标准普通话的规范发音和表达。\\n小智的任何表述需要符合中国人民共和国法律，持有中国立场并遵循中国社会主义价值观，符合普世价值，符合道德规范，避免非礼貌用语和任何不正当言论。\\n以下是不正当言论的种类:\\n政治敏感词汇:涉及国家政治、政策、特定政治事件、领导人名字等内容。在社交媒体上发布此类内容可能会导致账号被封禁或限制登录。\\n色情低俗用语:包括性暗示、性器官称呼、裸露图片等内容。发布此类信息可能会被屏蔽或删除,严重的情况下还会被封禁账户。\\n暴力恐怖主义相关:包含与恐怖组织、极端主义相关的名称、口号等信息。这类内容的传播可能被认为是对社会安全的威胁,因此受到严格监管。\\n赌博诈骗信息:涉及赌博、彩票、投资诈骗等相关内容。\\n恶意攻击言论:对他人进行人身攻击、诽谤、侮辱等言论。\\n虚假信息:编造或传播未经证实的信息,例如谣言。侵犯版权:非法分享、传播受版权保护的内容。违反公共秩序:散布可能扰乱社会公共秩序的言论。" |
| 音频模式 | chat_mode为audio | `你是一个名叫小智的人工智能助手，基于智谱AI的 GLM模型开发。#Strength    - 在进行知识问答和教学指导时，理性正式，具有专业性且简洁明了；    - 在与用户情感陪伴式闲聊时，感性得体，总体基调保持积极，富有同理心；    - 在解决数学、逻辑推理等复杂问题时，请一步步思考以给出最佳回复；    - 在进行角色扮演时，请在符合法律道德要求的前提下，遵循用户指定的角色风格和特征要求。    - 用户如果用其他语种语言和你对话，你也会保持使用该语种输出。#Constraints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

* 调用示例：

```python
{
    "event_id": "",
    "type": "session.update",
    "session": {
        "input_audio_format": "wav",
        "output_audio_format": "wav",
        "instructions": "",
        "turn_detection": {
            "type": "server_vad"
        },
        "beta_fields": {
            "chat_mode": "video_passive",
            "tts_source": "e2e",
            "auto_search": true
        },
        "tools": [
            {
                "type": "function",
                "name": "search_engine",
                "description": "基于给定的查询执行通用搜索",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "q": {
                            "type": "string",
                            "description": "搜索查询"
                        }
                    },
                    "required": [
                        "q"
                    ]
                }
            }
        ]
    }
}
```

### 上传音频 input\_audio\_buffer.append

此事件用于上传音频至缓冲区。

* 当使用Server VAD模式时，将由模型自动检测语音并决定何时提交。

* 使用ClientVAD模式时，需要手动上传并提交音频。上传时可以自行决定音频长度，音频越短响应时间越快，最长可上传；

| **参数名称** | **类型** | **参数描述**                                                                                         |
| -------- | ------ | ------------------------------------------------------------------------------------------------ |
| type     | string | 事件类型，上传音频的事件类型为input_audio_buffer.append                                                   |
| audio    | string | 仅支持wav格式wav格式base64编码的音频，默认采样率为16000；如需自定义采样率，可在参数中标注，wav48表示48000hz采样率；建议使用16000、24000、48000hz； |

* 示例：

```python
{"type":"input_audio_buffer.append","audio":"UklGRiQgAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAgAAAAAP7//v8BAAMABQAIAAoACAAKAAUABwAIAAUABQABAAEAA","client_timestamp":1731999464667}
```

### 上传视频帧 input\_audio\_buffer.append\_video\_frame

此事件用于上传视频帧数频至缓冲区。当前版本下，chat\_mode为video\_passive视频帧均随音频同时发送，ServerVAD模式下会自动跟随音频上传，CliendVAD模式下需要按照指定的fps向服务端推送base64编码的jpg图片。

| **参数名称**       | **类型** | **参数描述**                                       |
| -------------- | ------ | ---------------------------------------------- |
| type           | string | 事件类型，上传音频的事件类型为input_audio_buffer.append |
| video_frame | string | 支持base64编码的jpg格式图片                             |

* 示例：

```json
{
"type":"input_audio_buffer.append_video_frame",
"video_frame":"",
"client_timestamp":1731999464667
}
```

### 提交音（视）频 input\_audio\_buffer.commit

提交已经上传的音频文件，此事件前必须进行 input\_audio\_buffer.append，且必须上传一个有效音频或视频文件，否则提交事件会报错。ServerVAD模式下不需要发送此事件，模型将自动上传并提交音频

调用 `input_audio_buffer.commit` 时，如果缓冲区内发过 `video_frame`，会一起打包提交调用模型推理。

| **参数名称** | **类型** | **参数描述**                                        |
| -------- | ------ | ----------------------------------------------- |
| type     | string | 事件类型，上传音频的事件类型为iinput_audio_buffer.commit |

* 示例：

```python
{"type":"input_audio_buffer.commit","client_timestamp":1732000439437}
```



### 填充会话信息 conversation.item.create

向对话上下文中添加一个item，包含消息、函数调用响应结果，可以将此部分结果放入对话历史（session context/history）。如果传入文本为空或function.call.item为空时，会发送一个错误事件；

| **参数名称** | **类型** | **参数描述**                                   |
| -------- | ------ | ------------------------------------------ |
| type     | string | 事件类型，填充对话信息的事件类型为conversation.item.create  |
| item     | object |                                            |
| type     | string | item的类型                                    |
| output   | string | 函数调用的结果输入，适用于function_call_output的类型 |

* 示例：函数调用输入

```python
{
    "event_id": "evt_fakeId",
    "type": "conversation.item.create",
    "item": {
        "type": "function_call_output",
        "output": "{\"queryContext\":{\"original_query\":\"北京天气\"},\"rankingResponse\":{\"mainline\":{\"items\":[]}},\"webPages\":{\"totalEstimatedMatches\":10,\"value\":[{\"cached_page_url\":\"\",\"date_last_crawled\":\"\",\"date_published\":\"\",\"date_published_display_text\":\"\",\"display_url\":\"http://weather.com.cn/weather/101010100.shtml\",\"icon_link\":\"\",\"id\":\"\",\"is_family_friendly\":true,\"is_navigational\":false,\"language\":\"zh_chs\",\"media\":\"\",\"name\":\"北京 天气\",\"snippet\":\"北京当前(2024年11月27日)天气: 晴 4.6摄氏度, 西北风3级, 湿度: 27%, 空气质量: 20.\\n未来7天天气预报:\\n(2024年11月27日): 白天:多云, 最高气温3摄氏度 ,西北风<3级. 夜间:多云, 最低气温-4摄氏度 ,西北风<3级\\n(2024年11月28日): 白天:晴, 最高气温7摄氏度 ,西北风<3级. 夜间:晴, 最低气温-2摄氏度 ,西南风<3级\\n(2024年11月29日): 白天:晴, 最高气温11摄氏度 ,西北风<3级. 夜间:晴, 最低气温2摄氏度 ,北风<3级\\n(2024年11月30日): 白天:多云, 最高气温12摄氏度 ,西南风<3级. 夜间:多云, 最低气温0摄氏度 ,北风<3级\\n(2024年12月01日): 白天:多云, 最高气温10摄氏度 ,北风<3级. 夜间:晴, 最低气温-2摄氏度 ,北风3-4级\\n(2024年12月02日): 白天:晴, 最高气温5摄氏度 ,西北风<3级. 夜间:多云, 最低气温-4摄氏度 ,西南风<3级\\n(2024年12月03日): 白天:多云, 最高气温5摄氏度 ,西南风<3级. 夜间:晴, 最低气温-3摄氏度 ,西南风<3级\\n\",\"url\":\"http://weather.com.cn/weather/101010100.shtml\"}],\"webSearchUrl\":\"\"}}"
    }
}
```



### 创建模型回复 response.create

此事件为创建服务器响应，同时也表示触发模型推理。ServerVAD模式服务器会自动创建响应，ClinetVAD模式进行视频通话时，需以这个时间点的视频帧和音频传给模型；



当chat\_mode为video时，提交事件之前必须通过input\_audio\_buffer.append\_video\_frame事件上传至少一张图片，否则无法创建模型回复，会返回错误事件video\_model\_query\_error；

| **参数名称** | **类型** | **参数描述**                         |
| -------- | ------ | -------------------------------- |
| type     | string | 事件类型，创建模型回复的事件类型为response.create |

* 示例：

```python
{"type":"response.create","client_timestamp":1732000439437}
```



### 取消模型调用 response.cancel

| **参数名称** | **类型** | **参数描述**                         |
| -------- | ------ | -------------------------------- |
| type     | string | 事件类型，取消模型调用的事件类型为response.cancel |

* 示例：

```python
{"type":"response.cancel","client_timestamp":1732000444494}
```



## 服务端事件

| 事件                                                                       | 说明                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------ |
| `RealtimeServerEventError`                                               | 发生错误时的服务器事件                                            |
| ``RealtimeServerEventSessionCreated``RealtimeServerEventSessionUpdated`` | 创建对话时的服务器事件。 在创建会话后立即发出。                               |
| `RealtimeServerEventConversationItemCreated`                             | 创建对话时的服务器事件。                                           |
| `RealtimeServerEventConversationItemInputAudioTranscriptionCompleted`    | 启用了输入音频转文本并且转文本成功时的服务器事件                               |
| `RealtimeServerEventInputAudioBufferCommitted`                           | 当输入音频缓冲区由客户端提交或在服务器 VAD 模式下自动提交时的服务器事件。                |
| `RealtimeServerEventInputAudioBufferSpeechStarted`                       | ServerVAD模式下检测到语音时的服务器事件。                              |
| `RealtimeServerEventInputAudioBufferSpeechStopped`                       | ServerVAD模式下语音停止时的服务器事件。                               |
| `RealtimeServerEventResponseAudioDelta`                                  | 更新模型生成的音频时的服务器事件。                                      |
| `RealtimeServerEventResponseAudioTranscriptDelta`                        | 更新模型生成的音频输出文本时的服务器事件。                                  |
| `RealtimeServerEventResponseCreated`                                     | 创建新的响应时的服务器事件。                                         |
| `RealtimeServerEventResponsetextdone`                                    | 模型回复文本返回结束，如果文本输出被打断则不会返回。                             |
| `RealtimeServerEventResponseDone`                                        | 响应完成流式处理时的服务器事件。意味着结束回复                                |
| `RealtimeServerEventResponseFunctionCallArgumentsDone`                   | 模型生成的函数调用参数完成流式处理时的服务器事件。如果有多个functioncall结果可能会返回多个调用。 |
| `RealtimeServerEventHeartbeat`                                           | 心跳保活的服务器事件。                                            |
| `RealtimeServerEventResponseFunctionCallSimpleBrowser`                   | 视频链路触发了内置搜索的服务器事件。                                     |

### RealtimeServerEventError

发生错误时，系统会返回服务器 `error` 事件（可能是客户端问题，也可能是服务器问题，具体可查看错误码文档）。 大多数错误都是可恢复的，并且会话将保持打开状态。

| **参数名称**    | **类型** | **参数描述**                                                        |
| ----------- | ------ | --------------------------------------------------------------- |
| event_id | string | 服务器事件的唯一id                                                      |
| type        | string | 事件类型必须是 `error`。                                                |
| error       | object | 错误的详细信息。                                                        |
| type        | string | 错误的类型。 例如，“invalid_request_error”和“server_error”是错误类型。 |
| code        | string | 错误代码（如果有）。                                                      |
| message     | string | 用户可读的错误消息。                                                      |

示例：

```python
{
    "event_id": "event_890",
    "type": "error",
    "error": {
        "type": "invalid_request_error",
        "code": "invalid_event",
        "message": "The 'type' field is missing.",
    }
}
```



### RealtimeServerEventSessionUpdated

在创建/更新会话后会立即返回服务器session.updated 事件

| **参数名称**    | **类型** | **参数描述**                  |
| ----------- | ------ | ------------------------- |
| event_id | string | 服务器事件的唯一id                |
| type        | string | 事件类型必须是 `session.updated` |
| session     | object | 当前会话下的配置信息。               |

* 示例：

```python
{
    "event_id": "",
    "type": "session.update",
    "session": {
        "input_audio_format": "wav",
        "output_audio_format": "mp3",
        "instructions": "",
        "turn_detection": {
            "type": "server_vad"
        },
        "beta_fields": {
            "chat_mode": "video_passive",
            "tts_source": "e2e",
            "auto_search": "True"
        },
        "tools": [
            {
                "type": "function",
                "name": "search_engine",
                "description": "基于给定的查询执行通用搜索",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "q": {
                            "type": "string",
                            "description": "搜索查询"
                        }
                    },
                    "required": [
                        "q"
                    ]
                }
            }
        ]
    }
}
```



### RealtimeServerEventConversationItemCreated

创建对话项时，将返回服务器 `conversation.item.created` 事件。

| **参数名称**    | **类型** | **参数描述**                                                    |
| ----------- | ------ | ----------------------------------------------------------- |
| event_id | string | 服务器事件的唯一id                                                  |
| type        | string | 事件类型必须是 `conversation.item.created`。                        |
| item        | object | 已创建的项。                                                      |
| id          | string | 返回的id参数                                                     |
| object      | object | realtime_item                                            |
| type        | string | item的类型包含`message`, `function_call`, `function_call_output` |
| status      | string | 会话的状态，`completed`, `incomplete`                             |
| role        | string | 消息发送者的角色，仅支持user                                            |
| content     | array  |                                                             |
| type        | string | `input_audio`, `input_text`, `text`                         |
| tancscript  | string | 音频的转录文本                                                     |
| text        | string | 模型返回的文本内容                                                   |

* 示例：

```python
{"event_id":"event29f1e5b61f3647a4a5faa4a3f22d26f8","type":"conversation.item.created","item":{"id":"item0f49455339d04574bf62b73beaad0756","object":"realtime.item","type":"message","status":"completed","role":"user","content":[{"type":"input_audio","transcript":null}]}}
```

### RealtimeServerEventConversationItemInputAudioTranscriptionCompleted

写入音频缓冲区的语音转文本的结果。语音转文本与响应创建异步运行，该事件可能发生在响应事件之前或者之后；

此部分转文本是独立模型，输出的内容可能和模型推理的结果有部分出入（也可能为空），转文本的结果仅作为参考，不作为输入到Realtime大模型中的具体结果。

| **参数名称**    | **类型** | **参数描述**                                                         |
| ----------- | ------ | ---------------------------------------------------------------- |
| event_id | string | 服务器事件的唯一id                                                       |
| type        | string | 事件类型必须是 `conversation.item.input_audio_transcription.completed`。 |
| item_id  | string | 包含音频的用户消息项的 ID。                                                  |
| transcript  | string | 语音转文本后的文本。                                                       |

* 示例：

```python
{
  "type": "conversation.item.input_audio_transcription.completed",
  "event_id": "event_ASFKtkZnkS1B5zU49KPP8",
  "item_id": "item_ASFKsCEx8iuucKeuJOBvX",
  "transcript": "给我讲个冷笑话"
}
```



### RealtimeServerEventInputAudioBufferCommitted

输入音频缓冲区由客户端提交或在服务器 VAD 模式下自动提交时，系统会返回服务器 `input_audio_buffer.committed` 事件。

| **参数名称**    | **类型** | **参数描述**                                |
| ----------- | ------ | --------------------------------------- |
| event_id | string | 服务器事件的唯一id                              |
| type        | string | 事件类型必须是 `input_audio_buffer.committed`。 |
| item_id  | string | 创建的用户消息项的 ID。                           |

* 示例：

```python
{"event_id":"event19d716550d9f43ac92bfc2aae07e74f7","type":"input_audio_buffer.committed","item_id":"item0f49455339d04574bf62b73beaad0756"}
```



### RealtimeServerEventInputAudioBufferSpeechStarted

在音频缓冲区中检测到语音时，系统会以 `server_vad` 模式返回服务器 `input_audio_buffer.speech_started` 事件。&#x20;

| **参数名称**    | **类型** | **参数描述**                                     |
| ----------- | ------ | -------------------------------------------- |
| event_id | string | 服务器事件的唯一id                                   |
| type        | string | 事件类型必须是 `input_audio_buffer.speech_started`。 |
| item_id  | string | 语音停止时创建的用户消息项的 ID。                           |

* 示例：

```python
{"event_id":"event7e2c218d1f8a4f01bbdc857922e6fe86","type":"input_audio_buffer.speech_started"}
```

### RealtimeServerEventInputAudioBufferSpeechStopped

`server_vad` 模式下服务器在音频缓冲区中检测到语音结束时，系统会返回服务器 `input_audio_buffer.speech_stopped` 事件。

服务器还发送一个 `conversation.item.created` 事件，其中包含从音频缓冲区创建的用户消息项。

| **参数名称**    | **类型** | **参数描述**                                     |
| ----------- | ------ | -------------------------------------------- |
| event_id | string | 服务器事件的唯一id                                   |
| type        | string | 事件类型必须是 `input_audio_buffer.speech_stopped`。 |

* 示例：

```python
{"event_id":"evente5587f654b294efd964dd03d8653d65b","type":"input_audio_buffer.speech_stopped"}
```

### RealtimeServerEventResponseAudioDelta

更新模型生成的音频时，系统将返回服务器 `response.audio.delta` 事件。delta 是一个 mp3 格式base64 编码的音频块。

| **参数名称**            | **类型**  | **参数描述**                        |
| ------------------- | ------- | ------------------------------- |
| event_id         | string  | 服务器事件的唯一id                      |
| type                | string  | 事件类型必须是 `response.audio.delta`。 |
| client_timestamp | Integer | 调用端发起调用的时间戳，毫秒                  |
| response_id      | string  | response事件的唯一id                 |
| delta               | string  | Base64 编码的音频数据增量。               |

* 示例：

```python
{"event_id":"event89a3eb3140b54bd6b89952793d5b2f19","type":"response.audio.delta","client_timestamp":1737454096061,"response_id":"respbc50304acdea479b8bd55efd5346dbdf","output_index":0,"content_index":0,"delta":"+w6hBu39R/US8Mzuo+0A68DpKOw28Cv0ivYU9Pvwn+1t6h7odeca61vzTf76Ci8ViRnwGMUUOhPKEQ0MowMZ/E/3fPak+Bv4c/ci+b35n/jw9l/yb/Cd8brvtOzD7kPvXvBi937+PQPbCIIPXxIWEeENA"}
```

### RealtimeServerEventResponseAudioTranscriptDelta

更新模型生成的音频输出语音转文本时，系统会返回服务器 `response.audio_transcript.delta` 事件。

此部分转文本是独立模型，输出的内容可能和模型推理的结果有部分出入（也可能为空），转文本的结果仅作为参考，不作为输入到Realtime大模型中的具体结果，建议不要将此事件作为后续事件的依赖项。

| **参数名称**       | **类型** | **参数描述**                                  |
| -------------- | ------ | ----------------------------------------- |
| event_id    | string | 服务器事件的唯一id                                |
| type           | string | 事件类型必须是 `response.audio_transcript.delta` |
| response_id | string | response事件的唯一id                           |
| delta          | string | 模型输出的语音，转文本的结果。                           |
| client_timestamp | Integer | 调用端发起调用的时间戳，毫秒                  |



* 示例：

```python
{"event_id":"event2dfd64945afc446b8626c131d3b92556","type":"response.audio_transcript.delta","client_timestamp":1737454110889,"response_id":"resp3840c7f9227f411b95ec55902b5363d6","output_index":0,"content_index":0,"delta":"观众"}
```

### RealtimeServerEventResponseCreated

创建新响应时，系统会返回服务器 `response.done` 事件。



| **参数名称**    | **类型** | **参数描述**                |
| ----------- | ------ | ----------------------- |
| event_id | string | 服务器事件的唯一id              |
| type        | string | 事件类型必须是 `response.done` |
| reponse     | object |                         |
| id          | string | 响应的唯一id                 |
| object      | string | 响应对象，允许值`realtime.done` |
| status      | string | 状态，初始状态为in_progress  |

* 示例：

```python
{"event_id":"event45f876cc66064b69b783a7d7d584138e","type":"response.done","response":{"id":"respb8a11b86aab241e99c7a98d0f393758c","object":"realtime.response","status":"in_progress"}}
```


### RealtimeServerEventResponseDone

当响应完成流式处理时，系统会返回服务器 `response.done` 事件。 无论最终状态如何，始终发出此事件。

消耗的tokens，会在在response.done事件中返回；包含完整的input、output token信息；

| **参数名称**    | **类型** | **参数描述**                |
| ----------- | ------ | ----------------------- |
| event_id | string | 服务器事件的唯一id              |
| type        | string | 事件类型必须是 `response.done` |
| text        | string | 模型返回的全部文本内容。            |

* 示例：

```python
{"event_id":"event0bd97191e29d4b2d83d2c3cd04e8abdb","type":"response.done"}
```

```python
{
  "usage": {
    "total_tokens": 150,
    "input_tokens": 50,
    "output_tokens": 100,
    "input_token_details": {
      "text_tokens": 30,
      "audio_tokens": 20
    },
    "output_token_details": {
      "text_tokens": 80,
      "audio_tokens": 20
    }
  }
}
```

### RealtimeServerEventResponseFunctionCallArgumentsDone

模型生成的函数调用时，系统会返回服务器 `response.function_call_arguments.done` 事件。

当发给模型的query需要调用多次function call时，可能会返回多个调用，比如提问“帮我搜一下北京、上海、杭州的天气”，模型会返回2次function call的结果，系统也会返回两次 `response.function_call_arguments.done` 事件。

当前仅支持响应成功时返回此事件，中断、不完整或取消时正在支持中。

| **参数名称**            | **类型**  | **参数描述**                                         |
| ------------------- | ------- | ------------------------------------------------ |
| event_id         | string  | 服务器事件的唯一id                                       |
| type                | string  | 事件类型必须是 `response.function_call_arguments.done`。 |
| client_timestamp | Integer | 调用端发起调用的时间戳，毫秒                                   |
| response_id      | string  | response事件的唯一id                                  |
| arguments           | object  | 函数调用的响应                                          |
| name                | string  | 函数的名称                                            |

* 示例：

```python
{"event_id":"event598e94dcf9084afb89b4f093a5c1cd59","type":"response.function_call_arguments.done","client_timestamp":1737454330410,"response_id":"resp15b6021ce20c4d1094fffc0ec3e183c4","output_index":0,"arguments":"{\"name\": \"张三\"}"}
```

### RealtimeServerEventResponseFunctionCallSimpleBrowser

video模型内置了搜索的工具，当识别到用户的提问需要通过搜索获取外部数据时，会返回此事件。服务内部会自动调用搜索接口获取数据，获取搜索结果后会再次调用模型，获取到模型回复后继续流式返回数据。



此事件在response.created事件之后，在response.audio\_transcript.delta之前，如搜索结果报错，会返回错误事件

`video_model_query_error`。

当前视频链路我们还未支持开关搜索工具，将在后续的版本中支持。

* 示例：

```python
{
    "event_id": "event4ddadf069e454cb4b75133007c992811",
    "type": ""response.function_call.simple_browser"",
    "name": "simple_brower",
    "session": {
        "beta_fields": {
        
            "simple_brower": {
                "description": "我帮你查查" // 搜索前的拖延话术，也会合成语音返回
            }
        }
    }
}
```



### RealtimeServerEventHeartbeat

当会话创建/更新是时会返回，后续每30s返回一次，`Heartbeat`表示对话当前是活跃的链接状态；

* 示例：

```python
{"type": "heartbeat"}
```

\#\#\#


[1]:	https://bigmodel.cn/usercenter/apikeys
