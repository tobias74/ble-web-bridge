export const APP_PAGES = ['bridge', 'about', 'privacy', 'imprint'];

export function pageFromHash(hash = '') {
  const page = String(hash).replace(/^#\/?/, '').trim().toLowerCase();
  return APP_PAGES.includes(page) ? page : 'bridge';
}

export function pageHref(page) {
  return `#${APP_PAGES.includes(page) ? page : 'bridge'}`;
}
