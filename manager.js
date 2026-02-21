/**
 * Bookmark Pro manager: top-level tabs (Bookmarks | Cleanup),
 * folder tree, bookmark list, and all cleanup tools.
 */

let bookmarksData = null;
let selectedFolderId = null;

const FOLDER_OUTLINE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';

function tagToStyle(tag) {
  let h = 0;
  const s = (tag || "").toString();
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  const hue = Math.abs(h % 360);
  const bg = `hsl(${hue}, 45%, 35%)`;
  const text = "#fff";
  return { background: bg, color: text };
}

function tagPillHtml(bmId, tag) {
  const style = tagToStyle(tag);
  const styleStr = `background:${style.background};color:${style.color}`;
  return `<span class="tag-pill" style="${styleStr}">${escapeHtml(tag)}<span class="tag-remove" data-bm-id="${bmId}" data-tag="${escapeHtml(tag)}">✕</span></span>`;
}

function $(id) {
  return document.getElementById(id);
}

function showToast(message) {
  const el = $("toast");
  el.textContent = message;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 3000);
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// --- Load data ---
async function ensureData() {
  if (!bookmarksData) {
    bookmarksData = await loadBookmarks();
  }
  return bookmarksData;
}

function invalidateData() {
  bookmarksData = null;
}

// =====================================================
// TOP-LEVEL TABS: Bookmarks | Cleanup
// =====================================================
document.querySelectorAll(".top-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".top-tabs button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    const view = $("view-" + btn.dataset.view);
    if (view) view.classList.add("active");
    if (btn.dataset.view === "tags") {
      renderTagsList();
    } else if (btn.dataset.view === "bookmarks") {
      invalidateData();
      renderFolderTree();
      if (selectedFolderId) renderBookmarkList(selectedFolderId);
    }
  });
});

// =====================================================
// CLEANUP SUB-TABS
// =====================================================
document.querySelectorAll("#cleanup-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#cleanup-tabs button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll("#view-cleanup .panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $("panel-" + btn.dataset.tab).classList.add("active");
  });
});

// =====================================================
// BOOKMARKS VIEW: Folder tree + bookmark list
// =====================================================

const EXPANDED_FOLDERS_KEY = "bookmarkProExpandedFolders";

