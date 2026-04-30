# Smart Home AI V2 开发说明

## V2 定位

V2 将 Smart Home AI 从 V1 的关键词规则 Demo 升级为 AI 家居决策助手。

大模型不只负责判断用户意图，还需要结合环境信息、设备状态和设备能力，生成安全、可解释、可执行的家居控制建议。

## 保持不变

V2 不修改现有公开接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/state` | 获取环境信息和设备列表 |
| POST | `/api/chat` | 提交自然语言输入，获取 AI 建议 |
| POST | `/api/execute` | 用户确认后执行设备动作 |

前端仍然使用 V1 的响应格式：

```json
{
  "reply": "自然语言解释和建议",
  "intent": "comfort_sleep",
  "needConfirm": true,
  "action": {
    "deviceId": "bedroom_ac",
    "command": "set_temp_26"
  }
}
```

## 配置

复制 `.env.example` 为 `.env`，按实际供应商填写：

```env
LLM_ENABLED=true
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
LLM_TIMEOUT_MS=15000
```

`LLM_BASE_URL` 使用 OpenAI-compatible API 地址，系统会调用：

```text
${LLM_BASE_URL}/chat/completions
```

## 决策策略

- `LLM_ENABLED=false` 时，系统使用 V1 规则模式，方便本地开发和演示。
- `LLM_ENABLED=true` 时，系统调用大模型生成决策。
- 大模型调用失败、超时、返回非 JSON 或返回非法动作时，系统返回无动作提示，不执行规则兜底。
- 后端会校验模型结果，只允许已配对设备和设备支持的动作。

## 校验规则

模型返回结果必须满足：

- `reply` 是非空字符串。
- `intent` 是非空字符串。
- `needConfirm` 是布尔值。
- `needConfirm=false` 时，`action` 必须为 `null`。
- `needConfirm=true` 时，`action.deviceId` 必须是已配对设备。
- `needConfirm=true` 时，`action.command` 必须存在于该设备的 `actions` 中。

## V2 验收场景

未启用模型时：

- 输入 `好热`，应保持 V1 行为，返回 `cooling` 和 `bedroom_ac / turn_on`。

启用模型时：

- 输入 `睡觉前帮我调舒服一点`，应结合卧室、22:30、29 度，建议 `bedroom_ac / set_temp_26`。
- 输入 `客厅太暗了`，应建议 `livingroom_light / turn_on`。
- 输入 `你能控制什么`，应返回能力说明，且 `action=null`。
- 输入不存在设备或不支持动作时，不能返回非法动作。

故障场景：

- API Key 缺失、模型服务不可用、网络失败、返回非 JSON 或返回非法动作时，应返回无动作提示。
