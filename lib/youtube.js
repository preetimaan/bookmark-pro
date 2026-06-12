/**
 * YouTube URL helpers and availability checks (broken-link checker + subset finder).
 */

/**
 * Extract YouTube video ID from URL, or null if not a video URL.
 * Handles watch, youtu.be, and shorts links.
 * @param {string} url
 * @returns {string|null}
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
    if (u.includes("youtube.com/shorts/")) {
      const match = u.match(/youtube\.com\/shorts\/([^/?&#]+)/);
      return match ? match[1] : null;
    }
    return null;
  } catch {
    return null;
  }
}

function youtubeWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/**
 * Parse playabilityStatus from a YouTube watch page HTML blob.
 * @param {string} html
 * @returns {{ status?: string, reason?: string }|null}
 */
function parsePlayabilityStatusFromHtml(html) {
  const marker = "var ytInitialPlayerResponse = ";
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) return null;
  let i = startIdx + marker.length;
  if (html[i] !== "{") return null;
  let depth = 0;
  for (let end = i; end < html.length; end++) {
    const c = html[end];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          const data = JSON.parse(html.slice(i, end + 1));
          return data.playabilityStatus || null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function formatPlayabilityError(playability) {
  if (!playability) return "Video unavailable";
  if (playability.reason) return playability.reason;
  if (playability.status && playability.status !== "OK") return playability.status;
  return "Video unavailable";
}

/**
 * Check whether a YouTube video URL is playable (page may load while video is removed).
 * Returns null when the URL is not a YouTube video link.
 * @param {string} url
 * @param {AbortSignal} signal
 * @returns {Promise<{ available: boolean, error?: string }|null>}
 */
async function checkYoutubeVideoAvailability(url, signal) {
  const videoId = getYoutubeVideoId(url);
  if (!videoId) return null;

  const watchUrl = youtubeWatchUrl(videoId);
  const oembedUrl =
    "https://www.youtube.com/oembed?url=" + encodeURIComponent(watchUrl) + "&format=json";

  try {
    const oembedResp = await fetch(oembedUrl, { signal, redirect: "follow" });
    if (oembedResp.ok) return { available: true };
  } catch (err) {
    if (err.name === "AbortError") throw err;
  }

  const pageResp = await fetch(watchUrl, {
    signal,
    redirect: "follow",
    headers: { "Accept-Language": "en" },
  });
  if (!pageResp.ok) {
    return { available: false, error: `YouTube page HTTP ${pageResp.status}` };
  }
  const html = await pageResp.text();
  const playability = parsePlayabilityStatusFromHtml(html);
  if (!playability) return { available: true };
  if (playability.status === "OK") return { available: true };
  return { available: false, error: formatPlayabilityError(playability) };
}
