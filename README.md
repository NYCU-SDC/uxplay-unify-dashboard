# SDC UniFi Office Dashboard

這是一個 BambooFox / SDC 共用社辦投影機待機首頁使用的 UniFi 儀表板。

畫面會顯示：

- Wi-Fi Username/Password：`BambooFox`
- AirPlay 螢幕投影：`UxPlay@SDC`
- UniFi AP / clients / throughput 狀態
- 每分鐘自動更換一張狐狸桌布
- 按 `Space` 可以立刻換桌布

瀏覽器不會直接呼叫 UniFi，也不會拿到 `UNIFI_API_KEY`。所有 UniFi API 呼叫都在 Node/Express backend 裡完成。

## 部署架構

建議分成兩台機器：

- Dashboard server：跑這個專案，負責提供網頁和 `/api/*`。
- Raspberry Pi：只負責開機後全螢幕打開 dashboard URL。

範例：

```text
UniFi Controller / UniFi OS
        ↑
Dashboard Server: http://10.1.253.10:3000
        ↑
Raspberry Pi Chromium Kiosk
```

## 伺服器環境變數

在 dashboard server 上建立 `.env`：

```bash
UNIFI_BASE_URL=https://ui.sdc.nycu.club
UNIFI_API_KEY=你的 UniFi API key

# 直接給區網內的 Raspberry Pi 連線時用 0.0.0.0
HOST=0.0.0.0
PORT=3000

UNIFI_SITE_ID=
UNIFI_SITE_INTERNAL_REF=default
UNIFI_INSECURE_TLS=true
ENABLE_UNIFI_LEGACY=false
DASHBOARD_POLL_MS=5000
```

如果你會用 Nginx / Caddy / Cloudflare Tunnel 反向代理，`HOST` 可以改成：

```bash
HOST=127.0.0.1
PORT=3000
```

## 建立 UniFi API Key

在 UniFi Network 裡建立 API key：

```text
UniFi Network -> Settings / Control Plane -> Integrations -> Create API Key
```

測試 API key：

```bash
curl -k -H "X-API-KEY: $UNIFI_API_KEY" -H "Accept: application/json" \
  "$UNIFI_BASE_URL/proxy/network/integration/v1/info"
```

測試 sites：

```bash
curl -k -H "X-API-KEY: $UNIFI_API_KEY" -H "Accept: application/json" \
  "$UNIFI_BASE_URL/proxy/network/integration/v1/sites"
```

## Dashboard 伺服器部署

以下以 Debian / Ubuntu server 為例。

安裝基本套件：

```bash
sudo apt update
sudo apt install -y git curl
```

安裝 Node.js 22 LTS 或更新版本，然後啟用 pnpm：

```bash
corepack enable
corepack prepare pnpm@11.4.0 --activate
pnpm --version
```

下載專案：

```bash
sudo mkdir -p /opt/unifi-ap-dashboard
sudo chown "$USER":"$USER" /opt/unifi-ap-dashboard
git clone https://github.com/NYCU-SDC/uxplay-unify-dashboard /opt/unifi-ap-dashboard
cd /opt/unifi-ap-dashboard
```

安裝與 build：

```bash
pnpm install --frozen-lockfile
cp .env.example .env
nano .env
pnpm build
```

先手動測試：

```bash
pnpm start
```

另一個 terminal 測：

```bash
curl http://127.0.0.1:3000/api/unifi/health
curl http://127.0.0.1:3000/api/wallpaper
```

如果 `HOST=0.0.0.0`，從 Raspberry Pi 或其他電腦測：

```bash
curl http://<dashboard-server-ip>:3000/api/unifi/health
```

## Dashboard 伺服器 systemd

建立 systemd service：

```bash
sudo tee /etc/systemd/system/unifi-dashboard.service >/dev/null <<'EOF'
[Unit]
Description=SDC UniFi office dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/opt/unifi-ap-dashboard
Environment=NODE_ENV=production
Environment=PATH=/home/YOUR_USER/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/env pnpm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

把 `YOUR_USER` 換成實際部署帳號，例如 `em` 或 `dashboard`。

啟用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now unifi-dashboard.service
systemctl status unifi-dashboard.service
```

