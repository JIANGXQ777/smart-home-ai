# 项目文档

本文档目录只保留当前系统仍在使用的说明。历史阶段验收、旧截图和一次性比赛材料已移除，当前能力以代码、README 和以下文档为准。

| 文档 | 内容 |
|---|---|
| [API 文档](API.md) | 认证、状态、设备、AI、语音、配置和红外学习接口 |
| [部署说明](DEPLOYMENT.md) | Docker Compose、HTTPS、SQLite 备份与生产部署 |
| [远程访问](REMOTE_ACCESS.md) | Tailscale Funnel、局域网入口和启动脚本 |
| [ESP32 网络连接](ESP32_NETWORK.md) | WebSocket/WSS、令牌、固件网络配置和验证 |
| [浏览器语音](VOICE.md) | 麦克风采集、ASR、TTS、格式和使用流程 |
| [固件说明](../firmware/README.md) | ESP32-S3 依赖、协议、接线、编译与烧录 |

## 文档维护约定

- 当前行为以自动化测试和源代码为准。
- 新增或修改 API 时同步更新 [API 文档](API.md)。
- 修改环境变量时同步更新 `.env.example`、根目录 README 和相关部署文档。
- 运行截图、测试截图、日志、构建结果和临时报告不提交到仓库。
- 阶段性记录如果不再指导当前使用，应合并到现有文档或直接删除。
