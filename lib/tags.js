/**
 * Tag system: tags stored in chrome.storage.sync and encoded in bookmark titles.
 * Title format: "#tag1 #tag2 #tag3 Base Title" (tags at start with # prefix, sorted by priority then name).
 * Legacy format "Base Title [tag1, tag2]" is still parsed for backwards compatibility.
 */

const TAG_STORAGE_KEY = "bookmarkTags";
const PRIORITY_TAGS_KEY = "priorityTags";
const KNOWN_TAGS_KEY = "knownTagNames";
const TAG_SUFFIX_RE = /\s*\[([^\]]*)\]\s*$/;

// --- Title parsing ---

/** Parse title: supports "#tag1 #tag2 base title" and legacy "base title [tag1, tag2]". */
function parseTitle(fullTitle) {
  const s = typeof fullTitle === "string" ? fullTitle : "";
  // New format: leading #tag tokens
  const tagPrefixMatch = s.match(/^(\s*#\S+\s*)+/);
  if (tagPrefixMatch) {
    const prefix = tagPrefixMatch[0];
    const baseTitle = s.slice(prefix.length).trim();
    const tags = prefix.match(/#(\S+)/g) ? prefix.match(/#(\S+)/g).map((t) => t.slice(1).toLowerCase()) : [];
    return { baseTitle, tags };
  }
  // Legacy format: [tags] at end
  const match = s.match(TAG_SUFFIX_RE);
  if (!match) return { baseTitle: s.trim(), tags: [] };
  const baseTitle = s.slice(0, match.index).trim();
  const tags = match[1]
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return { baseTitle, tags };
}

/** Build title: "#tag1 #tag2 baseTitle" with tags sorted by priority then alphabetically. */
function buildTitle(baseTitle, tags, priorityMap = {}) {
  if (!tags || tags.length === 0) return (baseTitle || "").trim();
  const ordered = orderTags(tags, priorityMap);
  const prefix = ordered.map((t) => "#" + t).join(" ");
  const base = (baseTitle || "").trim();
  return base ? prefix + " " + base : prefix;
}

/** Default priority for tags not in priority map (shown after 1,2,3). */
const DEFAULT_TAG_PRIORITY = 100;

/** priorityMap: { tagName: number } with numbers 1,2,3. Tags with lower number first, then rest (100) A-Z. */
function orderTags(tags, priorityMap = {}) {
  const withPriority = tags.filter((t) => t in priorityMap).sort((a, b) => priorityMap[a] - priorityMap[b]);
  const rest = tags.filter((t) => !(t in priorityMap)).sort((a, b) => a.localeCompare(b));
  return [...withPriority, ...rest];
}

// --- Storage ---

async function loadAllTags() {
  const data = await chrome.storage.sync.get(TAG_STORAGE_KEY);
  return data[TAG_STORAGE_KEY] || {};
}

async function saveAllTags(tagMap) {
  await chrome.storage.sync.set({ [TAG_STORAGE_KEY]: tagMap });
}

async function getTagsForBookmark(bookmarkId) {
  const all = await loadAllTags();
  return all[bookmarkId] || [];
}

const MAX_PRIORITY_TAGS = 3;
const VALID_PRIORITIES = [1, 2, 3];

/** Returns { tagName: number } with numbers 1,2,3. Max 3 entries. Migrates from old array format. */
async function loadPriorityMap() {
  const data = await chrome.storage.sync.get(PRIORITY_TAGS_KEY);
  const raw = data[PRIORITY_TAGS_KEY];
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const map = {};
    raw.slice(0, MAX_PRIORITY_TAGS).forEach((tag, i) => {
      if (tag) map[tag] = i + 1;
    });
    await savePriorityMap(map);
    return map;
  }
  if (typeof raw === "object" && raw !== null) {
    const map = {};
    for (const [tag, num] of Object.entries(raw)) {
      const n = parseInt(num, 10);
      if (tag && VALID_PRIORITIES.includes(n)) map[tag] = n;
    }
    if (Object.keys(map).length > MAX_PRIORITY_TAGS) {
      const entries = Object.entries(map).sort((a, b) => a[1] - b[1]).slice(0, MAX_PRIORITY_TAGS);
      const trimmed = Object.fromEntries(entries);
      await savePriorityMap(trimmed);
      return trimmed;
    }
    return map;
  }
  return {};
}

async function savePriorityMap(map) {
  await chrome.storage.sync.set({ [PRIORITY_TAGS_KEY]: map });
}

/** Ordered list of tag names (by priority 1,2,3) for backward compat. */
async function loadPriorityTags() {
  const map = await loadPriorityMap();
  return Object.entries(map)
    .sort((a, b) => a[1] - b[1])
    .map(([tag]) => tag);
}

/** Set priority for a tag (1, 2, or 3). Pass null/0 to clear. Max 3 tags, numbers unique. Returns { ok, error }. */
async function setTagPriority(tag, num) {
  const map = await loadPriorityMap();
  delete map[tag];
  if (!num || !VALID_PRIORITIES.includes(Number(num))) {
    await savePriorityMap(map);
    return { ok: true };
  }
  const n = Number(num);
  for (const t of Object.keys(map)) {
    if (map[t] === n) delete map[t];
  }
  map[tag] = n;
  if (Object.keys(map).length > MAX_PRIORITY_TAGS) {
    const entries = Object.entries(map).sort((a, b) => a[1] - b[1]);
    const toRemove = entries[MAX_PRIORITY_TAGS];
    if (toRemove) delete map[toRemove[0]];
  }
  await savePriorityMap(map);
  return { ok: true };
}

/** Returns next free slot (1, 2, or 3) or null if all used. */
async function getNextPrioritySlot() {
  const map = await loadPriorityMap();
  for (const n of VALID_PRIORITIES) {
    if (!Object.values(map).includes(n)) return n;
  }
  return null;
}

/** Move a priority tag up or down. Returns { ok, error }. */
async function movePriority(tag, direction) {
  const map = await loadPriorityMap();
  if (!(tag in map)) return { ok: false, error: "Tag is not a priority tag." };
  const ordered = Object.entries(map)
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);
  const idx = ordered.indexOf(tag);
  if (idx < 0) return { ok: true };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= ordered.length) return { ok: true };
  const nextOrder = [...ordered];
  nextOrder[idx] = ordered[swapIdx];
  nextOrder[swapIdx] = ordered[idx];
  const newMap = {};
  nextOrder.forEach((t, i) => {
    newMap[t] = i + 1;
  });
  await savePriorityMap(newMap);
  return { ok: true };
}

