export function parseHash() {
  const raw = location.hash.slice(1) || '/';
  const [path, query = ''] = raw.split('?');
  return { path, query: new URLSearchParams(query) };
}

export function navigate(path, { replace = false } = {}) {
  if (replace) location.replace(`#${path}`);
  else location.hash = path;
}

/** Updates the URL without triggering a route change (used by in-page filters). */
export const replaceUrl = (path) => history.replaceState(null, '', `#${path}`);
