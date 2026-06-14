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

目前 SDC 的部署：

```text
UniFi OS Server: https://127.0.0.1:11443
        ↑ local backend fetch
Dashboard Server: https://uxplay.sdc.nycu.club
        ↑ HTTPS
Raspberry Pi Chromium Kiosk: sdcux
```

實際服務放在 `ui` 伺服器，Node app 只 listen `127.0.0.1:3000`，對外由 Nginx 提供 HTTPS。

## 伺服器環境變數

在 dashboard server 上建立 `.env`：

```bash
UNIFI_BASE_URL=https://127.0.0.1:11443
UNIFI_API_KEY=你的 UniFi API key

# 由 Nginx 反向代理時只 listen localhost
HOST=127.0.0.1
PORT=3000

UNIFI_SITE_ID=
UNIFI_SITE_INTERNAL_REF=default
UNIFI_INSECURE_TLS=true
# 要顯示每台 client 的即時上傳/下載速度，需要啟用 read-only legacy stat/sta fallback。
ENABLE_UNIFI_LEGACY=true
DASHBOARD_POLL_MS=5000
```

如果你不使用 Nginx，想直接讓 Raspberry Pi 連 Node app，才改成：

```bash
HOST=0.0.0.0
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

## Dashboard 伺服器部署（pnpm）

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

下載專案。SDC 目前部署在 `/home/ubuntu/.local/src/unifi-ap-dashboard`；新機器也可以放在 `/opt/unifi-ap-dashboard`：

```bash
sudo mkdir -p /opt/unifi-ap-dashboard
sudo chown "$USER":"$USER" /opt/unifi-ap-dashboard
git clone https://github.com/NYCU-SDC/uxplay-unify-dashboard.git /opt/unifi-ap-dashboard
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

## Nginx / HTTPS 反向代理

如果你想用 `http://dashboard.local` 或 HTTPS，建議讓 app 只 listen localhost：

```bash
HOST=127.0.0.1
PORT=3000
```

`uxplay.sdc.nycu.club` 範例：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name uxplay.sdc.nycu.club;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name uxplay.sdc.nycu.club;

    ssl_certificate /etc/letsencrypt/live/uxplay.sdc.nycu.club/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/uxplay.sdc.nycu.club/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

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

因為 `uxplay.sdc.nycu.club` 目前公開 DNS 指到私有 IP，Let’s Encrypt HTTP-01 不能驗證。要簽正式憑證請使用 DNS-01，例如 Cloudflare plugin：

```bash
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 30 \
  -d uxplay.sdc.nycu.club
```

套用：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Raspberry Pi 自動全螢幕顯示

Raspberry Pi 不需要放 UniFi API key，也不需要跑這個專案。它只要開 Chromium kiosk。

SDC 目前的 Pi 使用 Raspberry Pi OS/labwc，Chromium 指令是 `chromium`。

先測試 Pi 能看到 dashboard：

```bash
curl -I https://uxplay.sdc.nycu.club
```

安裝套件：

```bash
sudo apt update
sudo apt install -y chromium x11-xserver-utils
```

設定開機自動登入桌面：

```bash
sudo raspi-config
```

設定：

- `System Options -> Boot / Auto Login -> Desktop Autologin`
- `Display Options -> Screen Blanking -> No`

建立 Chromium wrapper。這裡刻意使用 `--app` 而不是 `--kiosk`，避免 Chromium 一直壓在 UxPlay 投影畫面上方；同時使用獨立 kiosk profile，避免開機時遇到 Chromium profile locked。`--password-store=basic` 和 `--use-mock-keychain` 是必要的，否則 autologin 後 Chromium 可能會觸發 GNOME Keyring 的「Default Keyring locked」密碼視窗：

```bash
mkdir -p ~/.local/bin
tee ~/.local/bin/sdc-dashboard-kiosk >/dev/null <<'EOF'
#!/bin/sh
set -eu
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
unset GNOME_KEYRING_CONTROL GNOME_KEYRING_PID SSH_AUTH_SOCK

loginctl unlock-session "${XDG_SESSION_ID:-}" 2>/dev/null || true
pkill -x swaylock 2>/dev/null || true
pkill -x gcr-prompter 2>/dev/null || true
wlopm --on '*' 2>/dev/null || true
xset s off -dpms 2>/dev/null || true

profile_dir="${XDG_RUNTIME_DIR:-/tmp}/sdc-dashboard-chromium"
mkdir -p "$profile_dir"
rm -f "$profile_dir/SingletonLock" "$profile_dir/SingletonSocket" "$profile_dir/SingletonCookie" 2>/dev/null || true

exec chromium \
  --user-data-dir="$profile_dir" \
  --password-store=basic \
  --use-mock-keychain \
  --app=https://uxplay.sdc.nycu.club \
  --start-fullscreen \
  --ozone-platform=wayland \
  --force-device-scale-factor=0.85 \
  --no-first-run \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --overscroll-history-navigation=0 \
  --disable-pinch
EOF
chmod +x ~/.local/bin/sdc-dashboard-kiosk
```

讓 Chromium dashboard 永遠在一般視窗底層，AirPlay 投影視窗出現時可以蓋到上面：

```bash
tee ~/.config/labwc/rc.xml >/dev/null <<'EOF'
<?xml version="1.0"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <theme>
    <font place="ActiveWindow"><name>Nunito Sans</name><size>12</size><weight>Light</weight><slant>Normal</slant></font>
    <font place="InactiveWindow"><name>Nunito Sans</name><size>12</size><weight>Light</weight><slant>Normal</slant></font>
    <name>PiXtrix</name>
  </theme>
  <windowRules>
    <windowRule identifier="chromium*" matchOnce="false">
      <action name="ToggleAlwaysOnBottom" />
    </windowRule>
  </windowRules>
</openbox_config>
EOF
```

