# Roblox Integration

Roblox experiences should poll the relay from server-side scripts with `HttpService`.

Published experiences need a public HTTPS relay URL. For Studio testing, use a tunnel such as `cloudflared tunnel` or `ngrok` if Roblox cannot reach your local machine directly.

## Module Usage

Place `examples/roblox/BleBridge.lua` in `ServerScriptService` or another server-side module location.

```lua
local BleBridge = require(script.Parent.BleBridge)

local bridge = BleBridge.new({
	baseUrl = "https://your-relay.example.com",
	sessionCode = "BLUE-4821",
	pollInterval = 1,
})

bridge:OnTelemetry(function(telemetry, errorCode)
	if errorCode then
		warn("BLE Bridge:", errorCode)
		return
	end

	local power = bridge:GetValue("powerW", { "ftms.indoor_bike", "cycling_power" })
	local cadence = bridge:GetValue("cadenceRpm", { "ftms.indoor_bike", "cycling_power", "cycling_speed_cadence" })
	print("Power", power, "Cadence", cadence)
end)

bridge:Start()
```

Use one bridge instance per Roblox game server/session. Broadcast the values inside Roblox with your own `RemoteEvent` if clients need local UI updates.

Latest telemetry is source-first. The module exposes helpers:

```lua
local sources = bridge:GetSources()
local source = bridge:FindSourceByProtocol("heart_rate")
local heartBpm = bridge:GetValue("heartBpm", { "heart_rate" })
```

`GetValue(metricName, preferredProtocols)` searches connected sources in preference order, then falls back to any connected source with that metric.

If one Roblox server tracks multiple BLE sessions, prefer `POST /v1/sessions/latest` once per second with all active session codes instead of one HTTP request per player.

## Bike Commands

The Roblox module can send bike grade or resistance commands:

```lua
local response, errorCode = bridge:SetBikeGrade(4.5)
local response, errorCode = bridge:SetBikeResistance(35)
```

The browser bridge must be connected, the user must enable `Allow remote control`, and the grade/resistance permission toggles must remain enabled. The connected device must support FTMS bike control or a configured profile plugin that handles the command. Treadmill speed and incline commands are intentionally not exposed by the Roblox helper and are blocked by the web bridge if sent manually.

## HttpService

Enable HTTP requests for the experience before running the example. The module handles request failures, missing sessions, stale telemetry, and malformed JSON by passing an error code to the callback.