function getExpandedFolderIds() {
  try {
    const raw = sessionStorage.getItem(EXPANDED_FOLDERS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function setExpandedFolderIds(ids) {
  try {
    sessionStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify([...ids]));
  } catch (_) {}
}

function isFolderExpanded(folderId) {
  return getExpandedFolderIds().has(folderId);
}

function setFolderExpanded(folderId, expanded) {
  const ids = getExpandedFolderIds();
  if (expanded) ids.add(folderId);
  else ids.delete(folderId);
  setExpandedFolderIds(ids);
}

async function renderFolderTree() {
  const { tree } = await ensureData();
  const container = $("folder-tree");
  container.innerHTML = "";
  if (tree.children) {
    for (const child of tree.children) {
      container.appendChild(buildFolderNode(child));
    }
  }
}

function buildFolderNode(node) {
  if (!node.children) return document.createDocumentFragment();

  const li = document.createElement("li");
  const row = document.createElement("div");
  row.className = "folder-row";
  row.dataset.folderId = node.id;

  const hasSubfolders = node.children.some((c) => c.children);
  const bookmarkCount = node.children.filter((c) => c.url).length;
  const isMixed = hasSubfolders && bookmarkCount > 0;
  const expanded = hasSubfolders && isFolderExpanded(node.id);

  row.innerHTML = `
    <span class="arrow">${hasSubfolders ? (expanded ? "▼" : "▶") : ""}</span>
    <span class="folder-name">${escapeHtml(node.title || "Bookmarks")}</span>
    <span class="folder-count">${isMixed || bookmarkCount === 0 ? "" : bookmarkCount}</span>
  `;

  row.addEventListener("click", (e) => {
    e.stopPropagation();
    selectFolder(node.id);
    if (hasSubfolders) {
      const subList = li.querySelector(":scope > ul");
      if (subList) {
        const isOpen = subList.style.display !== "none";
        subList.style.display = isOpen ? "none" : "block";
        row.querySelector(".arrow").textContent = isOpen ? "▶" : "▼";
        setFolderExpanded(node.id, !isOpen);
      }
    }
  });

  li.appendChild(row);

  const subFolders = node.children.filter((c) => c.children);
  if (subFolders.length > 0) {
    const ul = document.createElement("ul");
    ul.style.display = expanded ? "block" : "none";
    for (const child of subFolders) {
      ul.appendChild(buildFolderNode(child));
    }
    li.appendChild(ul);
  }

  return li;
}

function selectFolder(folderId) {
  selectedFolderId = folderId;
  document.querySelectorAll(".folder-row").forEach((r) => {
    r.classList.toggle("selected", r.dataset.folderId === folderId);
  });
  renderBookmarkList(folderId);
}

async function renderBookmarkList(folderId) {
  const children = await chrome.bookmarks.getChildren(folderId);
  const folders = children.filter((c) => !c.url);
  const bookmarks = children.filter((c) => c.url);
  const container = $("bookmark-list");
  const allTags = await loadAllTags();

  if (folders.length === 0 && bookmarks.length === 0) {
    container.innerHTML = '<div class="empty-state">This folder is empty.</div>';
    return;
  }

  container.innerHTML = "";

  for (const folder of folders) {
    const entry = document.createElement("div");
    entry.className = "folder-entry";
    entry.dataset.folderId = folder.id;
    entry.innerHTML = `
      <span class="folder-icon" aria-hidden="true">${FOLDER_OUTLINE_SVG}</span>
      <span class="folder-entry-name">${escapeHtml(folder.title)}</span>
    `;
    entry.addEventListener("click", () => {
      selectFolder(folder.id);
      const treeRow = document.querySelector(`.folder-row[data-folder-id="${folder.id}"]`);
      if (treeRow) {
        treeRow.click();
      }
    });
    container.appendChild(entry);
  }

  for (const bm of bookmarks) {
    const { baseTitle } = parseTitle(bm.title);
    const tags = allTags[bm.id] || [];
    const dateStr = bm.dateAdded ? new Date(bm.dateAdded).toLocaleDateString() : "";

    const row = document.createElement("div");
    row.className = "bookmark-row";
    row.dataset.id = bm.id;
    const tagPills = tags.map((t) => tagPillHtml(bm.id, t)).join("");
    row.innerHTML = `
      <input type="checkbox" data-bm-id="${bm.id}" />
      <div class="bookmark-info">
        <div class="bookmark-title">${escapeHtml(baseTitle)}</div>
        <a class="bookmark-url" href="${escapeHtml(bm.url)}" target="_blank" rel="noopener">${escapeHtml(bm.url)}</a>
        <div class="bookmark-tags">
          ${tagPills}
          <span class="tag-input-wrap">
            <input type="text" class="tag-add-input" data-bm-id="${bm.id}" placeholder="+ tag" />
            <div class="tag-autocomplete"></div>
          </span>
        </div>
      </div>
      <span class="bookmark-date">${dateStr}</span>
    `;
    container.appendChild(row);
  }

  updateSelectionCount();
}

// --- Inline editing ---
$("bookmark-list").addEventListener("dblclick", (e) => {
  const titleEl = e.target.closest(".bookmark-title");
  const urlEl = e.target.closest(".bookmark-url");
  const target = titleEl || urlEl;
  if (!target || target.isContentEditable) return;

  const row = target.closest(".bookmark-row");
  if (!row) return;
  const bmId = row.dataset.id;

  target.setAttribute("contenteditable", "true");
  target.classList.add("editing");
  target.focus();

  const sel = window.getSelection();
  sel.selectAllChildren(target);

  async function commit() {
    target.removeAttribute("contenteditable");
    target.classList.remove("editing");
    target.removeEventListener("blur", commit);
    target.removeEventListener("keydown", onKey);

    const newValue = target.textContent.trim();
    if (!newValue) {
      if (selectedFolderId) renderBookmarkList(selectedFolderId);
      return;
    }

    try {
      if (titleEl) {
        const tags = await getTagsForBookmark(bmId);
        const priorityTags = await loadPriorityTags();
        const newTitle = buildTitle(newValue, tags, priorityTags);
        await chrome.bookmarks.update(bmId, { title: newTitle });
      } else {
        await chrome.bookmarks.update(bmId, { url: newValue });
      }
      invalidateData();
    } catch (err) {
      showToast("Failed to save: " + err.message);
      if (selectedFolderId) renderBookmarkList(selectedFolderId);
    }
  }

  function onKey(e) {
    if (e.key === "Enter") { e.preventDefault(); target.blur(); }
    if (e.key === "Escape") {
      target.removeEventListener("blur", commit);
      target.removeEventListener("keydown", onKey);
      target.removeAttribute("contenteditable");
      target.classList.remove("editing");
      if (selectedFolderId) renderBookmarkList(selectedFolderId);
    }
  }

  target.addEventListener("blur", commit, { once: true });
  target.addEventListener("keydown", onKey);
});

// --- Selection ---
let selectAllInProgress = false;
$("bookmark-list").addEventListener("change", (e) => {
  if (selectAllInProgress) return;
  if (e.target.matches('input[data-bm-id]')) {
    const row = e.target.closest(".bookmark-row");
    if (row) row.classList.toggle("selected", e.target.checked);
    updateSelectionCount();
  }
});

function getSelectedIds() {
  return Array.from(document.querySelectorAll('#bookmark-list input[data-bm-id]:checked'))
    .map((cb) => cb.dataset.bmId);
}

function updateSelectionCount() {
  const ids = getSelectedIds();
  $("selection-count").textContent = `${ids.length} selected`;
  $("bottom-bar").classList.toggle("visible", ids.length > 0);
  const allCbs = document.querySelectorAll('#bookmark-list input[data-bm-id]');
  $("select-all-bm").checked = allCbs.length > 0 && ids.length === allCbs.length;
}

// --- Select all (toggle: select all or deselect all) ---
$("select-all-bm").addEventListener("change", function () {
  selectAllInProgress = true;
  const allCbs = document.querySelectorAll('#bookmark-list input[data-bm-id]');
  const allChecked = allCbs.length > 0 && Array.from(allCbs).every((cb) => cb.checked);
  const newState = !allChecked;
  allCbs.forEach((cb) => {
    cb.checked = newState;
    const row = cb.closest(".bookmark-row");
    if (row) row.classList.toggle("selected", newState);
  });
  $("select-all-bm").checked = newState;
  updateSelectionCount();
  requestAnimationFrame(() => {
    selectAllInProgress = false;
    $("select-all-bm").checked = allCbs.length > 0 && Array.from(allCbs).every((cb) => cb.checked);
  });
});

// --- Deselect all ---
$("bulk-deselect").addEventListener("click", () => {
  document.querySelectorAll('#bookmark-list input[data-bm-id]:checked').forEach((cb) => {
    cb.checked = false;
    const row = cb.closest(".bookmark-row");
    if (row) row.classList.remove("selected");
  });
  updateSelectionCount();
});

// --- Bulk delete ---
$("bulk-delete").addEventListener("click", async () => {
  const ids = getSelectedIds();
  if (ids.length === 0) return;
  if (!confirm(`Delete ${ids.length} selected bookmark(s)? This cannot be undone.`)) return;
  for (const id of ids) {
    await chrome.bookmarks.remove(id);
  }
  invalidateData();
  showToast(`Deleted ${ids.length} bookmark(s).`);
  if (selectedFolderId) renderBookmarkList(selectedFolderId);
  renderFolderTree();
});

// --- Tag input on bookmark rows ---
$("bookmark-list").addEventListener("click", async (e) => {
  const removeBtn = e.target.closest(".tag-remove");
  if (removeBtn) {
    const bmId = removeBtn.dataset.bmId;
    const tag = removeBtn.dataset.tag;
    await removeTag(bmId, tag);
    invalidateData();
    if (selectedFolderId) renderBookmarkList(selectedFolderId);
    return;
  }
});

$("bookmark-list").addEventListener("keydown", async (e) => {
  const input = e.target.closest(".tag-add-input");
  if (!input) return;
  const wrap = input.closest(".tag-input-wrap");
  const dropdown = wrap.querySelector(".tag-autocomplete");

  if (e.key === "Enter") {
    e.preventDefault();
    const tag = input.value.trim().toLowerCase();
    if (!tag) return;
    const bmId = input.dataset.bmId;
    await addTag(bmId, tag);
    invalidateData();
    input.value = "";
    if (dropdown) dropdown.classList.remove("visible");
    if (selectedFolderId) renderBookmarkList(selectedFolderId);
  }
  if (e.key === "Escape") {
    input.value = "";
    if (dropdown) dropdown.classList.remove("visible");
    input.blur();
  }
});

$("bookmark-list").addEventListener("input", async (e) => {
  const input = e.target.closest(".tag-add-input");
  if (!input) return;
  const wrap = input.closest(".tag-input-wrap");
  const dropdown = wrap.querySelector(".tag-autocomplete");
  const query = input.value.trim().toLowerCase();

  if (!query) {
    dropdown.classList.remove("visible");
    return;
  }

  const allTags = await getAllUniqueTags();
  const matches = allTags.filter((t) => t.toLowerCase().includes(query));
  if (matches.length === 0) {
    dropdown.classList.remove("visible");
    return;
  }

  dropdown.innerHTML = "";
  matches.slice(0, 8).forEach((tag) => {
    const opt = document.createElement("div");
    opt.textContent = tag;
    opt.addEventListener("mousedown", async (ev) => {
      ev.preventDefault();
      const bmId = input.dataset.bmId;
      await addTag(bmId, tag);
      invalidateData();
      input.value = "";
      dropdown.classList.remove("visible");
      if (selectedFolderId) renderBookmarkList(selectedFolderId);
    });
    dropdown.appendChild(opt);
  });
  dropdown.classList.add("visible");
});

$("bookmark-list").addEventListener("focusout", (e) => {
  const input = e.target.closest(".tag-add-input");
  if (!input) return;
  const wrap = input.closest(".tag-input-wrap");
  const dropdown = wrap.querySelector(".tag-autocomplete");
  setTimeout(() => dropdown.classList.remove("visible"), 150);
});

// --- Settings modal ---
$("settings-btn").addEventListener("click", () => {
  $("settings-modal").classList.add("visible");
  renderPriorityList();
});
$("settings-close").addEventListener("click", () => {
  $("settings-modal").classList.remove("visible");
});
$("settings-modal").addEventListener("click", (e) => {
  if (e.target === $("settings-modal")) $("settings-modal").classList.remove("visible");
});

async function renderPriorityList() {
  const tags = await loadPriorityTags();
  const container = $("priority-list");
  container.innerHTML = "";
  if (tags.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;">No priority tags set.</div>';
    return;
  }
  tags.forEach((tag, i) => {
    const item = document.createElement("div");
    item.className = "priority-item";
    item.innerHTML = `
      <span>${i + 1}.</span>
      <span style="flex:1">${escapeHtml(tag)}</span>
      <span class="remove-priority" data-tag="${escapeHtml(tag)}">✕</span>
    `;
    container.appendChild(item);
  });
}

$("priority-list").addEventListener("click", async (e) => {
  const btn = e.target.closest(".remove-priority");
  if (!btn) return;
  const tag = btn.dataset.tag;
  const tags = await loadPriorityTags();
  await savePriorityTags(tags.filter((t) => t !== tag));
  renderPriorityList();
});

$("add-priority-btn").addEventListener("click", async () => {
  const input = $("priority-input");
  const tag = input.value.trim().toLowerCase();
  if (!tag) return;
  const tags = await loadPriorityTags();
  if (tags.includes(tag)) {
    showToast("Tag already in priority list.");
    return;
  }
  tags.push(tag);
  await savePriorityTags(tags);
  input.value = "";
  renderPriorityList();
});

$("priority-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("add-priority-btn").click();
  }
});

