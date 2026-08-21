const CODE_PREFIXES = [
  'amber', 'aqua', 'bold', 'brisk', 'calm', 'clear', 'coral', 'cosmic',
  'crisp', 'dawn', 'deep', 'eager', 'ember', 'fast', 'fresh', 'golden',
  'green', 'happy', 'icy', 'jade', 'keen', 'light', 'lunar', 'mint',
  'misty', 'ocean', 'prime', 'quiet', 'rapid', 'silver', 'solar', 'vivid'
];

const CODE_SUFFIXES = [
  'badger', 'beacon', 'birch', 'breeze', 'brook', 'cedar', 'comet', 'crane',
  'creek', 'drift', 'elm', 'falcon', 'fern', 'finch', 'flame', 'forest',
  'fox', 'frost', 'garden', 'grove', 'harbor', 'heath', 'hill', 'iris',
  'island', 'lake', 'lark', 'leaf', 'lynx', 'maple', 'meadow', 'moon',
  'oak', 'orbit', 'otter', 'owl', 'peak', 'pine', 'plume', 'pond',
  'raven', 'reef', 'ridge', 'river', 'robin', 'rock', 'sail', 'shore',
  'sky', 'spark', 'spring', 'star', 'stone', 'storm', 'stream', 'summit',
  'sun', 'tide', 'trail', 'valley', 'wave', 'willow', 'wind', 'wolf'
];

export const CONNECTION_CODE_PATTERN = /^[A-Z]{6,24}-\d{6}$/;
export const CONNECTION_CODE_KEYSPACE = CODE_PREFIXES.length * CODE_SUFFIXES.length * 1_000_000;
const RETIRED_CODE_WORDS = ['NOBLE', 'HAWK', 'EAGLE'];

export function createConnectionSession({
  location = globalThis.location,
  randomInt = secureRandomInt
} = {}) {
  const code = createConnectionCode(randomInt);
  return {
    code,
    bridgeWsUrl: buildBridgeWsUrl(code, location)
  };
}

export function restoreConnectionSession(code, location = globalThis.location) {
  const normalizedCode = normalizeConnectionCode(code);
  if (!isValidConnectionCode(normalizedCode)) {
    return null;
  }

  return {
    code: normalizedCode,
    bridgeWsUrl: buildBridgeWsUrl(normalizedCode, location)
  };
}

export function createConnectionCode(randomInt = secureRandomInt) {
  const prefix = CODE_PREFIXES[randomInt(CODE_PREFIXES.length)];
  const suffix = CODE_SUFFIXES[randomInt(CODE_SUFFIXES.length)];
  const digits = String(randomInt(1_000_000)).padStart(6, '0');
  return `${prefix}${suffix}-${digits}`.toUpperCase();
}

export function isValidConnectionCode(code) {
  const normalizedCode = normalizeConnectionCode(code);
  return CONNECTION_CODE_PATTERN.test(normalizedCode)
    && RETIRED_CODE_WORDS.every((word) => !normalizedCode.includes(word));
}

export function normalizeConnectionCode(code) {
  return String(code || '').trim().toUpperCase();
}

function buildBridgeWsUrl(code, location) {
  const origin = location?.origin || new URL(location?.href).origin;
  const url = new URL(`/v1/sessions/${encodeURIComponent(code)}/bridge`, origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function secureRandomInt(maximum) {
  if (!Number.isSafeInteger(maximum) || maximum <= 0) {
    throw new RangeError('maximum must be a positive safe integer');
  }

  const range = 0x1_0000_0000;
  const limit = range - (range % maximum);
  const values = new Uint32Array(1);
  let value;

  do {
    globalThis.crypto.getRandomValues(values);
    [value] = values;
  } while (value >= limit);

  return value % maximum;
}
