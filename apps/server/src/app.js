import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';

import { DEFAULT_CONFIG } from './config.js';
import { MemoryBridgeStore, normalizeCode } from './session-store.js';

const SELF_HOSTED_SECURITY_HEADERS = Object.freeze({
  'content-security-policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "worker-src 'self'"
  ].join('; '),
  'permissions-policy': 'bluetooth=(self)',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY'
});

export function createApp(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const pluginCommandSchemas = options.pluginCommandSchemas || loadPluginCommandSchemas(
    config.pluginManifestPath || path.join(config.webDistDir, 'ble-plugin-manifest.json')
  );
  const store = options.store || new MemoryBridgeStore(config);
  const unknownCodeLimiter = createUnknownCodeLimiter(config);
  const app = Fastify({
    logger: options.logger ?? {
      serializers: {
        req: serializeRequestForLogs
      }
    },
    bodyLimit: config.maxPayloadBytes,
    trustProxy: ['loopback', 'linklocal', 'uniquelocal']
  });

  app.decorate('bridgeStore', store);
  app.decorate('bridgeConfig', config);

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.headers(SELF_HOSTED_SECURITY_HEADERS);
    return payload;
  });

  app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS']
  });
  app.register(websocket);

  app.get('/v1/health', async () => ({
    ok: true,
    service: 'ble-bridge',
    now: Date.now()
  }));

  app.get('/v1/demo/power', async () => buildDemoPowerReading());

  app.post('/v1/sessions/latest', async (request, reply) => {
    const codes = normalizeBatchCodes(request.body?.codes);

    if (!codes.ok) {
      return reply.code(400).send({
        error: codes.error,
        maxCodes: config.maxBatchCodes
      });
    }

    if (codes.values.length > config.maxBatchCodes) {
      return reply.code(400).send({
        error: 'too_many_codes',
        maxCodes: config.maxBatchCodes
      });
    }

    const now = Date.now();
    const sessions = {};

    for (const code of codes.values) {
      const latest = store.getLatest(code, now);
      sessions[code] = latest || {
        code,
        error: unknownCodeLimiter.accept(request.ip, now)
          ? 'session_not_found'
          : 'unknown_code_rate_limited'
      };
    }

    return {
      now,
      sessions
    };
  });

  app.get('/v1/sessions/:code/latest', async (request, reply) => {
    const latest = store.getLatest(request.params.code);

    if (!latest) {
      if (!unknownCodeLimiter.accept(request.ip)) {
        return reply.code(429).send({ error: 'unknown_code_rate_limited' });
      }
      return reply.code(404).send({
        error: 'session_not_found'
      });
    }

    return latest;
  });

  app.post('/v1/sessions/:code/commands', async (request, reply) => {
    const normalized = normalizeCommand(request.body, pluginCommandSchemas);

    if (!normalized.ok) {
      return reply.code(400).send({
        error: 'invalid_command',
        reason: normalized.reason
      });
    }

    const command = {
      ...normalized.command,
      commandId: createCommandId(),
      createdAt: Date.now()
    };
    command.expiresAt = command.createdAt + command.ttlMs;

    const dispatch = store.dispatchCommand(request.params.code, command);

    if (!dispatch.ok) {
      if (dispatch.reason === 'session_not_found' && !unknownCodeLimiter.accept(request.ip)) {
        return reply.code(429).send({ error: 'unknown_code_rate_limited' });
      }
      const statusCode = commandErrorStatusCode(dispatch.reason);
      return reply.code(statusCode).send({
        error: dispatch.reason
      });
    }

    return {
      commandId: command.commandId,
      type: command.type,
      status: 'sent'
    };
  });

  app.register(async (instance) => {
    instance.get('/v1/sessions/:code/bridge', { websocket: true }, (socket, request) => {
      const code = normalizeCode(request.params.code);
      const channel = store.attachBridge(code, socket);

      if (!channel) {
        socket.close(1008, 'invalid connection code');
        return;
      }

      socket.send(JSON.stringify({
        type: 'ready',
        code: channel.code
      }));

      socket.on('message', (message) => {
        const size = Buffer.byteLength(message);
        if (size > config.maxPayloadBytes) {
          socket.send(JSON.stringify({ type: 'error', error: 'payload_too_large' }));
          return;
        }

        let payload;
        try {
          payload = JSON.parse(message.toString());
        } catch {
          socket.send(JSON.stringify({ type: 'error', error: 'invalid_json' }));
          return;
        }

        if (isControlOnlyBridgeMessage(payload)) {
          return;
        }

        let result;
        try {
          result = store.updateTelemetry(code, socket, payload);
        } catch (error) {
          socket.send(JSON.stringify({ type: 'error', error: 'invalid_telemetry', message: error.message }));
          return;
        }

        if (!result.ok) {
          socket.send(JSON.stringify({ type: 'error', error: result.reason }));
          return;
        }

        socket.send(JSON.stringify({
          type: 'ack',
          timestampMs: result.telemetry.timestampMs
        }));
      });

      socket.on('close', () => {
        store.detachBridge(code, socket);
      });
    });
  });

  registerStaticWebApp(app, config);

  if (config.cleanupIntervalMs > 0) {
    const interval = setInterval(() => store.cleanup(), config.cleanupIntervalMs);
    interval.unref?.();
    app.addHook('onClose', async () => clearInterval(interval));
  }

  return app;
}

