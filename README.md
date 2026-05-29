# UniFi Office Dashboard

A local Next.js dashboard for an office monitor in Chromium kiosk mode. The browser only polls this app's backend route; UniFi API calls and the API key stay on the server.

## Environment

Create a UniFi API key in:

```text
UniFi Network -> Settings / Control Plane -> Integrations -> Create API Key
```

Example `.env.local`:

```bash
UNIFI_BASE_URL=https://ui.sdc.nycu.club
# Common alternatives:
# UNIFI_BASE_URL=https://10.1.0.1:11443
# UNIFI_BASE_URL=https://10.1.0.1
# UNIFI_BASE_URL=https://10.1.0.1:8443
UNIFI_API_KEY=...
UNIFI_INSECURE_TLS=true
DASHBOARD_POLL_MS=5000
```

Optional:

```bash
UNIFI_SITE_ID=
UNIFI_SITE_INTERNAL_REF=default
ENABLE_UNIFI_LEGACY=false
```

## Test UniFi Access

```bash
curl -k -H "X-API-KEY: $UNIFI_API_KEY" -H "Accept: application/json" \
  "$UNIFI_BASE_URL/proxy/network/integration/v1/sites"
```

Also useful:

```bash
curl -k -H "X-API-KEY: $UNIFI_API_KEY" -H "Accept: application/json" \
  "$UNIFI_BASE_URL/proxy/network/integration/v1/info"
```

## Run

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Health endpoint:

```text
http://localhost:3000/api/unifi/health
```

Dashboard endpoint:

```text
http://localhost:3000/api/unifi/dashboard
```

## Kiosk

```bash
chromium --kiosk http://localhost:3000
```

## Security

Do not expose `UNIFI_API_KEY` to the browser. Keep all UniFi API calls in Next.js route handlers under `app/api/unifi/*`. The frontend polls `/api/unifi/dashboard` every 5 seconds and receives normalized data only.

## Troubleshooting

- Try ports `11443`, `443`, and `8443`.
- Check `/proxy/network/integration/v1/info`.
- Confirm the API key has access in UniFi Network Integrations.
- Check UniFi Network -> Integrations docs for version-specific endpoint details.
- If clients are missing, the dashboard will show a warning and continue; some UniFi versions return incomplete client fields.
