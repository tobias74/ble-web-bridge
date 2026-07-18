import { randomBytes, randomInt } from 'node:crypto';

const CODE_WORDS = [
  'BLUE',
  'RIDE',
  'PACE',
  'VOLT',
  'WATT',
  'SPIN',
  'FLOW',
  'BEAM',
  'PULSE',
  'SHIFT'
];

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

export class MemorySessionStore {
  constructor(config) {
    this.config = config;
    this.sessions = new Map();
  }

  createSession(now = Date.now()) {
    let code = createSessionCode();

    for (let attempts = 0; this.sessions.has(code) && attempts < 20; attempts += 1) {
      code = createSessionCode();
    }

    if (this.sessions.has(code)) {
      throw new Error('Could not allocate a unique session code');
    }

    const session = {
      code,
      bridgeToken: randomBytes(24).toString('base64url'),
      createdAt: now,
      expiresAt: now + this.config.sessionTtlMs,
      lastBridgeSeenAt: null,
      latestTelemetry: null,
      bridgeSocket: null,
      rateWindowStartedAt: now,
      telemetryCount: 0,
      commandRateWindowStartedAt: now,
      commandCount: 0
    };

    this.sessions.set(code, session);
    return serializeSession(session);
  }

  getSession(code, now = Date.now()) {
    const session = this.sessions.get(normalizeCode(code));
    if (!session) {
      return null;
    }

    if (this.isExpired(session, now)) {
      this.deleteSession(session.code);
      return null;
    }

    return session;
  }

  deleteSession(code) {
    const session = this.sessions.get(normalizeCode(code));
    if (!session) {
      return false;
    }

    if (session.bridgeSocket?.readyState === 1) {
      session.bridgeSocket.close(1001, 'session expired');
    }

    return this.sessions.delete(session.code);
  }

  cleanup(now = Date.now()) {
    let removed = 0;

    for (const session of this.sessions.values()) {
      if (this.isExpired(session, now)) {
        this.deleteSession(session.code);
        removed += 1;
      }
    }

    return removed;
  }

  attachBridge(code, bridgeToken, socket, now = Date.now()) {
    const session = this.getSession(code, now);
    if (!session || session.bridgeToken !== bridgeToken) {
      return null;
    }

    if (session.bridgeSocket?.readyState === 1 && session.bridgeSocket !== socket) {
      session.bridgeSocket.close(1012, 'bridge replaced');
    }

    session.bridgeSocket = socket;
    session.lastBridgeSeenAt = now;
    return session;
  }

  detachBridge(code, socket) {
    const session = this.sessions.get(normalizeCode(code));
    if (session?.bridgeSocket === socket) {
      session.bridgeSocket = null;
    }
  }

  updateTelemetry(code, bridgeToken, telemetry, now = Date.now()) {
    const session = this.getSession(code, now);
    if (!session || session.bridgeToken !== bridgeToken) {
      return { ok: false, reason: 'unauthorized' };
    }

    if (!this.acceptRate(session, now)) {
      return { ok: false, reason: 'rate_limited' };
    }

    session.lastBridgeSeenAt = now;
    session.latestTelemetry = sanitizeTelemetry(telemetry, now);
    return { ok: true, telemetry: session.latestTelemetry };
  }

  dispatchCommand(code, command, now = Date.now()) {
    const session = this.getSession(code, now);
    if (!session) {
      return { ok: false, reason: 'session_not_found' };
    }

    if (!session.bridgeSocket || session.bridgeSocket.readyState !== 1) {
      return { ok: false, reason: 'bridge_not_connected' };
    }

    if (!this.acceptCommandRate(session, now)) {
      return { ok: false, reason: 'command_rate_limited' };
    }

    try {
      session.bridgeSocket.send(JSON.stringify({
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
    const session = this.getSession(code, now);
    if (!session) {
      return null;
    }

    const latest = session.latestTelemetry;
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
      code: session.code,
      schemaVersion: 2,
      connected,
      stale,
      ageMs,
      expiresAt: session.expiresAt,
      lastBridgeSeenAt: session.lastBridgeSeenAt,
      selected,
      sources
    };
  }

  isExpired(session, now) {
    if (now >= session.expiresAt) {
      return true;
    }

    const lastActivityAt = session.lastBridgeSeenAt || session.createdAt;
    return now - lastActivityAt > this.config.idleTtlMs;
  }

  acceptRate(session, now) {
    if (now - session.rateWindowStartedAt >= 1000) {
      session.rateWindowStartedAt = now;
      session.telemetryCount = 0;
    }

    session.telemetryCount += 1;
    return session.telemetryCount <= this.config.maxTelemetryPerSecond;
  }

  acceptCommandRate(session, now) {
    if (now - session.commandRateWindowStartedAt >= 1000) {
      session.commandRateWindowStartedAt = now;
      session.commandCount = 0;
    }

    session.commandCount += 1;
    return session.commandCount <= this.config.maxCommandsPerSecond;
  }
}

export function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function createSessionCode() {
  const word = CODE_WORDS[randomInt(CODE_WORDS.length)];
  const digits = String(randomInt(0, 10000)).padStart(4, '0');
  return `${word}-${digits}`;
}

function serializeSession(session) {
  return {
    code: session.code,
    bridgeToken: session.bridgeToken,
    expiresAt: session.expiresAt
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