function registerStaticWebApp(app, config) {
  if (!hasReadableDirectory(config.webDistDir)) {
    app.log.warn({ webDistDir: config.webDistDir }, 'static web app directory not found; serving API only');
    return;
  }

  app.register(fastifyStatic, {
    root: config.webDistDir,
    prefix: '/',
    index: ['index.html'],
    wildcard: false
  });

  app.setNotFoundHandler((request, reply) => {
    if (isApiRequest(request.raw.url)) {
      return reply.code(404).send({ error: 'not_found' });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return reply.code(404).send({ error: 'not_found' });
    }

    return reply.sendFile('index.html');
  });
}

function hasReadableDirectory(pathname) {
  try {
    return Boolean(pathname && existsSync(pathname) && statSync(pathname).isDirectory());
  } catch {
    return false;
  }
}

function isApiRequest(url) {
  try {
    const pathname = new URL(url || '/', 'http://local').pathname;
    return pathname === '/v1' || pathname.startsWith('/v1/');
  } catch {
    return false;
  }
}

function serializeRequestForLogs(request) {
  return {
    method: request.method,
    url: redactConnectionCode(request.url),
    version: request.httpVersion,
    host: request.headers?.host,
    remoteAddress: request.socket?.remoteAddress,
    remotePort: request.socket?.remotePort
  };
}

export function redactConnectionCode(url) {
  return String(url || '').replace(
    /(\/v1\/sessions\/)(?!latest(?:[/?]|$))[^/?]+/g,
    '$1[redacted]'
  );
}

export function buildDemoPowerReading(timestampMs = Date.now()) {
  const centerPowerW = 150;
  const amplitudeW = 20;
  const periodMs = 60_000;
  const phase = ((timestampMs % periodMs) / periodMs) * Math.PI * 2;

  return {
    code: 'DEMO-POWER',
    schemaVersion: 2,
    connected: true,
    stale: false,
    ageMs: 0,
    lastBridgeSeenAt: timestampMs,
    power: Math.round(centerPowerW + Math.sin(phase) * amplitudeW)
  };
}

function normalizeBatchCodes(input) {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'codes_must_be_array' };
  }

  const values = [];
  const seen = new Set();

  for (const code of input) {
    if (typeof code !== 'string') {
      return { ok: false, error: 'codes_must_be_strings' };
    }

    const normalized = normalizeCode(code);
    if (!normalized) {
      return { ok: false, error: 'codes_must_not_be_empty' };
    }

    if (!seen.has(normalized)) {
      seen.add(normalized);
      values.push(normalized);
    }
  }

  return { ok: true, values };
}

function createUnknownCodeLimiter(config) {
  const clients = new Map();
  let globalWindowStartedAt = Date.now();
  let globalCount = 0;

  return {
    accept(clientId, now = Date.now()) {
      if (now - globalWindowStartedAt >= 60_000) {
        globalWindowStartedAt = now;
        globalCount = 0;
        clients.clear();
      }

      if (globalCount >= config.maxUnknownCodesGloballyPerMinute) {
        return false;
      }

      const key = String(clientId || 'unknown');
      const client = clients.get(key) || { windowStartedAt: now, count: 0 };
      if (now - client.windowStartedAt >= 60_000) {
        client.windowStartedAt = now;
        client.count = 0;
      }

      client.count += 1;
      globalCount += 1;
      clients.set(key, client);

      return client.count <= config.maxUnknownCodesPerMinute
        && globalCount <= config.maxUnknownCodesGloballyPerMinute;
    }
  };
}

