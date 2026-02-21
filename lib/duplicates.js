/**
 * Find exact duplicate URLs (same URL in multiple bookmarks).
 * Optional: normalize by stripping fragment and/or trailing slash.
 */

/**
 * Normalize URL for comparison.
 * @param {string} url
 * @param {{ stripFragment?: boolean, stripTrailingSlash?: boolean }} opts
 * @returns {string}
 */
function normalizeUrl(url, opts = {}) {
  const { stripFragment = true, stripTrailingSlash = true } = opts;
  let u = url;
  if (stripFragment && u.includes("#")) {
    u = u.split("#")[0];
  }
  if (stripTrailingSlash && u.length > 1 && u.endsWith("/")) {
    u = u.slice(0, -1);
  }
  return u;
}

/**
 * Group bookmarks by normalized URL. Only groups with > 1 entry are returned.
 * @param {{ id: string, url: string, title: string, parentId: string }[]} bookmarks
 * @param {{ stripFragment?: boolean, stripTrailingSlash?: boolean }} opts
 * @returns {{ normalizedUrl: string, items: { id: string, url: string, title: string, parentId: string }[] }[]}
 */
function findDuplicateGroups(bookmarks, opts = {}) {
  const map = new Map();
  for (const b of bookmarks) {
    if (!b.url || (!b.url.startsWith("http://") && !b.url.startsWith("https://"))) {
      continue;
    }
    const key = normalizeUrl(b.url, opts);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(b);
  }
  return Array.from(map.entries())
    .filter(([, items]) => items.length > 1)
    .map(([normalizedUrl, items]) => ({ normalizedUrl, items }));
}