看 log：

```bash
journalctl -u unifi-dashboard.service -f
```

## 可選：Nginx 反向代理

如果你想用 `http://dashboard.local` 或 HTTPS，建議讓 app 只 listen localhost：

```bash
HOST=127.0.0.1
PORT=3000
```

Nginx 範例：

```nginx
server {
    listen 80;
    server_name dashboard.local;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

套用：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Raspberry Pi 自動全螢幕顯示

Raspberry Pi 不需要放 UniFi API key，也不需要跑這個專案。它只要開 Chromium kiosk。

安裝套件：

```bash
sudo apt update
sudo apt install -y chromium-browser unclutter x11-xserver-utils
```

如果你的系統套件名稱是 `chromium`：

```bash
sudo apt install -y chromium
```

確認 Chromium 指令：

```bash
command -v chromium-browser || command -v chromium
```

設定開機自動登入桌面：

```bash
sudo raspi-config
```

設定：

- `System Options -> Boot / Auto Login -> Desktop Autologin`
- `Display Options -> Screen Blanking -> No`
- 如果 kiosk 顯示有問題，改用 `Advanced Options -> Wayland -> X11`

建立 Chromium kiosk autostart：

```bash
mkdir -p ~/.config/autostart
tee ~/.config/autostart/sdc-dashboard-kiosk.desktop >/dev/null <<'EOF'
[Desktop Entry]
Type=Application
Name=SDC Dashboard Kiosk
Exec=sh -lc 'xset s off -dpms; unclutter -idle 0.5 -root & chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --overscroll-history-navigation=0 http://<dashboard-server-ip>:3000'
X-GNOME-Autostart-enabled=true
EOF
```

把這段 URL 換成你的 dashboard server：

```text
http://<dashboard-server-ip>:3000
```

如果你用 Nginx / domain：

```text
http://dashboard.local
https://dashboard.example.com
```

如果你的 Chromium 指令是 `chromium` 而不是 `chromium-browser`，把 autostart 裡的 `chromium-browser` 改成 `chromium`。

重開機：

```bash
sudo reboot
```

## Raspberry Pi 測試與除錯

先在 Raspberry Pi 上確認 dashboard server 可以連：

```bash
curl http://<dashboard-server-ip>:3000/api/unifi/health
curl http://<dashboard-server-ip>:3000/api/wallpaper
```

手動啟動 kiosk 測試：

```bash
chromium-browser --kiosk http://<dashboard-server-ip>:3000
```

常見問題：

- 黑畫面：先確認 Raspberry Pi 可以 `curl` dashboard URL。
- 沒有自動開：確認 `~/.config/autostart/sdc-dashboard-kiosk.desktop` 是否存在。
- 螢幕休眠：確認 `raspi-config` 的 screen blanking 已關閉，也確認 autostart 有 `xset s off -dpms`。
- Chromium 顯示壞掉：Raspberry Pi OS Bookworm 可嘗試切回 X11。

## 本機開發

```bash
pnpm install
cp .env.example .env
nano .env
pnpm dev
```

開啟：

```text
http://127.0.0.1:3000
```

## 安全注意事項

- `UNIFI_API_KEY` 只放在 dashboard server 的 `.env`。
- Raspberry Pi 不需要 `.env`，也不需要 API key。
- 瀏覽器只會呼叫 dashboard server 的 `/api/unifi/dashboard` 和 `/api/wallpaper`。
- 如果 dashboard URL 會暴露到公開網路，請務必加 VPN、Zero Trust、HTTP auth 或其他存取控制。

## 故障排除

- UniFi OS Server 通常是 `https://<host>:11443`
- UniFi OS Console / Gateway 常見是 `https://<host>`
- Legacy Network Application 常見是 `https://<host>:8443`
- 先測 `/proxy/network/integration/v1/info`
- 如果 clients 欄位不完整，dashboard 會盡量顯示已有資料並繼續運作。
