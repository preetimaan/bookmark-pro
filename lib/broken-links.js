/**
 * Check bookmarks for broken links via the background service worker.
 * The actual fetch happens in background.js to avoid CSP issues on the options page.
 */

/**
 * Check a single URL by sending a message to the background service worker.
 * @param {string} url
 * @returns {Promise<{ url: string, status: number|null, error: string|null, category: string }>}
 */
function checkUrl(url) {
  return chrome.runtime.sendMessage({ type: "checkUrl", url });
}

/**
 * Check multiple bookmarks in parallel (with concurrency limit).
 * @param {{ id: string, url: string, title: string }[]} bookmarks
 * @param {{ concurrency?: number, onProgress?: (checked: number, total: number) => void }} opts
 * @returns {Promise<{ id: string, url: string, title: string, status: number|null, error: string|null, category: string }[]>}
 */
async function checkBrokenLinks(bookmarks, opts = {}) {
  const { concurrency = 5, onProgress } = opts;
  const results = [];
  let checked = 0;
  const total = bookmarks.length;
  let i = 0;

  async function next() {
    while (i < total) {
      const bookmark = bookmarks[i++];
      const result = await checkUrl(bookmark.url);
      results.push({ ...bookmark, ...result });
      checked++;
      if (onProgress) onProgress(checked, total);
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(concurrency, total); w++) {
    workers.push(next());
  }
  await Promise.all(workers);
  return results;
}

/**
 * Group results by error category. Only returns non-ok groups.
 * @param {{ id: string, url: string, title: string, category: string, error: string|null }[]} results
 * @returns {{ category: string, label: string, items: typeof results }[]}
 */
function groupBrokenLinks(results) {
  const labels = {
    "404": "404 – Not Found",
    "403": "403 – Forbidden",
    "4xx": "Other 4xx errors",
    "5xx": "Server errors (5xx)",
    timeout: "Timeout",
    network_error: "Network / DNS errors",
    other: "Other errors",
  };
  const map = new Map();
  for (const r of results) {
    if (r.category === "ok") continue;
    if (!map.has(r.category)) map.set(r.category, []);
    map.get(r.category).push(r);
  }
  const order = ["404", "403", "4xx", "5xx", "timeout", "network_error", "other"];
  return order
    .filter((cat) => map.has(cat))
    .map((cat) => ({
      category: cat,
      label: labels[cat] || cat,
      items: map.get(cat),
    }));
}
