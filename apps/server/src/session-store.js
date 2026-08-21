export const CONNECTION_CODE_PATTERN = /^[A-Z]{6,24}-\d{6}$/;

const SOURCE_VALUE_FIELDS = new Set([
  'speedMps',
  'averageSpeedMps',
  'cadenceRpm',
  'cadenceSpm',
  'powerW',
  'averagePowerW',
  'distanceM',
  'inclinePct',
  'rampAngleDeg',
  'heartBpm',
  'strideLengthM',
  'strideCount',
  'strokeRateSpm',
  'averageStrokeRateSpm',
  'strokeCount',
  'paceSecondsPer500m',
  'averagePaceSecondsPer500m',
  'resistanceLevel',
  'totalEnergyKcal',
  'energyPerHourKcal',
  'energyPerMinuteKcal',
  'metabolicEquivalent',
  'elapsedTimeS',
  'remainingTimeS',
  'stepsPerMinute',
  'averageStepRateSpm',
  'stepCount',
  'floors',
  'elevationGainM'
]);

const SOURCE_INFO_STRING_FIELDS = new Set([
  'manufacturerName',
  'modelNumber',
  'firmwareRevision',
  'hardwareRevision',
  'softwareRevision'
]);

const SOURCE_INFO_NUMBER_FIELDS = new Set([
  'batteryPct'
]);

export class MemoryBridgeStore {
  constructor(config) {
    this.config = config;
    this.channels = new Map();
  }

  getChannel(code, now = Date.now()) {
    const channel = this.channels.get(normalizeCode(code));
    if (!channel) {
      return null;
    }

    if (this.isExpired(channel, now)) {
      this.deleteChannel(channel.code);
      return null;
    }

    return channel;
  }

  deleteChannel(code) {
    const channel = this.channels.get(normalizeCode(code));
    if (!channel) {
      return false;
    }

    if (channel.bridgeSocket?.readyState === 1) {
      channel.bridgeSocket.close(1001, 'bridge channel expired');
    }

    return this.channels.delete(channel.code);
  }

  cleanup(now = Date.now()) {
    let removed = 0;

    for (const channel of this.channels.values()) {
      if (this.isExpired(channel, now)) {
        this.deleteChannel(channel.code);
        removed += 1;
      }
    }

    return removed;
  }

  attachBridge(code, socket, now = Date.now()) {
    const normalizedCode = normalizeCode(code);
    if (!isValidConnectionCode(normalizedCode)) {
      return null;
    }

    let channel = this.getChannel(normalizedCode, now);
    if (!channel) {
      channel = createRuntimeChannel(normalizedCode, now);
      this.channels.set(normalizedCode, channel);
    }

    if (channel.bridgeSocket?.readyState === 1 && channel.bridgeSocket !== socket) {
      channel.bridgeSocket.close(1012, 'bridge replaced');
    }

    channel.bridgeSocket = socket;
    channel.lastBridgeSeenAt = now;
    return channel;
  }

  detachBridge(code, socket) {
    const channel = this.channels.get(normalizeCode(code));
    if (channel?.bridgeSocket === socket) {
      channel.bridgeSocket = null;
    }
  }

  updateTelemetry(code, socket, telemetry, now = Date.now()) {
    const channel = this.getChannel(code, now);
    if (!channel || channel.bridgeSocket !== socket) {
      return { ok: false, reason: 'unauthorized' };
    }

    if (!this.acceptRate(channel, now)) {
      return { ok: false, reason: 'rate_limited' };
    }

    channel.lastBridgeSeenAt = now;
    channel.latestTelemetry = sanitizeTelemetry(telemetry, now);
    return { ok: true, telemetry: channel.latestTelemetry };
  }

  dispatchCommand(code, command, now = Date.now()) {
    const channel = this.getChannel(code, now);
    if (!channel) {
      return { ok: false, reason: 'session_not_found' };
    }

    if (!channel.bridgeSocket || channel.bridgeSocket.readyState !== 1) {
      return { ok: false, reason: 'bridge_not_connected' };
    }

    if (!this.acceptCommandRate(channel, now)) {
      return { ok: false, reason: 'command_rate_limited' };
    }

    try {
      channel.bridgeSocket.send(JSON.stringify({
        type: 'command',
        command
      }));
    } catch {
      return { ok: false, reason: 'bridge_not_connected' };
    }

    return {
      ok: true
    };
  }

  getLatest(code, now = Date.now()) {
    const channel = this.getChannel(code, now);
    if (!channel) {
      return null;
    }

    const latest = channel.latestTelemetry;
    const sources = {};
    const selected = {};
    let connected = false;
    let ageMs = null;

    if (latest) {
      for (const [sourceId, source] of Object.entries(latest.sources)) {
        const sourceAgeMs = Number.isFinite(source.timestampMs) ? Math.max(0, now - source.timestampMs) : null;
        const sourceStale = sourceAgeMs === null || sourceAgeMs > this.config.staleMs;
        const sourceConnected = Boolean(source.connected) && !sourceStale;

        if (sourceConnected) {
          connected = true;
        }

        if (sourceAgeMs !== null && (ageMs === null || sourceAgeMs < ageMs)) {
          ageMs = sourceAgeMs;
        }

        sources[sourceId] = {
          ...source,
          connected: sourceConnected,
          stale: sourceStale,
          ageMs: sourceAgeMs
        };
      }

      if (ageMs === null && Number.isFinite(latest.timestampMs)) {
        ageMs = Math.max(0, now - latest.timestampMs);
      }

      for (const [key, entry] of Object.entries(latest.selected || {})) {
        const source = sources[entry.sourceId];
        if (!source || !Number.isFinite(source.values?.[key])) {
          continue;
        }

        selected[key] = {
          ...entry,
          value: source.values[key],
          connected: source.connected,
          stale: source.stale,
          ageMs: source.ageMs
        };
      }
    }

    const stale = !connected;

    return {
      code: channel.code,
      schemaVersion: 2,
      connected,
      stale,
      ageMs,
      lastBridgeSeenAt: channel.lastBridgeSeenAt,
      selected,
      sources
    };
  }