export function normalizeCommand(input, pluginCommandSchemas = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'command_must_be_object' };
  }

  const requestedTtlMs = Number(input.ttlMs);
  const ttlMs = Number.isFinite(requestedTtlMs)
    ? clampNumber(requestedTtlMs, 250, 10_000)
    : 3000;

  if (input.type === 'bike.grade') {
    if (!Number.isFinite(input.gradePct)) {
      return { ok: false, reason: 'gradePct_required' };
    }

    return {
      ok: true,
      command: {
        type: 'bike.grade',
        gradePct: clampNumber(input.gradePct, -20, 20),
        windSpeedMps: Number.isFinite(input.windSpeedMps)
          ? clampNumber(input.windSpeedMps, -32.768, 32.767)
          : 0,
        rollingResistanceCoefficient: Number.isFinite(input.rollingResistanceCoefficient)
          ? clampNumber(input.rollingResistanceCoefficient, 0, 0.0255)
          : 0.004,
        windResistanceCoefficientKgM: Number.isFinite(input.windResistanceCoefficientKgM)
          ? clampNumber(input.windResistanceCoefficientKgM, 0, 2.55)
          : 0.51,
        ttlMs
      }
    };
  }

  if (input.type === 'bike.targetSpeed') {
    return normalizeNumericCommand(input, 'targetSpeedMps', 0, 182.0417, ttlMs);
  }

  if (input.type === 'bike.inclination') {
    return normalizeNumericCommand(input, 'inclinePct', -3276.8, 3276.7, ttlMs);
  }

  if (input.type === 'bike.resistance') {
    if (!Number.isFinite(input.resistanceLevel)) {
      return { ok: false, reason: 'resistanceLevel_required' };
    }

    return {
      ok: true,
      command: {
        type: 'bike.resistance',
        resistanceLevel: clampNumber(input.resistanceLevel, 0, 100),
        ttlMs
      }
    };
  }

  if (input.type === 'bike.targetPower') {
    if (!Number.isFinite(input.targetPowerW)) {
      return { ok: false, reason: 'targetPowerW_required' };
    }

    return {
      ok: true,
      command: {
        type: 'bike.targetPower',
        targetPowerW: clampNumber(input.targetPowerW, 0, 4000),
        ttlMs
      }
    };
  }

  if (input.type === 'bike.targetHeartRate') {
    return normalizeNumericCommand(input, 'targetHeartBpm', 0, 255, ttlMs, true);
  }

  if (input.type === 'bike.targetEnergy') {
    return normalizeNumericCommand(input, 'targetEnergyKcal', 0, 65535, ttlMs, true);
  }

  if (input.type === 'bike.targetSteps') {
    return normalizeNumericCommand(input, 'targetSteps', 0, 65535, ttlMs, true);
  }

  if (input.type === 'bike.targetStrides') {
    return normalizeNumericCommand(input, 'targetStrides', 0, 65535, ttlMs, true);
  }

  if (input.type === 'bike.targetDistance') {
    return normalizeNumericCommand(input, 'targetDistanceM', 0, 0xffffff, ttlMs, true);
  }

  if (input.type === 'bike.targetTrainingTime') {
    return normalizeNumericCommand(input, 'targetTrainingTimeS', 0, 65535, ttlMs, true);
  }

  const heartRateZoneCounts = {
    'bike.targetTimeTwoHeartRateZones': 2,
    'bike.targetTimeThreeHeartRateZones': 3,
    'bike.targetTimeFiveHeartRateZones': 5
  };
  if (heartRateZoneCounts[input.type]) {
    const expectedLength = heartRateZoneCounts[input.type];
    if (!Array.isArray(input.zoneTimesS) || input.zoneTimesS.length !== expectedLength || input.zoneTimesS.some((value) => !Number.isFinite(value))) {
      return { ok: false, reason: `zoneTimesS_${expectedLength}_values_required` };
    }
    return {
      ok: true,
      command: {
        type: input.type,
        zoneTimesS: input.zoneTimesS.map((value) => Math.round(clampNumber(value, 0, 65535))),
        ttlMs
      }
    };
  }

  if (input.type === 'bike.wheelCircumference') {
    return normalizeNumericCommand(input, 'wheelCircumferenceMm', 0, 6553.5, ttlMs);
  }

  if (input.type === 'bike.spinDown') {
    if (input.spinDownAction !== 'start' && input.spinDownAction !== 'ignore') {
      return { ok: false, reason: 'spinDownAction_invalid' };
    }
    return {
      ok: true,
      command: {
        type: input.type,
        spinDownAction: input.spinDownAction,
        ttlMs
      }
    };
  }

  if (input.type === 'bike.targetCadence') {
    return normalizeNumericCommand(input, 'targetCadenceRpm', 0, 32767.5, ttlMs);
  }

  if (input.type === 'treadmill.speed') {
    if (!Number.isFinite(input.speedMps)) {
      return { ok: false, reason: 'speedMps_required' };
    }

    return {
      ok: true,
      command: {
        type: 'treadmill.speed',
        speedMps: Math.max(0, input.speedMps),
        ttlMs
      }
    };
  }

  if (input.type === 'treadmill.incline') {
    if (!Number.isFinite(input.inclinePct)) {
      return { ok: false, reason: 'inclinePct_required' };
    }

    return {
      ok: true,
      command: {
        type: 'treadmill.incline',
        inclinePct: clampNumber(input.inclinePct, -20, 20),
        ttlMs
      }
    };
  }

  const pluginSchema = pluginCommandSchemas.find((command) => command.type === input.type);
  if (pluginSchema) {
    return normalizePluginCommand(input, pluginSchema, ttlMs);
  }

  return { ok: false, reason: 'unsupported_command_type' };
}

