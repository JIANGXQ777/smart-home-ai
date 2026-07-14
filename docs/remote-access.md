# Remote access

The project uses Tailscale Funnel for a free, stable public HTTPS address while preserving direct LAN access:

Public address: `https://smart-home-ai.tail29b726.ts.net`

```text
Internet -> Tailscale Funnel -> authenticated gateway on 127.0.0.1:5001 -> Docker app on 127.0.0.1:5003
LAN device or ESP32 -> host port 5000 -> Docker app on 127.0.0.1:5003
```

Start both public and LAN access from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-public-access.ps1
```

Stop the public Funnel and gateway:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/stop-public-access.ps1
```

The console login credentials and session secret are stored in the ignored `.env` file:

```env
APP_AUTH_USERNAME=admin
APP_AUTH_PASSWORD=use-a-random-password-at-least-16-characters
APP_SESSION_SECRET=use-a-random-secret-at-least-32-characters
DOCKER_BIND_ADDRESS=127.0.0.1
DOCKER_HOST_PORT=5003
PUBLIC_GATEWAY_TARGET_PORT=5003
LAN_GATEWAY_HOST=0.0.0.0
LAN_GATEWAY_PORT=5000
```

Tailscale runs as a Windows service and keeps the stable `*.ts.net` hostname. The Funnel feature must be enabled once by the tailnet administrator.

The Vue console provides the login screen, session persistence, logout action, and backend API protection. ESP32 WebSocket authentication continues to use `ESP32_WS_TOKEN` separately.

When Docker Hub is unavailable and dependencies have not changed, rebuild from the existing local image after `npm run build`:

```powershell
docker build --pull=false -f Dockerfile.local -t smart-home-ai-smart-home-ai:latest .
```
