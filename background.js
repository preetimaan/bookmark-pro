chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

const BROKEN_LINK_TIMEOUT_MS = 10000;

function randomDelay(minMs = 500, maxMs = 2000) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classify(url, status) {
  if (status >= 200 && status < 400) return { url, status, error: null, category: "ok" };
  if (status === 429) return { url, status, error: null, category: "ok" };
  if (status === 404) return { url, status, error: "Not Found", category: "404" };
  if (status === 403) return { url, status, error: "Forbidden", category: "403" };
  if (status >= 400 && status < 500) return { url, status, error: `Client error ${status}`, category: "4xx" };
  if (status >= 500) return { url, status, error: `Server error ${status}`, category: "5xx" };
  return { url, status, error: `HTTP ${status}`, category: "other" };
}

async function checkUrlInBackground(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BROKEN_LINK_TIMEOUT_MS);
  try {
    const headResp = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    if (headResp.status < 400) {
      clearTimeout(timer);
      return classify(url, headResp.status);
    }
    // HEAD failed — wait random 500–2000ms then retry with GET (some servers reject HEAD)
    await randomDelay();
    const getResp = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    return classify(url, getResp.status);
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      return { url, status: null, error: "Timeout", category: "timeout" };
    }
    return { url, status: null, error: err.message || "Network error", category: "network_error" };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "checkUrl") {
    checkUrlInBackground(msg.url).then(sendResponse);
    return true;
  }
});