export function loadPluginCommandSchemas(manifestPath) {
  if (!manifestPath || !existsSync(manifestPath)) {
    return [];
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest?.apiVersion !== 1 || !Array.isArray(manifest.plugins)) {
      return [];
    }

    const commands = manifest.plugins.flatMap((plugin) => (
      Array.isArray(plugin?.commands) ? plugin.commands : []
    ));
    const types = new Set();
    return commands.filter((command) => {
      if (!isValidPluginCommandSchema(command) || types.has(command.type)) {
        return false;
      }
      types.add(command.type);
      return true;
    });
  } catch {
    return [];
  }
}

function normalizeNumericCommand(input, field, min, max, ttlMs, integer = false) {
  if (!Number.isFinite(input[field])) {
    return { ok: false, reason: `${field}_required` };
  }

  const value = clampNumber(input[field], min, max);
  return {
    ok: true,
    command: {
      type: input.type,
      [field]: integer ? Math.round(value) : value,
      ttlMs
    }
  };
}

function normalizePluginCommand(input, schema, ttlMs) {
  const command = { type: schema.type };

  for (const [name, field] of Object.entries(schema.fields)) {
    let value = input[name];
    if (value === undefined && Object.hasOwn(field, 'default')) {
      value = field.default;
    }

    if (value === undefined) {
      if (field.required) {
        return { ok: false, reason: `${name}_required` };
      }
      continue;
    }

    if (field.type === 'number' || field.type === 'integer') {
      if (!Number.isFinite(value)) {
        return { ok: false, reason: `${name}_invalid` };
      }
      const min = Number.isFinite(field.min) ? field.min : Number.MIN_SAFE_INTEGER;
      const max = Number.isFinite(field.max) ? field.max : Number.MAX_SAFE_INTEGER;
      command[name] = field.type === 'integer'
        ? clampInteger(value, min, max)
        : clampNumber(value, min, max);
      continue;
    }

    if (field.type === 'boolean') {
      if (typeof value !== 'boolean') {
        return { ok: false, reason: `${name}_invalid` };
      }
      command[name] = value;
      continue;
    }

    if (field.type === 'string') {
      if (typeof value !== 'string') {
        return { ok: false, reason: `${name}_invalid` };
      }
      command[name] = value;
    }
  }

  command.ttlMs = ttlMs;
  return { ok: true, command };
}

function isValidPluginCommandSchema(command) {
  return Boolean(
    command &&
    typeof command === 'object' &&
    typeof command.type === 'string' &&
    command.type.length > 0 &&
    command.fields &&
    typeof command.fields === 'object' &&
    !Array.isArray(command.fields)
  );
}

function commandErrorStatusCode(reason) {
  if (reason === 'session_not_found') {
    return 404;
  }

  if (reason === 'bridge_not_connected') {
    return 409;
  }

  if (reason === 'command_rate_limited') {
    return 429;
  }

  return 400;
}

function isControlOnlyBridgeMessage(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }

  if (typeof payload.type !== 'string') {
    return false;
  }

  return !Object.hasOwn(payload, 'schemaVersion') && !Object.hasOwn(payload, 'sources');
}

function createCommandId() {
  return `cmd_${randomBytes(12).toString('base64url')}`;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value, min, max) {
  return Math.round(clampNumber(value, min, max));
}
