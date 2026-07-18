# BLE Bridge Protocol

## Session Lifecycle

Create a session:

```http
POST /v1/sessions
```

Response:

```json
{
  "code": "BLUE-4821",
  "bridgeToken": "secret-token",
  "expiresAt": 1783000000000,
  "bridgeWsUrl": "ws://localhost:8787/v1/sessions/BLUE-4821/bridge?token=secret-token"
}
```

The code is user-facing. The bridge token is secret and belongs only to the browser bridge.

## Browser Bridge WebSocket

Connect:

```text
WS /v1/sessions/:code/bridge?token=...
```

Send source-first telemetry as JSON:

```json
{
  "schemaVersion": 2,
  "timestampMs": 1783000000000,
  "selected": {
    "powerW": {
      "sourceId": "dev_1:ftms.indoor_bike",
      "deviceId": "dev_1",
      "deviceName": "Kickr Bike",
      "protocol": "ftms.indoor_bike",
      "value": 144,
      "timestampMs": 1783000000000
    }
  },
  "sources": {
    "dev_1:ftms.indoor_bike": {
      "sourceId": "dev_1:ftms.indoor_bike",
      "deviceId": "dev_1",
      "deviceName": "Kickr Bike",
      "protocol": "ftms.indoor_bike",
      "connected": true,
      "timestampMs": 1783000000000,
      "values": {
        "speedMps": 6.8,
        "cadenceRpm": 82,
        "powerW": 144,
        "distanceM": 1240,
        "heartBpm": 153
      },
      "info": {
        "batteryPct": 87,
        "manufacturerName": "Wahoo",
        "modelNumber": "KICKR BIKE"
      },
      "raw": {
        "flags": 576
      }
    }
  }
}
```

Server messages:

```json
{ "type": "ready", "code": "BLUE-4821", "expiresAt": 1783000000000 }
{ "type": "ack", "timestampMs": 1783000000000 }
{ "type": "command", "command": { "commandId": "cmd_abc", "type": "bike.grade", "gradePct": 4.5 } }
{ "type": "error", "error": "rate_limited" }
```

## Latest Telemetry

Read latest state:

```http
GET /v1/sessions/:code/latest
```

Responses are source-first for all consumers:

```json
{
  "code": "BLUE-4821",
  "schemaVersion": 2,
  "connected": true,
  "stale": false,
  "ageMs": 127,
  "expiresAt": 1783007200000,
  "lastBridgeSeenAt": 1783000000000,
  "selected": {
    "powerW": {
      "sourceId": "dev_1:ftms.indoor_bike",
      "deviceId": "dev_1",
      "deviceName": "Kickr Bike",
      "protocol": "ftms.indoor_bike",
      "value": 144,
      "timestampMs": 1783000000000,
      "connected": true,
      "stale": false,
      "ageMs": 127
    }
  },
  "sources": {
    "dev_1:ftms.indoor_bike": {
      "sourceId": "dev_1:ftms.indoor_bike",
      "deviceId": "dev_1",
      "deviceName": "Kickr Bike",
      "protocol": "ftms.indoor_bike",
      "connected": true,
      "stale": false,
      "ageMs": 127,
      "timestampMs": 1783000000000,
      "values": {
        "powerW": 144,
        "cadenceRpm": 82
      }
    }
  }
}
```

Metric fields are not returned directly at the session top level. Consumers that need all device telemetry should read `sources[sourceId].values`. Consumers that only need the browser-selected primary value can read `selected[metricName].value`. Browser-disabled primary metric sources stay present in `sources` but are excluded from `selected`.

Unknown sessions return:

```json
{ "error": "session_not_found" }
```

## Batch Latest Telemetry

Read multiple session states with one request:

```http
POST /v1/sessions/latest
Content-Type: application/json
```

Request:

```json
{
  "codes": ["FLOW-2405", "BLUE-4821", "RIDE-9910"]
}
```

Response:

```json
{
  "now": 1783000000000,
  "sessions": {
    "FLOW-2405": {
      "code": "FLOW-2405",
      "schemaVersion": 2,
      "connected": true,
      "stale": false,
      "sources": {
        "dev_1:cycling_power": {
          "sourceId": "dev_1:cycling_power",
          "protocol": "cycling_power",
          "connected": true,
          "stale": false,
          "values": {
            "powerW": 144,
            "cadenceRpm": 82
          }
        }
      }
    },
    "BLUE-4821": {
      "code": "BLUE-4821",
      "error": "session_not_found"
    }
  }
}
```

The server normalizes codes to uppercase, deduplicates repeated codes, and returns per-session errors instead of failing the whole request.

## Demo Power Reading

Read a simple synthetic power value for consumer-client demos:

```http
GET /v1/demo/power
```

The response keeps the latest-telemetry root metadata, omits `selected` and `sources`, and exposes a root-level `power` value measured in watts. `power` changes smoothly over time between 130 and 170:

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

