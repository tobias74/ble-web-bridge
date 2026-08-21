import {
  isValidConnectionCode,
  normalizeConnectionCode,
  restoreConnectionSession
} from './connection-session.js';

export const CONNECTION_SESSION_STORAGE_KEY = 'ble-bridge.connection-code.v2';
const LEGACY_CONNECTION_SESSION_STORAGE_KEY = 'ble-bridge.connection-session.v1';

export function readStoredConnectionSession(
  storage = browserStorage(),
  location = globalThis.location
) {
  try {
    const session = JSON.parse(storage?.getItem?.(CONNECTION_SESSION_STORAGE_KEY) || 'null');
    const restored = restoreConnectionSession(session?.code, location);
    if (!restored) {
      storage?.removeItem?.(CONNECTION_SESSION_STORAGE_KEY);
      storage?.removeItem?.(LEGACY_CONNECTION_SESSION_STORAGE_KEY);
      return null;
    }

    return restored;
  } catch {
    try {
      storage?.removeItem?.(CONNECTION_SESSION_STORAGE_KEY);
      storage?.removeItem?.(LEGACY_CONNECTION_SESSION_STORAGE_KEY);
    } catch {
      // The app can still create an in-memory connection code when browser storage is unavailable.
    }
    return null;
  }
}

export function writeStoredConnectionSession(session, storage = browserStorage()) {
  const code = normalizeConnectionCode(session?.code);
  if (!isValidConnectionCode(code)) {
    return false;
  }

  try {
    storage?.setItem?.(CONNECTION_SESSION_STORAGE_KEY, JSON.stringify({
      code
    }));
    storage?.removeItem?.(LEGACY_CONNECTION_SESSION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearStoredConnectionSession(storage = browserStorage()) {
  try {
    storage?.removeItem?.(CONNECTION_SESSION_STORAGE_KEY);
    storage?.removeItem?.(LEGACY_CONNECTION_SESSION_STORAGE_KEY);
  } catch {
    // The current in-memory connection code can still be replaced when storage is unavailable.
  }
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
