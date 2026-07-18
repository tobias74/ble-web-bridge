# BLE Bridge

BLE Bridge turns local Bluetooth fitness telemetry into a small web API for games and realtime apps.

```text
Fitness BLE devices -> Chrome Web Bluetooth -> BLE Bridge relay -> Roblox HttpService
```

The MVP is anonymous, ephemeral, and RAM-only. There are no accounts, no database, and no permanent workout records.

## Quick Start

Install dependencies:

```bash
npm install
```

Start the relay:

```bash
npm run dev:server
```

Start the browser bridge in another terminal:

```bash
npm run dev:web
```

Start the optional Three.js demo game in a third terminal:

```bash
npm run dev:demo
```

Open the Vite URL, start a session, connect a supported BLE device, stream telemetry, then poll:

```bash
curl http://localhost:8787/v1/sessions/BLUE-4821/latest
```

## Docker

Build and run the single-container deployment:

```bash
docker build -t ble-web-bridge .
docker run --rm -p 8787:8787 ble-web-bridge
```

Or use Compose:

```bash
docker compose up --build
```

The container serves the built bridge UI at `http://localhost:8787/` and keeps relay APIs and WebSockets under `/v1/*`. Localhost works for Web Bluetooth; remote deployments need HTTPS in front of the container.

## Workspace

```text
apps/server     Fastify relay with in-memory sessions
apps/web        React Web Bluetooth bridge
apps/demo-game  Three.js browser demo game
examples/roblox Roblox Lua polling module
docs            Protocol and integration notes
```

## Build-time Profile Plugins

The public build contains only the standard profiles in this repository. Administrators can add independent profile modules at build time by pointing `BLE_BRIDGE_PLUGIN_CONFIG` at an external JSON file:

```json
{
  "apiVersion": 1,
  "plugins": [
    { "module": "./src/example-profile.js" }
  ]
}
```

Module paths resolve relative to the configuration file. Each ES module must export a serializable `manifest` and default-export an adapter that references that manifest and implements `attach(context)`. The manifest declares discovery services, emitted protocols, optional metric priorities, handled command types, and schemas for extension commands. Invalid or duplicate identifiers fail the build. See [docs/plugins.md](docs/plugins.md) for the complete API.

Vite statically bundles the configured modules and writes `ble-plugin-manifest.json` for the relay. The relay only accepts extension commands declared in that generated manifest. Plugin modules execute with the bridge's browser privileges, so only bundle code you trust.

Build without plugins:

```bash
npm run build
```

Build with an external configuration:

```bash
BLE_BRIDGE_PLUGIN_CONFIG=/absolute/path/ble-bridge.plugins.json npm run build
```

## API

```text
POST /v1/sessions
GET  /v1/sessions/:code/latest
POST /v1/sessions/latest
POST /v1/sessions/:code/commands
GET  /v1/health
GET  /v1/demo/power
WS   /v1/sessions/:code/bridge?token=...
```

For simple consumer demos without a BLE device, poll:

```bash
curl http://localhost:8787/v1/demo/power
```

It returns a demo latest-telemetry response with root-level metadata and a root-level `power` value in watts that changes smoothly over time between 130 and 170:

```json
{
  "code": "DEMO-POWER",
  "schemaVersion": 2,
  "connected": true,
  "stale": false,
  "ageMs": 0,
  "expiresAt": 1783007200000,
  "lastBridgeSeenAt": 1783000000000,
  "power": 154
}
```

Session creation returns a human-readable code, a bridge token, an expiry time, and a WebSocket URL for the browser bridge.

Latest telemetry is source-first:

```json
{
  "code": "BLUE-4821",
  "schemaVersion": 2,
  "connected": true,
  "stale": false,
  "ageMs": 127,
  "sources": {
    "dev_1:ftms.indoor_bike": {
      "sourceId": "dev_1:ftms.indoor_bike",
      "protocol": "ftms.indoor_bike",
      "connected": true,
      "values": {
        "speedMps": 6.8,
        "cadenceRpm": 82,
        "powerW": 144
      }
    }
  }
}
```

## Current Scope

- Multi-device BLE telemetry from FTMS, Running Speed/Cadence, Cycling Power, Cycling Speed/Cadence, Heart Rate, Battery, and Device Information services.
- Standalone Three.js demo game that polls source-first telemetry and can optionally send bike grade commands.
- Opt-in FTMS indoor-bike control for grade and resistance.
- Treadmill control commands are blocked and surfaced as browser warnings.
- Chrome/Edge Web Bluetooth.
- One Node.js relay process using in-memory session state.
- Roblox example that polls once per game server/session.

Valkey/Redis storage, hosted auth, and history export are intentionally left for later versions.
