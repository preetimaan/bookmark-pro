/**
 * Find bookmark URLs that are subset/prefix of another (e.g. example.com vs example.com/page).
 * Normalize: strip fragment, optional query, optional trailing slash.
 * YouTube: same video ID (v= or youtu.be/ID) groups together even with different playlist/query params.
 */

/**
 * Extract YouTube video ID from URL, or null if not YouTube / no video ID.
 * Handles youtube.com/watch?v=ID and youtu.be/ID.
 */
function getYoutubeVideoId(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = url.trim();
    if (u.includes("youtube.com/watch") && u.includes("v=")) {
      const match = u.match(/[?&]v=([^&#]+)/);
      return match ? match[1] : null;
    }
    if (u.includes("youtu.be/")) {
      const match = u.match(/youtu\.be\/([^/?&#]+)/);
      return match ? match[1] : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalize URL for subset comparison.
 * For YouTube URLs, returns a canonical key "youtube:VIDEO_ID" so same video with different playlist/params groups together.
 * @param {string} url
 * @param {{ stripFragment?: boolean, stripQuery?: boolean, stripTrailingSlash?: boolean }} opts
 * @returns {string}
 */
function normalizeUrlForSubset(url, opts = {}) {
  const youtubeId = getYoutubeVideoId(url);
  if (youtubeId) return "youtube:" + youtubeId;

  const {
    stripFragment = true,
    stripQuery = false,
    stripTrailingSlash = true,
  } = opts;
  let u = url;
  if (stripFragment && u.includes("#")) {
    u = u.split("#")[0];
  }
  if (stripQuery && u.includes("?")) {
    u = u.split("?")[0];
  }
  if (stripTrailingSlash && u.length > 1 && u.endsWith("/")) {
    u = u.slice(0, -1);
  }
  return u;
}

/**
 * True if normA is a prefix of normB with path boundary (equal or normB starts with normA + '/').
 */
function isPrefix(normA, normB) {
  if (normA === normB) return true;
  return normB.startsWith(normA + "/") || normB === normA + "/";
}

/**
 * Union-find: find root and union two elements.
 */
function unionFind(parent, a, b) {
  function find(x) {
    if (parent.get(x) === x) return x;
    const root = find(parent.get(x));
    parent.set(x, root);
    return root;
  }
  const ra = find(a);
  const rb = find(b);
  if (ra !== rb) parent.set(ra, rb);
}

/**
 * Find groups of bookmarks whose URLs are subsets of each other (transitive).
 * Only returns groups with at least 2 items.
 * @param {{ id: string, url: string, title: string, parentId: string }[]} bookmarks
 * @param {{ stripFragment?: boolean, stripQuery?: boolean, stripTrailingSlash?: boolean }} opts
 * @returns {{ items: { id: string, url: string, title: string, parentId: string, normalizedUrl: string }[] }[]}
 */
function findSubsetGroups(bookmarks, opts = {}) {
  const valid = bookmarks.filter(
    (b) =>
      b.url &&
      (b.url.startsWith("http://") || b.url.startsWith("https://"))
  );
  if (valid.length === 0) return [];

  const normalized = valid.map((b) => ({
    ...b,
    normalizedUrl: normalizeUrlForSubset(b.url, opts),
  }));

  const parent = new Map();
  normalized.forEach((b, i) => parent.set(i, i));

  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const ni = normalized[i].normalizedUrl;
      const nj = normalized[j].normalizedUrl;
      if (isPrefix(ni, nj) || isPrefix(nj, ni)) {
        unionFind(parent, i, j);
      }
    }
  }

  const rootToIndices = new Map();
  normalized.forEach((_, i) => {
    let r = i;
    while (parent.get(r) !== r) r = parent.get(r);
    if (!rootToIndices.has(r)) rootToIndices.set(r, []);
    rootToIndices.get(r).push(i);
  });

  return Array.from(rootToIndices.values())
    .filter((indices) => indices.length > 1)
    .map((indices) => ({
      items: indices.map((i) => normalized[i]).sort(
        (a, b) => a.normalizedUrl.length - b.normalizedUrl.length
      ),
    }));
}