// --- Tag operations ---

async function addTag(bookmarkId, tag) {
  const all = await loadAllTags();
  const tags = all[bookmarkId] || [];
  if (tags.includes(tag)) return tags;
  tags.push(tag);
  all[bookmarkId] = tags;
  await saveAllTags(all);
  await syncTitleForBookmark(bookmarkId, tags);
  return tags;
}

async function removeTag(bookmarkId, tag) {
  const all = await loadAllTags();
  const tags = (all[bookmarkId] || []).filter((t) => t !== tag);
  if (tags.length === 0) {
    delete all[bookmarkId];
  } else {
    all[bookmarkId] = tags;
  }
  await saveAllTags(all);
  await syncTitleForBookmark(bookmarkId, tags);
  return tags;
}

async function setTags(bookmarkId, tags) {
  const all = await loadAllTags();
  if (tags.length === 0) {
    delete all[bookmarkId];
  } else {
    all[bookmarkId] = [...tags];
  }
  await saveAllTags(all);
  await syncTitleForBookmark(bookmarkId, tags);
  return tags;
}

async function syncTitleForBookmark(bookmarkId, tags) {
  const id = bookmarkId != null ? String(bookmarkId) : "";
  if (!id) return;
  let node;
  try {
    const nodes = await chrome.bookmarks.get(id);
    node = nodes && nodes[0];
  } catch (err) {
    return;
  }
  if (!node || !node.url) return; // only sync real bookmarks (have url), not folders
  const currentTitle = typeof node.title === "string" ? node.title : "";
  const { baseTitle } = parseTitle(currentTitle);
  const priorityMap = await loadPriorityMap();
  const newTitle = buildTitle(baseTitle || currentTitle || "Bookmark", tags, priorityMap);
  if (newTitle === currentTitle) return;
  try {
    await chrome.bookmarks.update(id, { title: newTitle });
  } catch (err) {
    console.warn("Bookmark Pro: failed to update title", err);
  }
}

async function getAllUniqueTags() {
  const all = await loadAllTags();
  const set = new Set();
  for (const tags of Object.values(all)) {
    for (const t of tags) set.add(t);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

async function getKnownTagNames() {
  const data = await chrome.storage.sync.get(KNOWN_TAGS_KEY);
  return data[KNOWN_TAGS_KEY] || [];
}

async function addKnownTag(tag) {
  const names = await getKnownTagNames();
  if (names.includes(tag)) return;
  names.push(tag);
  names.sort((a, b) => a.localeCompare(b));
  await chrome.storage.sync.set({ [KNOWN_TAGS_KEY]: names });
}

async function removeKnownTag(tag) {
  const names = (await getKnownTagNames()).filter((t) => t !== tag);
  await chrome.storage.sync.set({ [KNOWN_TAGS_KEY]: names });
}

/** All tags to show in manager (in use + known). */
async function getAllTagsForManager() {
  const inUse = await getAllUniqueTags();
  const known = await getKnownTagNames();
  const set = new Set([...inUse, ...known]);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Number of bookmarks that have this tag. */
async function getTagCount(tag) {
  const all = await loadAllTags();
  let count = 0;
  for (const tags of Object.values(all)) {
    if (tags.includes(tag)) count++;
  }
  return count;
}

async function renameTagGlobally(oldTag, newTag) {
  const all = await loadAllTags();
  const priorityTags = await loadPriorityTags();
  const affected = [];
  for (const [id, tags] of Object.entries(all)) {
    const idx = tags.indexOf(oldTag);
    if (idx !== -1) {
      tags[idx] = newTag;
      all[id] = [...new Set(tags)];
      affected.push(id);
    }
  }
  await saveAllTags(all);
  const pIdx = priorityTags.indexOf(oldTag);
  if (pIdx !== -1) {
    priorityTags[pIdx] = newTag;
    await savePriorityTags(priorityTags);
  }
  const known = await getKnownTagNames();
  if (known.includes(oldTag)) {
    await removeKnownTag(oldTag);
    await addKnownTag(newTag);
  }
  for (const id of affected) {
    await syncTitleForBookmark(id, all[id] || []);
  }
  return affected.length;
}

async function deleteTagGlobally(tag) {
  const all = await loadAllTags();
  const affected = [];
  for (const [id, tags] of Object.entries(all)) {
    if (tags.includes(tag)) {
      all[id] = tags.filter((t) => t !== tag);
      if (all[id].length === 0) delete all[id];
      affected.push(id);
    }
  }
  await saveAllTags(all);
  const priorityMap = await loadPriorityMap();
  if (tag in priorityMap) {
    delete priorityMap[tag];
    await savePriorityMap(priorityMap);
  }
  await removeKnownTag(tag);
  for (const id of affected) {
    await syncTitleForBookmark(id, all[id] || []);
  }
  return affected.length;
}
