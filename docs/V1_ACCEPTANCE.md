# Smart Home AI V1 验收记录

## 基本信息

- 版本：`v1.0.0`
- 验收日期：2026-04-29
- 阶段目标：文字版软件 Demo
- 发布分支：`main`

## V1 范围

V1 用于验证智能家居助手的软件闭环：

1. 用户通过文字输入自然语言需求。
2. 后端使用规则模拟 AI 判断用户意图。
3. 系统返回建议动作，但不直接执行。
4. 用户确认后，后端调用虚拟设备执行模块。
5. 前端刷新并展示设备最新状态。

V1 不接入真实大模型、真实语音或真实硬件。

## 已验收能力

### API 能力

| 能力 | 接口 | 验收结果 |
|---|---|---|
| 获取环境信息和设备列表 | `GET /api/state` | 通过 |
| 根据用户输入返回 AI 建议 | `POST /api/chat` | 通过 |
| 用户确认后执行设备动作 | `POST /api/execute` | 通过 |
| 缺少必要字段时返回错误 | `POST /api/chat`、`POST /api/execute` | 通过 |
| 非法设备或动作返回失败信息 | `POST /api/execute` | 通过 |

### 主流程

主流程验收场景：

```text
用户输入“好热”
→ 后端返回 intent=cooling
→ 返回建议动作 bedroom_ac / turn_on
→ 用户确认执行
→ 卧室空调状态从 off 变为 on
```

验收结果：通过。

### 前端联调

前端验收场景：

1. 打开 `frontend/index.html`。
2. 输入 `好热`。
3. 页面显示 AI 建议打开卧室空调。
4. 点击确认执行。
5. 页面显示执行成功，设备列表刷新为卧室空调已开启。

验收结果：通过。

## Smoke 测试摘要

```text
initialAcStatus: off
chatIntent: cooling
needConfirm: true
actionDeviceId: bedroom_ac
actionCommand: turn_on
executeSuccess: true
finalAcStatus: on
```

## 已知限制

- 当前设备和环境数据保存在 Node.js 进程内存中，服务重启后恢复初始状态。
- 当前 AI 决策为关键词规则模拟，不调用真实大模型 API。
- 当前设备执行为虚拟执行，不控制真实硬件。
- 当前仅支持文字交互，不支持语音输入或语音播报。
- 所有设备控制动作都需要用户确认后才执行。

## 后续方向

V1 封版后，下一阶段进入 V2：保留现有接口契约，将规则版 AI 决策模块替换为真实大模型 API 调用。
