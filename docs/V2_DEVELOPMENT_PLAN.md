# Smart Home AI V2 开发说明

## V2 定位

V2 将 Smart Home AI 从 V1 的关键词规则 Demo 升级为偏智能家居场景的通用家庭助手。

大模型不只负责判断用户意图，也可以回答家电知识、节能建议、生活场景建议和简单闲聊。只有当用户明确要求控制设备，或场景需求非常适合通过当前设备解决时，才生成安全、可解释、可执行的家居控制建议。

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
  "reply": "空调主要通过制冷剂循环来搬运热量。室内机吸收房间热量，室外机把热量排出去，所以室内会变凉。",
  "intent": "knowledge_question",
  "needConfirm": false,
  "action": null
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
- 知识问答、闲聊、设备能力说明等场景可以只返回自然语言回答，不必生成设备动作。
- 只有明确控制意图或强场景匹配时，才返回 `needConfirm=true` 和 `action`。
- 空调设备会暴露 `targetTemperature`，并通过 `set_temperature + value` 支持 16 到 30 度的参数化温度控制。
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
- 如果动作不会改变设备状态，例如空调已经开启且设定温度等于目标 `value` 时再次返回 `set_temperature`，后端会改为无动作响应。

## V2 验收场景

未启用模型时：

- 输入 `好热`，应保持 V1 行为，返回 `cooling` 和 `bedroom_ac / turn_on`。

启用模型时：

- 输入 `睡觉前帮我调舒服一点`，应结合卧室、22:30、29 度，建议 `bedroom_ac / set_temperature / 26`。
- 输入 `空调温度设置为27`，应建议 `bedroom_ac / set_temperature / 27`。
- 输入 `客厅太暗了`，应建议 `livingroom_light / turn_on`。
- 输入 `空调的原理是什么`，应正常回答空调原理，且 `action=null`。
- 输入 `讲个笑话`，可以自然回复，且 `action=null`。
- 输入 `你能控制什么`，应返回能力说明，且 `action=null`。
- 输入不存在设备或不支持动作时，不能返回非法动作。

故障场景：

- API Key 缺失、模型服务不可用、网络失败、返回非 JSON 或返回非法动作时，应返回无动作提示。