建立 XDG autostart。Chromium 只從這裡啟動一次，避免 labwc autostart 和 XDG autostart 同時開瀏覽器：

```bash
mkdir -p ~/.config/autostart
tee ~/.config/autostart/sdc-dashboard-kiosk.desktop >/dev/null <<'EOF'
[Desktop Entry]
Type=Application
Name=SDC Dashboard Kiosk
Exec=/home/sdc/.local/bin/sdc-dashboard-kiosk >/tmp/sdc-dashboard-kiosk.log 2>&1
X-GNOME-Autostart-enabled=true
EOF
```

建立 labwc autostart，只負責關閉螢幕鎖定/休眠，不在這裡再啟動 Chromium：

```bash
mkdir -p ~/.config/labwc
tee ~/.config/labwc/autostart >/dev/null <<'EOF'
#!/bin/sh
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

(
  for delay in 0 2 10; do
    sleep "$delay"
    loginctl unlock-session "${XDG_SESSION_ID:-}" 2>/dev/null || true
    pkill -x swaylock 2>/dev/null || true
    wlopm --on '*' 2>/dev/null || true
    xset s off -dpms 2>/dev/null || true
  done
) &
EOF
chmod +x ~/.config/labwc/autostart
```

停用 GNOME Keyring。這台 Pi 是 kiosk，會自動登入，keyring 不會被登入密碼解鎖；如果不關掉，Chromium 或其他 app 可能在開機後跳出 `Unlock Keyring` 視窗：

```bash
mkdir -p ~/.config/autostart
for name in gnome-keyring-pkcs11.desktop gnome-keyring-secrets.desktop gnome-keyring-ssh.desktop; do
  tee ~/.config/autostart/$name >/dev/null <<EOF
[Desktop Entry]
Type=Application
Name=Disabled $name
Hidden=true
EOF
done

systemctl --user disable --now gnome-keyring-daemon.service gnome-keyring-daemon.socket 2>/dev/null || true
systemctl --user mask gnome-keyring-daemon.service gnome-keyring-daemon.socket 2>/dev/null || true
pkill -x gnome-keyring-d 2>/dev/null || true
pkill -x gcr-prompter 2>/dev/null || true
```

讓 kiosk session 裡的 `swaylock` 變成 no-op，並建立常駐 guard，避免開機或閒置後出現 locked/password/keyring 畫面：

```bash
tee ~/.local/bin/swaylock >/dev/null <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x ~/.local/bin/swaylock

mkdir -p ~/.config/systemd/user
tee ~/.config/systemd/user/kiosk-no-lock.service >/dev/null <<'EOF'
[Unit]
Description=Prevent kiosk display lock and keyring prompts
After=default.target

[Service]
Type=simple
ExecStart=/bin/sh -lc 'while :; do uid="$(id -u)"; loginctl list-sessions --no-legend | while read -r sid suid user seat rest; do [ "$suid" = "$uid" ] && [ "$seat" = "seat0" ] && loginctl unlock-session "$sid" 2>/dev/null || true; done; pkill -x swaylock 2>/dev/null || true; pkill -x gcr-prompter 2>/dev/null || true; pkill -x gnome-keyring-d 2>/dev/null || true; wlopm --on "*" 2>/dev/null || true; sleep 5; done'
Restart=always
RestartSec=2

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now kiosk-no-lock.service
```

目前 SDC 的 UxPlay user service 使用這個 command，投影視窗由 `waylandsink` 開 fullscreen：

```ini
ExecStart=/usr/bin/uxplay -p -fs -vs waylandsink -vsync no -as 0 -s 1024x768@60
```

手動測試：

```bash
~/.local/bin/sdc-dashboard-kiosk
```

重開機：

```bash
sudo reboot
```

## Raspberry Pi 測試與除錯

先在 Raspberry Pi 上確認 dashboard server 可以連：

```bash
curl https://uxplay.sdc.nycu.club/api/unifi/health
curl https://uxplay.sdc.nycu.club/api/wallpaper
```

手動啟動 kiosk 測試：

```bash
chromium --app=https://uxplay.sdc.nycu.club --start-fullscreen --ozone-platform=wayland --force-device-scale-factor=0.85
```

常見問題：

- 黑畫面：先確認 Raspberry Pi 可以 `curl` dashboard URL。
- 沒有自動開：確認 `~/.config/autostart/sdc-dashboard-kiosk.desktop` 是否存在。
- 開機出現 `Unlock Keyring`：確認 Chromium wrapper 有 `--password-store=basic` / `--use-mock-keychain`，並確認 `systemctl --user is-enabled gnome-keyring-daemon.service gnome-keyring-daemon.socket` 顯示 `masked`。
- 開機出現 locked/password：確認 `systemctl --user status kiosk-no-lock.service` 是 `active`，並確認 `~/.local/bin/swaylock` 存在。
- 螢幕休眠：確認 `raspi-config` 的 screen blanking 已關閉，也確認 labwc autostart 有 `wlopm --on '*'` 和 `xset s off -dpms`。
- Chromium 顯示壞掉：Raspberry Pi OS Bookworm 可嘗試切回 X11，或檢查 `/tmp/sdc-dashboard-kiosk.log`。

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
