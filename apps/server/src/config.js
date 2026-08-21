import { fileURLToPath } from 'node:url';

const DEFAULT_WEB_DIST_DIR = fileURLToPath(new URL('../../web/dist', import.meta.url));

export const DEFAULT_CONFIG = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 8787),
  webDistDir: process.env.WEB_DIST_DIR || DEFAULT_WEB_DIST_DIR,
  pluginManifestPath: process.env.BLE_PLUGIN_MANIFEST_PATH || '',
  idleTtlMs: Number(process.env.IDLE_TTL_MS || 60 * 1000),
  staleMs: Number(process.env.STALE_MS || 10 * 1000),
  cleanupIntervalMs: Number(process.env.CLEANUP_INTERVAL_MS || 15 * 1000),
  maxTelemetryPerSecond: Number(process.env.MAX_TELEMETRY_PER_SECOND || 10),
  maxCommandsPerSecond: Number(process.env.MAX_COMMANDS_PER_SECOND || 2),
  maxUnknownCodesPerMinute: Number(process.env.MAX_UNKNOWN_CODES_PER_MINUTE || 60),
  maxUnknownCodesGloballyPerMinute: Number(process.env.MAX_UNKNOWN_CODES_GLOBALLY_PER_MINUTE || 600),
  maxBatchCodes: Number(process.env.MAX_BATCH_CODES || 50),
  maxPayloadBytes: Number(process.env.MAX_PAYLOAD_BYTES || 4 * 1024)
};