// --- Tags tab ---
async function renderTagsList() {
  const tags = await getAllTagsForManager();
  const container = $("tags-list");
  if (!container) return;
  if (tags.length === 0) {
    container.innerHTML = '<div class="empty-state">No tags yet. Add a tag name above or tag bookmarks in the Bookmarks tab.</div>';
    return;
  }
  container.innerHTML = "";
  for (const tag of tags) {
    const count = await getTagCount(tag);
    const style = tagToStyle(tag);
    const row = document.createElement("div");
    row.className = "tag-manager-row";
    row.innerHTML = `
      <span class="tag-pill-display" style="background:${style.background};color:${style.color}">${escapeHtml(tag)}</span>
      <span class="tag-count">${count} bookmark(s)</span>
      <span class="tag-actions">
        <button type="button" class="small" data-tag-rename="${escapeHtml(tag)}">Rename</button>
        <button type="button" class="small" data-tag-delete="${escapeHtml(tag)}">Delete</button>
      </span>
    `;
    container.appendChild(row);
  }
}

$("tags-add-btn").addEventListener("click", async () => {
  const input = $("new-tag-name");
  const tag = (input.value || "").trim().toLowerCase();
  if (!tag) return;
  await addKnownTag(tag);
  input.value = "";
  showToast(`Tag "${tag}" added. Add it to bookmarks from the Bookmarks tab.`);
  renderTagsList();
});

