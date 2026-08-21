local HttpService = game:GetService("HttpService")

local BleBridge = {}
BleBridge.__index = BleBridge

function BleBridge.new(config)
	assert(config, "BleBridge.new requires a config table")
	assert(config.sessionCode, "BleBridge.new requires sessionCode")

	local self = setmetatable({}, BleBridge)
	self.baseUrl = stripTrailingSlash(config.baseUrl or "http://localhost:8787")
	self.sessionCode = config.sessionCode
	self.pollInterval = config.pollInterval or 1
	self.running = false
	self.latest = nil
	self._event = Instance.new("BindableEvent")

	return self
end

function BleBridge:Start()
	if self.running then
		return
	end

	self.running = true
	task.spawn(function()
		while self.running do
			self:_pollOnce()
			task.wait(self.pollInterval)
		end
	end)
end

function BleBridge:Stop()
	self.running = false
end

function BleBridge:Destroy()
	self:Stop()
	self._event:Destroy()
end

function BleBridge:OnTelemetry(callback)
	local connection = self._event.Event:Connect(callback)

	return function()
		connection:Disconnect()
	end
end

function BleBridge:GetLatest()
	return self.latest
end

function BleBridge:GetSources()
	if not self.latest or type(self.latest.sources) ~= "table" then
		return {}
	end

	return self.latest.sources
end

function BleBridge:GetSource(sourceId)
	return self:GetSources()[sourceId]
end

function BleBridge:FindSourceByProtocol(protocol)
	for _, source in pairs(self:GetSources()) do
		if source.protocol == protocol then
			return source
		end
	end

	return nil
end

function BleBridge:GetValue(metricName, preferredProtocols)
	local sources = self:GetSources()

	if type(preferredProtocols) == "table" then
		for _, protocol in ipairs(preferredProtocols) do
			for _, source in pairs(sources) do
				if source.protocol == protocol and source.connected ~= false and type(source.values) == "table" and source.values[metricName] ~= nil then
					return source.values[metricName], source
				end
			end
		end
	end

	for _, source in pairs(sources) do
		if source.connected ~= false and type(source.values) == "table" and source.values[metricName] ~= nil then
			return source.values[metricName], source
		end
	end

	return nil, nil
end

function BleBridge:SetBikeGrade(gradePct, ttlMs)
	return self:_sendCommand({
		type = "bike.grade",
		gradePct = gradePct,
		ttlMs = ttlMs or 3000,
	})
end

function BleBridge:SetBikeResistance(resistanceLevel, ttlMs)
	return self:_sendCommand({
		type = "bike.resistance",
		resistanceLevel = resistanceLevel,
		ttlMs = ttlMs or 3000,
	})
end

function BleBridge:_pollOnce()
	local url = string.format(
		"%s/v1/sessions/%s/latest",
		self.baseUrl,
		HttpService:UrlEncode(self.sessionCode)
	)

	local ok, body = pcall(function()
		return HttpService:GetAsync(url, false)
	end)

	if not ok then
		self._event:Fire(nil, "request_failed")
		return
	end

	local decoded
	local decodedOk = pcall(function()
		decoded = HttpService:JSONDecode(body)
	end)

	if not decodedOk or type(decoded) ~= "table" then
		self._event:Fire(nil, "invalid_json")
		return
	end

	if decoded.error then
		self._event:Fire(nil, decoded.error)
		return
	end

	self.latest = decoded
	self._event:Fire(decoded, nil)
end

function BleBridge:_sendCommand(command)
	local url = string.format(
		"%s/v1/sessions/%s/commands",
		self.baseUrl,
		HttpService:UrlEncode(self.sessionCode)
	)
	local body = HttpService:JSONEncode(command)

	local ok, response = pcall(function()
		return HttpService:RequestAsync({
			Url = url,
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
			},
			Body = body,
		})
	end)

	if not ok then
		return nil, "request_failed"
	end

	local decoded
	local decodedOk = pcall(function()
		decoded = HttpService:JSONDecode(response.Body)
	end)

	if not decodedOk or type(decoded) ~= "table" then
		return nil, "invalid_json"
	end

	if not response.Success then
		return nil, decoded.error or decoded.reason or "command_failed"
	end

	return decoded, nil
end

function stripTrailingSlash(value)
	return string.gsub(value, "/+$", "")
end

return BleBridge
