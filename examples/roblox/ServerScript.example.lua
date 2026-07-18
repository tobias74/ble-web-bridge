local BleBridge = require(script.Parent.BleBridge)

local bridge = BleBridge.new({
	baseUrl = "https://your-relay.example.com",
	sessionCode = "BLUE-4821",
	pollInterval = 1,
})

bridge:OnTelemetry(function(telemetry, errorCode)
	if errorCode then
		warn("BLE Bridge error:", errorCode)
		return
	end

	if telemetry.connected and not telemetry.stale then
		local power = bridge:GetValue("powerW", { "ftms.indoor_bike", "cycling_power" })
		local cadence = bridge:GetValue("cadenceRpm", { "ftms.indoor_bike", "cycling_power", "cycling_speed_cadence" })
		print("Power", power, "Cadence", cadence)
	end
end)

bridge:Start()

-- Example: apply a hill grade from server-side game logic.
-- local response, errorCode = bridge:SetBikeGrade(4.5)
-- if errorCode then
-- 	warn("BLE Bridge command error:", errorCode)
-- end