document.getElementById("new-tag-name")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("tags-add-btn").click();
});

function setTagsBusy(show) {
  const el = $("tags-busy");
  if (el) el.style.display = show ? "flex" : "none";
}

$("tags-list").addEventListener("click", async (e) => {
  const renameBtn = e.target.closest("[data-tag-rename]");
  const deleteBtn = e.target.closest("[data-tag-delete]");
  if (renameBtn) {
    const oldTag = renameBtn.dataset.tagRename;
    const newTag = (prompt("Rename tag to:", oldTag) || "").trim().toLowerCase();
    if (!newTag || newTag === oldTag) return;
    setTagsBusy(true);
    try {
      await renameTagGlobally(oldTag, newTag);
      invalidateData();
      if (selectedFolderId) await renderBookmarkList(selectedFolderId);
      renderTagsList();
      showToast(`Renamed "${oldTag}" to "${newTag}".`);
    } finally {
      setTagsBusy(false);
    }
  } else if (deleteBtn) {
    const tag = deleteBtn.dataset.tagDelete;
    const count = await getTagCount(tag);
    if (!confirm(`Remove tag "${tag}" from ${count} bookmark(s)?`)) return;
    setTagsBusy(true);
    try {
      await deleteTagGlobally(tag);
      invalidateData();
      if (selectedFolderId) await renderBookmarkList(selectedFolderId);
      renderTagsList();
      showToast(`Deleted tag "${tag}".`);
    } finally {
      setTagsBusy(false);
    }
  }
});

// --- Bulk move ---
let moveTargetId = null;

$("bulk-move").addEventListener("click", async () => {
  const ids = getSelectedIds();
  if (ids.length === 0) return;
  moveTargetId = null;
  const { tree } = await ensureData();
  const container = $("move-folder-tree");
  container.innerHTML = "";
  renderMoveFolderTree(container, tree, 0);
  $("move-modal").classList.add("visible");
});

function renderMoveFolderTree(container, node, depth) {
  if (node.children) {
    for (const child of node.children) {
      if (!child.children) continue;
      const div = document.createElement("div");
      div.className = "move-tree-item";
      div.style.paddingLeft = (12 + depth * 20) + "px";
      div.textContent = child.title || "Bookmarks";
      div.dataset.folderId = child.id;
      div.addEventListener("click", () => {
        container.querySelectorAll(".move-tree-item").forEach((d) => d.classList.remove("selected"));
        div.classList.add("selected");
        moveTargetId = child.id;
      });
      container.appendChild(div);
      renderMoveFolderTree(container, child, depth + 1);
    }
  }
}

