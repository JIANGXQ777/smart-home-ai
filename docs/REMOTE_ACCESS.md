# 远程访问

项目使用 Tailscale Funnel 提供稳定的公网 HTTPS 地址，同时保留局域网访问入口。

```text
公网浏览器
  -> Tailscale Funnel
  -> 127.0.0.1:5001 访问网关
  -> 127.0.0.1:5003 Docker 应用

局域网浏览器或 ESP32
  -> 主机 5000 端口
  -> 127.0.0.1:5003 Docker 应用
```

## 前置条件

- Windows 已安装并登录 Tailscale。
- Tailnet 管理员已经允许 Funnel。
- Docker Desktop 正常运行。
- 根目录 `.env` 已配置安全的登录凭据和会话密钥。

推荐配置：

```env
APP_AUTH_USERNAME=admin
APP_AUTH_PASSWORD=设置一个至少16位的随机密码
APP_SESSION_SECRET=设置一个至少32位的随机字符串

DOCKER_BIND_ADDRESS=127.0.0.1
DOCKER_HOST_PORT=5003

PUBLIC_GATEWAY_HOST=127.0.0.1
PUBLIC_GATEWAY_PORT=5001
PUBLIC_GATEWAY_TARGET_HOST=127.0.0.1
PUBLIC_GATEWAY_TARGET_PORT=5003

LAN_GATEWAY_HOST=0.0.0.0
LAN_GATEWAY_PORT=5000
```

ESP32 的 WebSocket 连接继续使用独立的 `ESP32_WS_TOKEN`，不要与控制台登录密码共用。

## 启动

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-public-access.ps1
```

脚本会：

1. 启动 Docker Compose 服务。
2. 在本机启动公网和局域网转发网关。
3. 启动 Tailscale Funnel。
4. 输出当前公网和局域网地址。

当前机器配置的公网地址为：

```text
https://smart-home-ai.tail29b726.ts.net
```

实际部署时以脚本输出的 Tailscale DNS 名称为准。

## 停止

```powershell
powershell -ExecutionPolicy Bypass -File scripts/stop-public-access.ps1
```

运行日志写入被 Git 忽略的 `artifacts/public-access/`，不应提交到仓库。

## 本地镜像重建

Docker Hub 暂时不可用且依赖没有变化时，可以复用本地依赖构建镜像：

```powershell
npm run build
docker build --pull=false -f Dockerfile.local -t smart-home-ai-smart-home-ai:latest .
```

## 安全要求

- 公网入口必须使用 HTTPS。
- `.env`、SQLite 数据库、ESP32 令牌和固件 `secrets.h` 不得提交。
- 不要在反向代理日志中记录包含 `ESP32_WS_TOKEN` 的 WebSocket 查询参数。
- 不需要公网访问时及时停止 Funnel。
