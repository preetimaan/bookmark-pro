/**
 * Tag system: tags stored in chrome.storage.sync and encoded in bookmark titles.
 * Title format: "Page Title [tag1, tag2, tag3]"
 * Priority tags appear first (in defined order), then remaining tags alphabetically.
 */

const TAG_STORAGE_KEY = "bookmarkTags";
const PRIORITY_TAGS_KEY = "priorityTags";
const TAG_SUFFIX_RE = /\s*\[([^\]]*)\]\s*$/;

// --- Title parsing ---

function parseTitle(fullTitle) {
  const match = fullTitle.match(TAG_SUFFIX_RE);
  if (!match) return { baseTitle: fullTitle, tags: [] };
  const baseTitle = fullTitle.slice(0, match.index).trim();
  const tags = match[1]
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return { baseTitle, tags };
}

function buildTitle(baseTitle, tags, priorityTags = []) {
  if (!tags || tags.length === 0) return baseTitle;
  const ordered = orderTags(tags, priorityTags);
  return `${baseTitle} [${ordered.join(", ")}]`;
}

function orderTags(tags, priorityTags = []) {
  const prioritySet = new Set(priorityTags);
  const priority = priorityTags.filter((t) => tags.includes(t));
  const rest = tags
    .filter((t) => !prioritySet.has(t))
    .sort((a, b) => a.localeCompare(b));
  return [...priority, ...rest];
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

async function loadPriorityTags() {
  const data = await chrome.storage.sync.get(PRIORITY_TAGS_KEY);
  return data[PRIORITY_TAGS_KEY] || [];
}

async function savePriorityTags(list) {
  await chrome.storage.sync.set({ [PRIORITY_TAGS_KEY]: list });
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
  const [node] = await chrome.bookmarks.get(bookmarkId);
  if (!node) return;
  const { baseTitle } = parseTitle(node.title);
  const priorityTags = await loadPriorityTags();
  const newTitle = buildTitle(baseTitle, tags, priorityTags);
  if (newTitle !== node.title) {
    await chrome.bookmarks.update(bookmarkId, { title: newTitle });
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
  const priorityTags = await loadPriorityTags();
  if (priorityTags.includes(tag)) {
    await savePriorityTags(priorityTags.filter((t) => t !== tag));
  }
  for (const id of affected) {
    await syncTitleForBookmark(id, all[id] || []);
  }
  return affected.length;
}