$("move-cancel").addEventListener("click", () => {
  $("move-modal").classList.remove("visible");
});

$("move-modal").addEventListener("click", (e) => {
  if (e.target === $("move-modal")) $("move-modal").classList.remove("visible");
});

$("move-confirm").addEventListener("click", async () => {
  if (!moveTargetId) { showToast("Select a folder first."); return; }
  const ids = getSelectedIds();
  for (const id of ids) {
    await chrome.bookmarks.move(id, { parentId: moveTargetId });
  }
  invalidateData();
  $("move-modal").classList.remove("visible");
  showToast(`Moved ${ids.length} bookmark(s).`);
  renderFolderTree();
  if (selectedFolderId) renderBookmarkList(selectedFolderId);
});

// --- Bulk tag ---
$("bulk-tag").addEventListener("click", async () => {
  const ids = getSelectedIds();
  if (ids.length === 0) return;
  const tag = prompt("Enter tag to add to selected bookmarks:");
  if (!tag || !tag.trim()) return;
  const cleaned = tag.trim().toLowerCase();
  for (const id of ids) {
    await addTag(id, cleaned);
  }
  invalidateData();
  showToast(`Tagged ${ids.length} bookmark(s) with "${cleaned}".`);
  if (selectedFolderId) renderBookmarkList(selectedFolderId);
});

// --- Search ---
let searchTimeout = null;
$("search-input").addEventListener("input", () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const query = $("search-input").value.trim().toLowerCase();
    if (!query) {
      if (selectedFolderId) renderBookmarkList(selectedFolderId);
      return;
    }
    searchBookmarks(query);
  }, 250);
});

async function searchBookmarks(query) {
  const { bookmarks } = await ensureData();
  const allTags = await loadAllTags();

  const results = bookmarks.filter((bm) => {
    const { baseTitle } = parseTitle(bm.title);
    const tags = allTags[bm.id] || [];
    return (
      baseTitle.toLowerCase().includes(query) ||
      bm.url.toLowerCase().includes(query) ||
      tags.some((t) => t.toLowerCase().includes(query))
    );
  });

  const container = $("bookmark-list");
  if (results.length === 0) {
    container.innerHTML = '<div class="empty-state">No bookmarks match your search.</div>';
    return;
  }

  container.innerHTML = "";
  for (const bm of results) {
    const { baseTitle } = parseTitle(bm.title);
    const tags = allTags[bm.id] || [];
    const dateStr = bm.dateAdded ? new Date(bm.dateAdded).toLocaleDateString() : "";
    const tagPills = tags.map((t) => tagPillHtml(bm.id, t)).join("");

    const row = document.createElement("div");
    row.className = "bookmark-row";
    row.dataset.id = bm.id;
    row.innerHTML = `
      <input type="checkbox" data-bm-id="${bm.id}" />
      <div class="bookmark-info">
        <div class="bookmark-title">${escapeHtml(baseTitle)}</div>
        <a class="bookmark-url" href="${escapeHtml(bm.url)}" target="_blank" rel="noopener">${escapeHtml(bm.url)}</a>
        <div class="bookmark-tags">
          ${tagPills}
          <span class="tag-input-wrap">
            <input type="text" class="tag-add-input" data-bm-id="${bm.id}" placeholder="+ tag" />
            <div class="tag-autocomplete"></div>
          </span>
        </div>
      </div>
      <span class="bookmark-date">${dateStr}</span>
    `;
    container.appendChild(row);
  }
  updateSelectionCount();
}

// --- Init ---
renderFolderTree();

// =====================================================
// CLEANUP TOOLS (ported from options.js)
// =====================================================

function syncSelectAll(group) {
  const selectAllCb = group.querySelector("[data-dup-select-all], [data-subset-select-all]");
  if (!selectAllCb) return;
  const items = group.querySelectorAll(":scope > .item input[type=checkbox]");
  const allChecked = items.length > 0 && Array.from(items).every((cb) => cb.checked);
  selectAllCb.checked = allChecked;
}

// --- Duplicates ---
let duplicateGroups = [];

$("dup-results").addEventListener("change", function (e) {
  if (e.target.hasAttribute("data-dup-select-all")) {
    const group = e.target.closest(".group");
    if (!group) return;
    group.querySelectorAll(":scope > .item input[type=checkbox]").forEach((cb) => {
      cb.checked = e.target.checked;
    });
    return;
  }
  const group = e.target.closest(".group");
  if (group) syncSelectAll(group);
});