## Device Commands

Send a command through the browser bridge:

```http
POST /v1/sessions/:code/commands
Content-Type: application/json
```

Bike commands:

```json
{ "type": "bike.grade", "gradePct": 4.5, "rollingResistanceCoefficient": 0.004, "ttlMs": 3000 }
```

```json
{ "type": "bike.resistance", "resistanceLevel": 35, "ttlMs": 3000 }
```

Profiles configured at build time may add support for target power:

```json
{ "type": "bike.targetPower", "targetPowerW": 250, "ttlMs": 3000 }
```

The command endpoint is fire-and-forget. It returns after the relay successfully sends the command to the connected browser bridge:

```json
{
  "commandId": "cmd_abc",
  "type": "bike.grade",
  "status": "sent"
}
```

Treadmill command types are accepted only so the browser can warn and block locally:

```json
{ "type": "treadmill.speed", "speedMps": 3.0, "ttlMs": 3000 }
{ "type": "treadmill.incline", "inclinePct": 5, "ttlMs": 3000 }
```

The HTTP response for these is still `sent` if a browser bridge is connected. The browser shows a yellow warning and never writes treadmill values to BLE. The relay does not wait for a browser result or device-level confirmation.

Command HTTP errors:

```text
404 session_not_found
409 bridge_not_connected
400 invalid_command
429 command_rate_limited
```

Safety rules:

```text
Bike writes require browser-side "Allow remote control".
Each bike command family also requires its matching browser-side permission toggle.
Grade and resistance toggles default on, but the master permission defaults off.
Advanced plugin-provided toggles default off until explicitly enabled by the user.
Browser remote-control permission choices are persisted in localStorage.
FTMS indoor bikes can receive grade/resistance writes.
Configured profile plugins can add device-specific command handling.
Unsupported plugin capabilities are blocked locally as capability_not_supported.
Treadmill speed and incline are never written to the device.
Cycling Power, Cycling Speed/Cadence, and Heart Rate devices are read-only.
Running Speed/Cadence, Battery, and Device Information devices are read-only.
```

## Browser BLE Protocols

The browser bridge currently supports telemetry or metadata from:

```text
FTMS Fitness Machine Service
Running Speed and Cadence Service
Cycling Power Service
Cycling Speed and Cadence Service
Heart Rate Service
Battery Service
Device Information Service
```

Each telemetry characteristic becomes one source. Battery and Device Information are attached as `info` metadata on sources from the same BLE device.

## Build-time Profile Plugins

Set `BLE_BRIDGE_PLUGIN_CONFIG` to an external JSON file when running the web build. The configuration lists ES modules that implement additional BLE profiles. Modules are validated and statically bundled; an ordinary build with no configuration contains only the profiles listed above.

Plugin modules execute with the same browser privileges as the bridge. Only configure modules you trust. See the repository README for the manifest and adapter contract.

## Limits

- Session TTL: 2 hours.
- Idle expiry: 60 seconds without bridge telemetry.
- Stale telemetry: latest sample older than 10 seconds.
- Browser telemetry rate: 10 messages per second.
- Device command rate: 2 commands per second.
- Batch latest request: 50 session codes.
- Payload size: 4 KB.
- Recommended Roblox polling: 1 request per second per game server, using the batch endpoint when more than one session is active.

## Source Fields

Source envelope fields:

```text
sourceId
deviceId
deviceName
protocol
connected
timestampMs
values
info
raw
```

Supported `values` include:

```text
speedMps
averageSpeedMps
cadenceRpm
cadenceSpm
powerW
averagePowerW
distanceM
gradePct
inclinePct
rampAngleDeg
heartBpm
strideLengthM
strideCount
strokeRateSpm
averageStrokeRateSpm
strokeCount
paceSecondsPer500m
averagePaceSecondsPer500m
resistanceLevel
targetPowerW
rollingResistanceCoefficient
windResistanceCoefficient
windSpeedKmH
draftingFactor
totalEnergyKcal
energyPerHourKcal
energyPerMinuteKcal
metabolicEquivalent
elapsedTimeS
remainingTimeS
stepsPerMinute
averageStepRateSpm
stepCount
floors
elevationGainM
```

Supported `info` fields include `batteryPct`, `manufacturerId`, `manufacturerName`, `modelNumber`, `firmwareRevision`, `hardwareRevision`, `softwareRevision`, `supportsBasicResistance`, `supportsSimulation`, `supportsTargetPower`, `maxResistanceN`, `userWeightKg`, `bicycleWeightKg`, `bicycleWheelDiameterM`, `bicycleWheelDiameterOffsetMm`, `gearRatio`, `isokineticMode`, `isokineticSpeedKmh`, `roadFeelId`, `roadFeelIntensity`, and `hasRoadFeel`. The browser does not read or expose serial numbers.

The relay stores only the latest valid source envelope. It does not persist history.
