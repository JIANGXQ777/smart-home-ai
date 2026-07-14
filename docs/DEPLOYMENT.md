# 服务器部署建议

本地和公网入口的具体启动脚本见 [远程访问说明](REMOTE_ACCESS.md)。

## 推荐架构

当前项目最适合单实例部署：

```text
浏览器 / ESP32
    -> HTTPS / WSS 反向代理（Caddy 或 Nginx）
    -> Smart Home AI Node.js 服务
    -> SQLite 持久化文件
```

SQLite 文件必须放在持久化磁盘或 Docker Volume 中，不能放在容器临时文件系统。

如果未来需要多用户、多家庭或多个 Node 实例，再将 Store/Repository 层切换为 PostgreSQL。不要让多个容器同时写同一个 SQLite 文件。

## Docker Compose

1. 复制并修改配置：

```bash
cp .env.example .env
```

生产环境至少要修改：

```env
APP_MODE=hardware
DATABASE_PATH=/app/data/smart-home.db
DOCKER_BIND_ADDRESS=127.0.0.1
DOCKER_ESP32_TRANSPORT=websocket
ESP32_WS_TOKEN=使用随机生成的长令牌
LLM_API_KEY=你的密钥
```

2. 构建并启动：

```bash
docker compose up -d --build
```

3. 检查健康状态：

```bash
curl http://127.0.0.1:5000/api/health
```

服务器部署建议将 `DOCKER_BIND_ADDRESS` 设置为 `127.0.0.1`，只允许反向代理访问。家庭局域网内需要 ESP32 直接连接时，可改为 `0.0.0.0`，并通过防火墙限制只允许可信局域网访问 5000 端口。
`data/` 和 `.env` 都会挂载到容器中。LLM、ASR、TTS 配置保存在 SQLite 的 `model_configs` 表中，系统与硬件配置仍保存在 `.env`；重建容器后都会保留。请限制 `data/` 和 `.env` 的文件权限并纳入服务器密钥备份方案，不要提交到 Git。

## HTTPS 与 WebSocket

推荐使用 Caddy。反向代理会自动支持 WebSocket：

```caddyfile
smart-home.example.com {
    @esp32 path /ws/esp32
    handle @esp32 {
        reverse_proxy 127.0.0.1:5000
    }

    handle {
        basic_auth {
            admin <使用 caddy hash-password 生成的密码哈希>
        }
        reverse_proxy 127.0.0.1:5000
    }
}
```

正式部署前必须增加访问控制。当前后端 API 可以控制真实家电、修改配置和删除设备，不能直接裸露到公网。当前 ESP32 WebSocketsClient 与自定义 Authorization 请求头存在帧兼容问题，因此固件使用查询参数传递高强度 `ESP32_WS_TOKEN`；反向代理必须关闭包含查询参数的访问日志，管理控制台继续使用 Basic Auth 或单独身份认证。

## 数据备份

SQLite 已启用 WAL。备份时优先使用 SQLite 在线备份工具：

```bash
sqlite3 data/smart-home.db ".backup 'data/backups/smart-home-$(date +%F).db'"
```

至少保留每日备份，并定期验证备份文件可以打开。数据库文件、`-wal` 和 `-shm` 文件都不应提交到 Git。

## 何时迁移 PostgreSQL

出现以下任一情况时建议迁移：

- 同一套服务支持多个家庭或多个用户；
- 需要运行多个 Node 实例；
- 需要复杂报表、远程数据分析或长期大量事件记录；
- 需要数据库级权限、审计、复制和高可用。

迁移时保留现有 Store 模块的函数接口，替换底层 SQL 实现即可，路由与 AI 决策层不需要直接感知数据库类型。