  isExpired(channel, now) {
    const lastActivityAt = channel.lastBridgeSeenAt || channel.createdAt;
    return now - lastActivityAt > this.config.idleTtlMs;
  }

  acceptRate(channel, now) {
    if (now - channel.rateWindowStartedAt >= 1000) {
      channel.rateWindowStartedAt = now;
      channel.telemetryCount = 0;
    }

    channel.telemetryCount += 1;
    return channel.telemetryCount <= this.config.maxTelemetryPerSecond;
  }

  acceptCommandRate(channel, now) {
    if (now - channel.commandRateWindowStartedAt >= 1000) {
      channel.commandRateWindowStartedAt = now;
      channel.commandCount = 0;
    }

    channel.commandCount += 1;
    return channel.commandCount <= this.config.maxCommandsPerSecond;
  }
}

export function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

export function isValidConnectionCode(code) {
  return CONNECTION_CODE_PATTERN.test(normalizeCode(code));
}

function createRuntimeChannel(code, now) {
  return {
    code,
    createdAt: now,
    lastBridgeSeenAt: now,
    latestTelemetry: null,
    bridgeSocket: null,
    rateWindowStartedAt: now,
    telemetryCount: 0,
    commandRateWindowStartedAt: now,
    commandCount: 0
  };
}

function sanitizeTelemetry(input, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('telemetry must be an object');
  }

  if (input.schemaVersion !== 2) {
    throw new Error('schemaVersion 2 required');
  }

  if (!input.sources || typeof input.sources !== 'object' || Array.isArray(input.sources)) {
    throw new Error('sources must be an object');
  }

  const timestampMs = Number.isFinite(input.timestampMs) ? input.timestampMs : now;
  const sources = {};

  for (const [key, value] of Object.entries(input.sources)) {
    const source = sanitizeSource(key, value, timestampMs);
    if (source) {
      sources[source.sourceId] = source;
    }
  }

  return {
    schemaVersion: 2,
    timestampMs,
    sources,
    selected: sanitizeSelectedMetrics(input.selected, sources)
  };
}

function sanitizeSelectedMetrics(input, sources) {
  const selected = {};

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return selected;
  }

  for (const [key, entry] of Object.entries(input)) {
    if (!SOURCE_VALUE_FIELDS.has(key) || !entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const sourceId = sanitizeString(entry.sourceId, 128);
    const source = sources[sourceId];
    if (!source || !Number.isFinite(source.values?.[key])) {
      continue;
    }

    selected[key] = {
      sourceId,
      deviceId: source.deviceId,
      deviceName: source.deviceName,
      protocol: source.protocol,
      value: source.values[key],
      timestampMs: source.timestampMs
    };
  }

  return selected;
}

function sanitizeSource(key, input, fallbackTimestampMs) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const sourceId = sanitizeString(input.sourceId || key, 128);
  if (!sourceId) {
    return null;
  }

  const values = sanitizeNumberMap(input.values, SOURCE_VALUE_FIELDS);
  const info = sanitizeInfo(input.info);
  const source = {
    sourceId,
    deviceId: sanitizeString(input.deviceId, 64),
    deviceName: sanitizeString(input.deviceName, 128),
    protocol: sanitizeString(input.protocol, 64) || 'unknown',
    connected: input.connected !== false,
    timestampMs: Number.isFinite(input.timestampMs) ? input.timestampMs : fallbackTimestampMs,
    values
  };

  if (Object.keys(info).length > 0) {
    source.info = info;
  }

  if (input.raw && typeof input.raw === 'object' && !Array.isArray(input.raw)) {
    source.raw = input.raw;
  }

  return source;
}

function sanitizeNumberMap(input, allowedFields) {
  const output = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return output;
  }

  for (const [key, value] of Object.entries(input)) {
    if (allowedFields.has(key) && Number.isFinite(value)) {
      output[key] = value;
    }
  }

  return output;
}

function sanitizeInfo(input) {
  const output = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return output;
  }

  for (const [key, value] of Object.entries(input)) {
    if (SOURCE_INFO_STRING_FIELDS.has(key)) {
      const sanitized = sanitizeString(value, 128);
      if (sanitized) {
        output[key] = sanitized;
      }
    } else if (SOURCE_INFO_NUMBER_FIELDS.has(key) && Number.isFinite(value)) {
      output[key] = Math.max(0, Math.min(100, value));
    }
  }

  return output;
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}
