# BLE Bridge Protocol

## Runtime features

Read the public server feature configuration:

```http
GET /v1/config
```

```json
{
  "features": {
    "heartRate": false
  }
}
```

Heart Rate telemetry is disabled unless the server administrator sets `HEART_RATE_ENABLED=true`. When disabled, the browser omits `heartBpm` from both `selected` and every source `values` object. The relay applies the same filter to incoming telemetry before retaining it in memory or returning it to consumers.

## Connection-code lifecycle

The browser creates a readable connection code locally, for example:

```text
SOLAROTTER-482193
```

It stores only that code in localStorage and derives the same-origin bridge WebSocket URL:

```text
ws://localhost:8787/v1/sessions/SOLAROTTER-482193/bridge
```

There is no session-creation request, separate bridge token, server-side expiry, database, or file persistence. Opening the bridge WebSocket creates an in-memory runtime channel. A browser that reconnects after a relay restart recreates the channel with the same locally stored code. Runtime state disappears after the idle limit, while the browser keeps its code until the user regenerates it.

The code is a bearer key: a target application that knows it can read current telemetry and submit supported commands. Browser-side trainer-control permissions, capability checks, value clamping, payload validation, and rate limits still apply. Regenerating the code invalidates future access through the old code once its runtime channel disconnects or expires. The application logger redacts connection-code path segments.

## Browser Bridge WebSocket

Connect:

```text
WS /v1/sessions/:code/bridge
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
      "deviceName": "Example Trainer",
      "protocol": "ftms.indoor_bike",
      "value": 144,
      "timestampMs": 1783000000000
    }
  },
  "sources": {
    "dev_1:ftms.indoor_bike": {
      "sourceId": "dev_1:ftms.indoor_bike",
      "deviceId": "dev_1",
      "deviceName": "Example Trainer",
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
        "manufacturerName": "Example Manufacturer",
        "modelNumber": "EXAMPLE TRAINER"
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
{ "type": "ready", "code": "SOLAROTTER-482193" }
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
  "code": "SOLAROTTER-482193",
  "schemaVersion": 2,
  "connected": true,
  "stale": false,
  "ageMs": 127,
  "lastBridgeSeenAt": 1783000000000,
  "selected": {
    "powerW": {
      "sourceId": "dev_1:ftms.indoor_bike",
      "deviceId": "dev_1",
      "deviceName": "Example Trainer",
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
      "deviceName": "Example Trainer",
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

Metric fields are not returned directly at the session top level. Consumers that need all device telemetry should read `sources[sourceId].values`. Consumers that only need the browser-selected primary value can read `selected[metricName].value`. Metrics disabled in the source dropdown and browser-disabled primary metric sources stay present in `sources` but are excluded from `selected`.

Unknown runtime channels return:

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
  "codes": ["FRESHFALCON-240512", "SOLAROTTER-482193", "RAPIDRIVER-991042"]
}
```

Response:

```json
{
  "now": 1783000000000,
  "sessions": {
    "FRESHFALCON-240512": {
      "code": "FRESHFALCON-240512",
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
    "SOLAROTTER-482193": {
      "code": "SOLAROTTER-482193",
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

Built-in FTMS trainer commands:

```json
{ "type": "bike.targetSpeed", "targetSpeedMps": 8.33, "ttlMs": 3000 }
{ "type": "bike.inclination", "inclinePct": 4.5, "ttlMs": 3000 }
{ "type": "bike.grade", "gradePct": 4.5, "windSpeedMps": 0, "rollingResistanceCoefficient": 0.004, "windResistanceCoefficientKgM": 0.51, "ttlMs": 3000 }
{ "type": "bike.resistance", "resistanceLevel": 35, "ttlMs": 3000 }
{ "type": "bike.targetPower", "targetPowerW": 250, "ttlMs": 3000 }
{ "type": "bike.targetHeartRate", "targetHeartBpm": 150, "ttlMs": 3000 }
{ "type": "bike.targetEnergy", "targetEnergyKcal": 500, "ttlMs": 3000 }
{ "type": "bike.targetSteps", "targetSteps": 5000, "ttlMs": 3000 }
{ "type": "bike.targetStrides", "targetStrides": 2500, "ttlMs": 3000 }
{ "type": "bike.targetDistance", "targetDistanceM": 20000, "ttlMs": 3000 }
{ "type": "bike.targetTrainingTime", "targetTrainingTimeS": 3600, "ttlMs": 3000 }
{ "type": "bike.targetTimeTwoHeartRateZones", "zoneTimesS": [900, 900], "ttlMs": 3000 }
{ "type": "bike.targetTimeThreeHeartRateZones", "zoneTimesS": [600, 600, 600], "ttlMs": 3000 }
{ "type": "bike.targetTimeFiveHeartRateZones", "zoneTimesS": [360, 360, 360, 360, 360], "ttlMs": 3000 }
{ "type": "bike.wheelCircumference", "wheelCircumferenceMm": 2105, "ttlMs": 3000 }
{ "type": "bike.spinDown", "spinDownAction": "start", "ttlMs": 3000 }
{ "type": "bike.targetCadence", "targetCadenceRpm": 90, "ttlMs": 3000 }
```

The bridge reads the FTMS Fitness Machine Feature characteristic and exposes only the target-setting procedures advertised by the connected indoor bike. It also reads the standard speed, inclination, resistance, power, and heart-rate ranges and clamps writes to the trainer's advertised range. FTMS Request Control and Start/Resume are handled automatically before a target is written. Reset and Stop/Pause are session procedures rather than target-setting values and are not exposed as relay permissions.

When more than one connected GATT protocol can receive control commands, the browser presents each device/protocol pair as a distinct control target. Commands are written only to the selected target, and unsupported commands are blocked instead of being redirected to another connected trainer.

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
429 unknown_code_rate_limited
```

Safety rules:

```text
Trainer writes require browser-side "Enable trainer control".
Turning off the master permission blocks trainer control and greys out every individual command permission without discarding the selection.
Turning the master permission back on restores the previous individual selection. Individual commands can be enabled or disabled selectively while trainer control is active.
The control panel shows the most recently received value and its processing status for each supported command.
Browser remote-control permission choices are persisted in localStorage.
FTMS indoor bikes can receive all 17 target-setting procedures advertised in their Fitness Machine Feature characteristic.
For compatibility, an indoor bike with a writable FTMS Control Point but an empty or unreadable Target Setting Features field retains the established simulation and resistance controls.
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

- Connection-code format: one of 2,048 readable word combinations plus six decimal digits (about 31 bits).
- Runtime-channel idle expiry: 60 seconds without bridge telemetry; the browser-owned code does not expire.
- Stale telemetry: latest sample older than 10 seconds.
- Browser telemetry rate: 10 messages per second.
- Device command rate: 2 commands per second.
- Unknown-code lookups: 60 per client and 600 globally per minute.
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