$("scan-duplicates").addEventListener("click", async () => {
  const status = $("dup-status");
  status.textContent = "Scanning…";
  status.className = "loading";
  $("dup-results").innerHTML = "";
  $("dup-actions").style.display = "none";

  const { bookmarks } = await ensureData();
  duplicateGroups = findDuplicateGroups(bookmarks);

  status.textContent =
    duplicateGroups.length === 0
      ? "No duplicate URLs found."
      : `Found ${duplicateGroups.length} group(s) of duplicates.`;
  status.className = "";
  if (duplicateGroups.length === 0) return;

  const container = $("dup-results");
  duplicateGroups.forEach((group, gi) => {
    const div = document.createElement("div");
    div.className = "group";
    div.innerHTML = `<div class="group-header"><label><input type="checkbox" data-dup-select-all /> Select all</label></div>`;
    group.items.forEach((item, ii) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "item";
      itemDiv.innerHTML = `
        <input type="checkbox" data-dup-id="${item.id}" data-group="${gi}" data-item="${ii}" />
        <div>
          <div class="item-title">${escapeHtml(item.title)}</div>
          <a class="item-url" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.url)}</a>
        </div>
      `;
      div.appendChild(itemDiv);
    });
    container.appendChild(div);
  });
  $("dup-actions").style.display = "block";
});

$("dup-delete").addEventListener("click", async () => {
  const checked = document.querySelectorAll('input[data-dup-id]:checked');
  if (checked.length === 0) { showToast("Select at least one bookmark to delete."); return; }
  if (!confirm(`Delete ${checked.length} selected bookmark(s)? This cannot be undone.`)) return;
  for (const el of checked) await chrome.bookmarks.remove(el.dataset.dupId);
  invalidateData();
  showToast(`Deleted ${checked.length} bookmark(s).`);
  $("scan-duplicates").click();
});

// --- Empty folders ---
let emptyFolderList = [];

$("scan-empty").addEventListener("click", async () => {
  const status = $("empty-status");
  status.textContent = "Scanning…";
  status.className = "loading";
  $("empty-results").innerHTML = "";
  $("empty-actions").style.display = "none";

  const { bookmarks, folders, tree } = await ensureData();
  const emptyIds = findEmptyFolders(folders, bookmarks);
  emptyFolderList = getEmptyFolderDetails(emptyIds, folders, tree);

  status.textContent = emptyFolderList.length === 0
    ? "No empty folders found."
    : `Found ${emptyFolderList.length} empty folder(s).`;
  status.className = "";
  if (emptyFolderList.length === 0) return;

  const container = $("empty-results");
  const group = document.createElement("div");
  group.className = "group";
  group.innerHTML = '<div class="group-header"><label><input type="checkbox" id="empty-select-all" /> Select all</label></div>';
  emptyFolderList.forEach((f) => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "item";
    itemDiv.innerHTML = `
      <input type="checkbox" data-empty-id="${f.id}" />
      <div><div class="item-title">${escapeHtml(f.title)}</div><div class="item-url">${escapeHtml(f.path)}</div></div>
    `;
    group.appendChild(itemDiv);
  });
  container.appendChild(group);
  $("empty-select-all").addEventListener("change", function () {
    document.querySelectorAll('input[data-empty-id]').forEach((cb) => { cb.checked = this.checked; });
  });
  $("empty-actions").style.display = "block";
});

$("empty-delete").addEventListener("click", async () => {
  const checked = document.querySelectorAll('input[data-empty-id]:checked');
  if (checked.length === 0) { showToast("Select at least one folder to delete."); return; }
  if (!confirm(`Delete ${checked.length} selected empty folder(s)? This cannot be undone.`)) return;
  for (const el of checked) await chrome.bookmarks.remove(el.dataset.emptyId);
  invalidateData();
  showToast(`Deleted ${checked.length} folder(s).`);
  $("scan-empty").click();
});

// --- Merge folders ---
let mergeCandidates = [];

$("scan-merge").addEventListener("click", async () => {
  const status = $("merge-status");
  status.textContent = "Scanning…";
  status.className = "loading";
  $("merge-results").innerHTML = "";
  $("merge-actions").style.display = "none";

  const { folders, tree } = await ensureData();
  mergeCandidates = findMergeCandidates(folders);

  status.textContent = mergeCandidates.length === 0
    ? "No merge candidates found."
    : `Found ${mergeCandidates.length} group(s) of same-name folders.`;
  status.className = "";
  if (mergeCandidates.length === 0) return;

  const container = $("merge-results");
  mergeCandidates.forEach((group, gi) => {
    const div = document.createElement("div");
    div.className = "group";
    const paths = group.folderIds.map((id) => getFolderPath(id, folders, tree));
    div.innerHTML = `<div class="group-header"><strong>${escapeHtml(group.title)}</strong> (${group.folderIds.length} folders) — choose one to keep.</div>`;
    group.folderIds.forEach((folderId, fi) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "item";
      itemDiv.innerHTML = `
        <input type="radio" name="merge-keep-${gi}" value="${folderId}" ${fi === 0 ? "checked" : ""} />
        <div><span class="item-title">${escapeHtml(paths[fi])}</span><span class="merge-target">${fi === 0 ? " (keep this one)" : ""}</span></div>
      `;
      itemDiv.querySelector("input").addEventListener("change", function () {
        div.querySelectorAll("input[type=radio]").forEach((r) => {
          const t = r.nextElementSibling?.querySelector(".merge-target");
          if (t) t.textContent = r.checked ? " (keep this one)" : "";
        });
      });
      div.appendChild(itemDiv);
    });
    container.appendChild(div);
  });
  $("merge-actions").style.display = "block";
});

