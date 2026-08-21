# BLE Bridge

BLE Bridge turns local Bluetooth fitness telemetry into a small web API for games and realtime apps.

```text
Fitness BLE devices -> Chrome Web Bluetooth -> BLE Bridge relay -> Roblox HttpService
```

The MVP is anonymous and has no database or permanent workout records. The browser keeps its connection code in localStorage; the relay keeps only active routing channels and latest telemetry in RAM.

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

Open the Vite URL and connect a supported BLE device. The browser creates and remembers a readable connection code, opens the relay channel, and starts streaming telemetry. Enter that code in the target application, or poll it directly:

```bash
curl http://localhost:8787/v1/sessions/SOLAROTTER-482193/latest
```

The web app calls relative `/v1/*` paths exclusively, so HTTP and WebSocket traffic uses the same origin as the page. During local development, Vite proxies `/v1` traffic to the relay on `http://localhost:8787`. Production serves the frontend and relay from the same Node process, avoiding browser CORS configuration and client-controlled relay destinations.

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

Heart Rate telemetry is disabled by default. A server administrator can enable it explicitly:

```bash
HEART_RATE_ENABLED=true docker compose up --build
```

When disabled, the browser still indicates that Heart Rate is available from a connected GATT device, but keeps the measurement disabled and does not transmit its value. The relay also removes `heartBpm` from incoming telemetry as a server-side safeguard.

The container serves the built bridge UI at `http://localhost:8787/` and keeps relay APIs and WebSockets under `/v1/*`. Localhost works for Web Bluetooth; remote deployments need HTTPS in front of the container.

## Tests

Run the internal Node.js unit and integration tests for the relay, web app, GATT parsers, settings, plugins, and demo game:

```bash
npm run test:unit
```

Run the Cypress end-to-end tests in the pinned headless Cypress container:

```bash
npm run test:e2e
```

The E2E suite starts an isolated Vite server and mocks only browser-owned boundaries such as Web Bluetooth and WebSocket. The real React UI, connection-code generation, GATT parsers, source-selection logic, storage behavior, and command processing run unchanged. The temporary Compose project is removed automatically when the run finishes.

On a workstation with Cypress' native Linux dependencies installed, use `npm run test:e2e:local`. Run all test levels with:

```bash
npm run test:all
```

## Workspace

```text
apps/server     Fastify relay with in-memory runtime channels
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
GET  /v1/sessions/:code/latest
POST /v1/sessions/latest
POST /v1/sessions/:code/commands
GET  /v1/config
GET  /v1/health
GET  /v1/demo/power
WS   /v1/sessions/:code/bridge
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
  "lastBridgeSeenAt": 1783000000000,
  "power": 154
}
```

The browser generates a connection code such as `SOLAROTTER-482193`, stores only that code locally, and derives the same-origin WebSocket URL from it. The code is the bearer key shared with the target application; there is no separate bridge token.

Opening the bridge WebSocket creates the runtime channel if it does not exist. After a relay restart, the connected browser retries the same code and recreates that channel automatically. Disconnecting the last BLE device closes the WebSocket, while the browser retains the code until the user explicitly regenerates it.

Latest telemetry is source-first:

```json
{
  "code": "SOLAROTTER-482193",
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

- Multi-device BLE telemetry from FTMS, Running Speed/Cadence, Cycling Power, Cycling Speed/Cadence, Battery, and Device Information services, with administrator-enabled Heart Rate telemetry.
- Standalone Three.js demo game that polls source-first telemetry and can optionally send bike grade commands.
- Opt-in FTMS indoor-bike control for grade and resistance.
- Treadmill control commands are blocked and surfaced as browser warnings.
- Chrome/Edge Web Bluetooth.
- One Node.js relay process using non-persistent in-memory runtime channels.
- Roblox example that polls once per game server/session.

Durable server storage, a stronger pairing handshake, hosted auth, and history export are intentionally left for later versions.
