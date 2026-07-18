export function getDefaultRelayUrl() {
  if (import.meta.env.VITE_RELAY_BASE_URL) {
    return trimTrailingSlash(import.meta.env.VITE_RELAY_BASE_URL);
  }

  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:8787`;
  }

  return window.location.origin;
}

export async function createSession(relayBaseUrl) {
  const response = await fetch(`${trimTrailingSlash(relayBaseUrl)}/v1/sessions`, {
    method: 'POST'
  });

  if (!response.ok) {
    throw new Error(`Session creation failed (${response.status})`);
  }

  return response.json();
}

export function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}