$("merge-do").addEventListener("click", async () => {
  let merged = 0;
  for (let gi = 0; gi < mergeCandidates.length; gi++) {
    const group = mergeCandidates[gi];
    const keepId = document.querySelector(`input[name="merge-keep-${gi}"]:checked`)?.value;
    if (!keepId) continue;
    for (const folderId of group.folderIds.filter((id) => id !== keepId)) {
      const children = await chrome.bookmarks.getChildren(folderId);
      for (const child of children) await chrome.bookmarks.move(child.id, { parentId: keepId });
      await chrome.bookmarks.remove(folderId);
      merged++;
    }
  }
  invalidateData();
  showToast(`Merged folders. Removed ${merged} duplicate folder(s).`);
  $("scan-merge").click();
});

// --- Similar / subset URLs ---
let subsetGroups = [];

$("subset-results").addEventListener("change", function (e) {
  if (e.target.hasAttribute("data-subset-select-all")) {
    const group = e.target.closest(".group");
    if (!group) return;
    group.querySelectorAll(":scope > .item input[type=checkbox]").forEach((cb) => { cb.checked = e.target.checked; });
    return;
  }
  const group = e.target.closest(".group");
  if (group) syncSelectAll(group);
});

$("scan-subset").addEventListener("click", async () => {
  const status = $("subset-status");
  status.textContent = "Scanning…";
  status.className = "loading";
  $("subset-results").innerHTML = "";
  $("subset-actions").style.display = "none";

  const stripQuery = $("subset-strip-query").checked;
  const { bookmarks } = await ensureData();
  subsetGroups = findSubsetGroups(bookmarks, { stripQuery });

  status.textContent = subsetGroups.length === 0
    ? "No similar/subset URL groups found."
    : `Found ${subsetGroups.length} group(s) of similar URLs.`;
  status.className = "";
  if (subsetGroups.length === 0) return;

  const container = $("subset-results");
  subsetGroups.forEach((group, gi) => {
    const div = document.createElement("div");
    div.className = "group";
    div.innerHTML = `<div class="group-header"><label><input type="checkbox" data-subset-select-all /> Select all</label></div>`;
    group.items.forEach((item, ii) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "item";
      const keepHint = ii === 0 ? ' <span class="merge-target">(shortest – keep)</span>' : "";
      itemDiv.innerHTML = `
        <input type="checkbox" data-subset-id="${item.id}" data-group="${gi}" data-item="${ii}" />
        <div>
          <div class="item-title">${escapeHtml(item.title)}${keepHint}</div>
          <a class="item-url" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.url)}</a>
        </div>
      `;
      div.appendChild(itemDiv);
    });
    container.appendChild(div);
  });
  $("subset-actions").style.display = "block";
});

$("subset-delete").addEventListener("click", async () => {
  const checked = document.querySelectorAll("input[data-subset-id]:checked");
  if (checked.length === 0) { showToast("Select at least one bookmark to delete."); return; }
  if (!confirm(`Delete ${checked.length} selected bookmark(s)? This cannot be undone.`)) return;
  for (const el of checked) await chrome.bookmarks.remove(el.dataset.subsetId);
  invalidateData();
  showToast(`Deleted ${checked.length} bookmark(s).`);
  $("scan-subset").click();
});

// --- Similar folder names ---
let similarFolderGroups = [];

$("scan-similar-folders").addEventListener("click", async () => {
  const status = $("similar-folders-status");
  status.textContent = "Scanning…";
  status.className = "loading";
  $("similar-folders-results").innerHTML = "";
  $("similar-folders-actions").style.display = "none";

  const { folders, tree } = await ensureData();
  similarFolderGroups = findSimilarFolderGroups(folders, tree);

  status.textContent = similarFolderGroups.length === 0
    ? "No similar folder names found."
    : `Found ${similarFolderGroups.length} group(s) of folders with the same name.`;
  status.className = "";
  if (similarFolderGroups.length === 0) return;

  const container = $("similar-folders-results");
  similarFolderGroups.forEach((group, gi) => {
    const div = document.createElement("div");
    div.className = "group";
    div.innerHTML = `<div class="group-header"><strong>${escapeHtml(group.title)}</strong> (${group.folders.length} folders) — choose one to keep.</div>`;
    group.folders.forEach((folder, fi) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "item";
      itemDiv.innerHTML = `
        <input type="radio" name="similar-keep-${gi}" value="${folder.id}" ${fi === 0 ? "checked" : ""} />
        <div><span class="item-title">${escapeHtml(folder.path)}</span><span class="merge-target">${fi === 0 ? " (keep this one)" : ""}</span></div>
      `;
      itemDiv.querySelector("input").addEventListener("change", function () {
        div.querySelectorAll("input[type=radio]").forEach((r) => {
          const t = r.nextElementSibling?.querySelector(".merge-target");
          if (t) t.textContent = r.checked ? " (keep this one)" : "";
        });
      });
      div.appendChild(itemDiv);
    });
    container.appendChild(div);
  });
  $("similar-folders-actions").style.display = "block";
});

$("similar-folders-merge").addEventListener("click", async () => {
  let merged = 0;
  for (let gi = 0; gi < similarFolderGroups.length; gi++) {
    const group = similarFolderGroups[gi];
    const keepId = document.querySelector(`input[name="similar-keep-${gi}"]:checked`)?.value;
    if (!keepId) continue;
    for (const folder of group.folders.filter((f) => f.id !== keepId)) {
      const children = await chrome.bookmarks.getChildren(folder.id);
      for (const child of children) await chrome.bookmarks.move(child.id, { parentId: keepId });
      await chrome.bookmarks.remove(folder.id);
      merged++;
    }
  }
  invalidateData();
  showToast(`Merged folders. Removed ${merged} folder(s).`);
  $("scan-similar-folders").click();
});

// --- Broken links ---
let brokenGroups = [];

$("broken-results").addEventListener("change", function (e) {
  if (e.target.hasAttribute("data-broken-select-all")) {
    const group = e.target.closest(".group");
    if (!group) return;
    group.querySelectorAll(":scope > .item input[type=checkbox]").forEach((cb) => { cb.checked = e.target.checked; });
    return;
  }
  const group = e.target.closest(".group");
  if (group) {
    const selectAllCb = group.querySelector("[data-broken-select-all]");
    if (!selectAllCb) return;
    const items = group.querySelectorAll(":scope > .item input[type=checkbox]");
    selectAllCb.checked = items.length > 0 && Array.from(items).every((cb) => cb.checked);
  }
});

$("scan-broken").addEventListener("click", async () => {
  const status = $("broken-status");
  const progressDiv = $("broken-progress");
  const progressFill = $("broken-progress-fill");
  const progressText = $("broken-progress-text");

  status.textContent = "Requesting permission…";
  status.className = "loading";
  $("broken-results").innerHTML = "";
  $("broken-actions").style.display = "none";
  progressDiv.style.display = "none";

  const granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
  if (!granted) {
    status.textContent = "Permission denied. Cannot check links without access to websites.";
    status.className = "";
    return;
  }

  status.textContent = "Scanning…";
  progressDiv.style.display = "block";
  progressFill.style.width = "0%";
  progressText.textContent = "0 / …";

  const { bookmarks } = await ensureData();
  const httpBookmarks = bookmarks.filter(
    (b) => b.url && (b.url.startsWith("http://") || b.url.startsWith("https://"))
  );
  progressText.textContent = `0 / ${httpBookmarks.length}`;

  const results = await checkBrokenLinks(httpBookmarks, {
    concurrency: 5,
    onProgress(checked, total) {
      const pct = Math.round((checked / total) * 100);
      progressFill.style.width = pct + "%";
      progressText.textContent = `${checked} / ${total}`;
    },
  });

  progressDiv.style.display = "none";
  brokenGroups = groupBrokenLinks(results);
  const brokenCount = results.filter((r) => r.category !== "ok").length;

  status.textContent = brokenCount === 0
    ? "All links are working!"
    : `Found ${brokenCount} broken link(s) in ${brokenGroups.length} category/categories.`;
  status.className = "";
  if (brokenCount === 0) return;

  const container = $("broken-results");
  brokenGroups.forEach((group) => {
    const div = document.createElement("div");
    div.className = "group";
    div.innerHTML = `
      <div class="group-header">
        <label><input type="checkbox" data-broken-select-all /> Select all</label>
        <strong>${escapeHtml(group.label)}</strong>
        <span class="error-badge">${group.items.length} link(s)</span>
      </div>
    `;
    group.items.forEach((item) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "item";
      const errText = item.status ? `${item.status}` : item.error || "Error";
      itemDiv.innerHTML = `
        <input type="checkbox" data-broken-id="${item.id}" />
        <div>
          <div class="item-title">${escapeHtml(item.title)} <span class="error-badge">${escapeHtml(errText)}</span></div>
          <a class="item-url" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.url)}</a>
        </div>
      `;
      div.appendChild(itemDiv);
    });
    container.appendChild(div);
  });
  $("broken-actions").style.display = "block";
});

$("broken-delete").addEventListener("click", async () => {
  const checked = document.querySelectorAll("input[data-broken-id]:checked");
  if (checked.length === 0) { showToast("Select at least one bookmark to delete."); return; }
  if (!confirm(`Delete ${checked.length} selected bookmark(s)? This cannot be undone.`)) return;
  for (const el of checked) await chrome.bookmarks.remove(el.dataset.brokenId);
  invalidateData();
  showToast(`Deleted ${checked.length} bookmark(s).`);
  $("broken-results").innerHTML = "";
  $("broken-actions").style.display = "none";
  $("broken-status").textContent = `Deleted ${checked.length}. Run scan again to recheck.`;
});
