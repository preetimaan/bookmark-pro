/**
 * Bookmark Pro manager: top-level tabs (Bookmarks | Cleanup),
 * folder tree, bookmark list, and all cleanup tools.
 */

let bookmarksData = null;
let selectedFolderId = null;
let bookmarkSort = "title-asc";

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
      populateImportFolders();
      renderTagsList();
      $("cleanup-bottom-bar")?.classList.remove("visible");
    } else if (btn.dataset.view === "bookmarks") {
      invalidateData();
      renderFolderTree();
      if (selectedFolderId) renderBookmarkList(selectedFolderId);
      $("cleanup-bottom-bar")?.classList.remove("visible");
    } else if (btn.dataset.view === "cleanup") {
      updateCleanupBottomBar();
      populateCleanupScopeDropdown();
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
    updateCleanupBottomBar();
  });
});

function updateCleanupBottomBar() {
  const bar = $("cleanup-bottom-bar");
  const countEl = $("cleanup-selection-count");
  const primaryBtn = $("cleanup-primary-action");
  if (!bar || !countEl || !primaryBtn) return;

  if (!$("view-cleanup")?.classList.contains("active")) {
    bar.classList.remove("visible");
    return;
  }

  const activePanel = document.querySelector("#view-cleanup .panel.active");
  if (!activePanel) {
    bar.classList.remove("visible");
    return;
  }

  let count = 0;
  let actionLabel = "";
  let primaryAction = null;

  if (activePanel.id === "panel-duplicates") {
    const checked = document.querySelectorAll("#dup-results input[data-dup-id]:checked");
    count = checked.length;
    actionLabel = "Delete selected";
    primaryAction = () => $("dup-delete")?.click();
  } else if (activePanel.id === "panel-subset") {
    const checked = document.querySelectorAll("#subset-results input[data-subset-id]:checked");
    count = checked.length;
    actionLabel = "Delete selected";
    primaryAction = () => $("subset-delete")?.click();
  } else if (activePanel.id === "panel-broken") {
    const checked = document.querySelectorAll("#broken-results input[data-broken-id]:checked");
    count = checked.length;
    actionLabel = "Delete selected";
    primaryAction = () => $("broken-delete")?.click();
  } else if (activePanel.id === "panel-empty") {
    const checked = document.querySelectorAll("#empty-results input[data-empty-id]:checked");
    count = checked.length;
    actionLabel = "Delete selected folders";
    primaryAction = () => $("empty-delete")?.click();
  } else if (activePanel.id === "panel-merge") {
    const hasResults = $("merge-results")?.querySelectorAll(".group").length > 0;
    count = hasResults ? mergeCandidates.length : 0;
    actionLabel = "Merge selected groups";
    primaryAction = () => $("merge-do")?.click();
  } else if (activePanel.id === "panel-similar-folders") {
    const hasResults = $("similar-folders-results")?.querySelectorAll(".group").length > 0;
    count = hasResults ? (similarFolderGroups?.length || 0) : 0;
    actionLabel = "Merge selected groups";
    primaryAction = () => $("similar-folders-merge")?.click();
  }

  if (count === 0) {
    bar.classList.remove("visible");
    return;
  }

  countEl.textContent = count === 1 ? "1 selected" : `${count} selected`;
  primaryBtn.textContent = actionLabel;
  primaryBtn.onclick = primaryAction;
  bar.classList.add("visible");
}

$("cleanup-deselect")?.addEventListener("click", () => {
  const activePanel = document.querySelector("#view-cleanup .panel.active");
  if (!activePanel) return;
  const container = activePanel.querySelector(".results");
  if (container) container.querySelectorAll("input[type=checkbox]:checked").forEach((cb) => { cb.checked = false; });
  activePanel.querySelectorAll("input[data-dup-select-all], input[data-subset-select-all], input[data-broken-select-all]").forEach((cb) => { cb.checked = false; });
  updateCleanupBottomBar();
});

function clearCleanupSelectionsAndHideBar() {
  const activePanel = document.querySelector("#view-cleanup .panel.active");
  if (activePanel) {
    const container = activePanel.querySelector(".results");
    if (container) container.querySelectorAll("input[type=checkbox]:checked").forEach((cb) => { cb.checked = false; });
    activePanel.querySelectorAll("input[data-dup-select-all], input[data-subset-select-all], input[data-broken-select-all]").forEach((cb) => { cb.checked = false; });
  }
  updateCleanupBottomBar();
}

$("view-cleanup")?.addEventListener("change", () => updateCleanupBottomBar());

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
  const isRoot = node.id === "0";
  const editBtn = isRoot ? "" : `<button type="button" class="folder-edit" title="Rename folder" aria-label="Rename folder">✎</button>`;
  const deleteBtn = isRoot ? "" : `<button type="button" class="folder-delete" title="Delete folder" aria-label="Delete folder">⌫</button>`;

  row.innerHTML = `
    <span class="arrow">${hasSubfolders ? (expanded ? "▼" : "▶") : ""}</span>
    <span class="folder-name">${escapeHtml(node.title || "Bookmarks")}</span>
    ${editBtn}
    <span class="folder-count">${isMixed || bookmarkCount === 0 ? "" : bookmarkCount}</span>
    ${deleteBtn}
  `;

  if (!isRoot) {
    row.draggable = true;
    row.dataset.dragId = node.id;
    row.dataset.dragType = "folder";
  }

  row.addEventListener("click", (e) => {
    if (e.target.closest(".folder-delete") || e.target.closest(".folder-edit") || e.target.closest(".folder-name")?.isContentEditable) return;
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

// --- Folder create / rename / delete (Group 1: Chrome manager parity) ---
async function createNewFolderAndEdit(parentId) {
  const pid = parentId || selectedFolderId || "1";
  const newFolder = await chrome.bookmarks.create({ parentId: pid, title: "New folder" });
  invalidateData();
  await renderFolderTree();
  selectFolder(newFolder.id);
  setFolderExpanded(pid, true);
  const row = document.querySelector(`.folder-row[data-folder-id="${newFolder.id}"]`);
  const nameEl = row?.querySelector(".folder-name");
  if (nameEl) startFolderRename(nameEl);
  return newFolder;
}

$("new-folder-btn")?.addEventListener("click", async () => {
  try {
    await createNewFolderAndEdit(selectedFolderId || "1");
  } catch (err) {
    showToast("Failed to create folder: " + err.message);
  }
});

// --- Add bookmark / Add folder from manager (Group 2) ---
$("add-bookmark-btn")?.addEventListener("click", async () => {
  const parentId = selectedFolderId || "1";
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const nonExt = tabs.filter((t) => t.url && !t.url.startsWith("chrome-extension://") && !t.url.startsWith("chrome://"));
    const tab = nonExt.find((t) => t.active) || nonExt[0];
    if (!tab) {
      showToast("No page to bookmark in this window.");
      return;
    }
    await chrome.bookmarks.create({
      parentId,
      title: tab.title || tab.url || "Bookmark",
      url: tab.url,
    });
    invalidateData();
    await renderBookmarkList(parentId);
    showToast('Bookmark added.');
  } catch (err) {
    showToast("Failed to add bookmark: " + err.message);
  }
});

$("add-folder-main-btn")?.addEventListener("click", async () => {
  try {
    await createNewFolderAndEdit(selectedFolderId || "1");
  } catch (err) {
    showToast("Failed to create folder: " + err.message);
  }
});

function startFolderRename(nameEl) {
  const row = nameEl.closest(".folder-row");
  const folderId = row?.dataset.folderId;
  if (!folderId || folderId === "0") return;
  if (nameEl.isContentEditable) return;
  const initialTitle = nameEl.textContent.trim() || "New folder";
  nameEl.contentEditable = "true";
  nameEl.focus();
  nameEl.dataset.editing = "true";
  const sel = window.getSelection();
  sel.selectAllChildren(nameEl);

  function finish() {
    nameEl.removeAttribute("contenteditable");
    nameEl.removeAttribute("data-editing");
    nameEl.removeEventListener("blur", onBlur);
    nameEl.removeEventListener("keydown", onKey);
  }

  async function save() {
    finish();
    const newTitle = nameEl.textContent.trim();
    if (!newTitle) {
      nameEl.textContent = initialTitle;
      return;
    }
    try {
      await chrome.bookmarks.update(folderId, { title: newTitle });
      invalidateData();
    } catch (err) {
      showToast("Failed to rename: " + err.message);
      nameEl.textContent = initialTitle;
    }
  }

  function onBlur() {
    save();
  }

  function onKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      nameEl.blur();
    } else if (e.key === "Escape") {
      finish();
      nameEl.textContent = initialTitle;
    }
  }

  nameEl.addEventListener("blur", onBlur, { once: true });
  nameEl.addEventListener("keydown", onKey);
}

$("folder-tree")?.addEventListener("dblclick", (e) => {
  const nameEl = e.target.closest(".folder-name");
  if (!nameEl || nameEl.dataset.editing === "true") return;
  e.stopPropagation();
  startFolderRename(nameEl);
});

$("folder-tree")?.addEventListener("click", (e) => {
  const editBtn = e.target.closest(".folder-edit");
  if (!editBtn) return;
  e.preventDefault();
  e.stopPropagation();
  const nameEl = editBtn.closest(".folder-row")?.querySelector(".folder-name");
  if (nameEl) startFolderRename(nameEl);
});

async function deleteFolderRecursive(id) {
  const children = await chrome.bookmarks.getChildren(id);
  for (const c of children) {
    if (c.url) await chrome.bookmarks.remove(c.id);
    else await deleteFolderRecursive(c.id);
  }
  await chrome.bookmarks.remove(id);
}

$("folder-tree")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".folder-delete");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const row = btn.closest(".folder-row");
  const folderId = row?.dataset.folderId;
  if (!folderId || folderId === "0") return;
  const folderName = row.querySelector(".folder-name")?.textContent?.trim() || "this folder";
  chrome.bookmarks.getChildren(folderId).then((children) => {
    const count = children.length;
    const msg = count === 0
      ? `Delete "${folderName}"?`
      : `Delete "${folderName}" and its ${count} item(s)? This cannot be undone.`;
    if (!confirm(msg)) return;
    deleteFolderRecursive(folderId).then(async () => {
      invalidateData();
      if (selectedFolderId === folderId) {
        selectedFolderId = null;
        const list = $("bookmark-list");
        list.innerHTML = '<div class="empty-state">Select a folder to view bookmarks.</div>';
        document.querySelectorAll(".folder-row").forEach((r) => r.classList.remove("selected"));
      }
      await renderFolderTree();
      showToast("Folder deleted.");
    }).catch((err) => showToast("Failed to delete: " + err.message));
  });
});

// --- Drag and drop (Group 3): reorder in list, move to folder ---
let dragState = null; // { id, type, sourceParentId } set in dragstart
let listDropIndex = null;
let dropIndicatorEl = null;

function listRows() {
  const list = $("bookmark-list");
  if (!list) return [];
  return Array.from(list.children).filter((el) => el.classList.contains("bookmark-row") || el.classList.contains("folder-entry"));
}

function updateListDropIndicator(index) {
  const rows = listRows();
  if (index == null || index < 0 || index > rows.length) {
    if (dropIndicatorEl) {
      dropIndicatorEl.remove();
      dropIndicatorEl = null;
    }
    return;
  }
  const list = $("bookmark-list");
  if (!dropIndicatorEl) {
    dropIndicatorEl = document.createElement("div");
    dropIndicatorEl.className = "drop-indicator";
  }
  if (index >= rows.length) {
    list.appendChild(dropIndicatorEl);
  } else {
    list.insertBefore(dropIndicatorEl, rows[index]);
  }
}

function clearListDropIndicator() {
  listDropIndex = null;
  if (dropIndicatorEl) {
    dropIndicatorEl.remove();
    dropIndicatorEl = null;
  }
}

function clearFolderDropTargets() {
  document.querySelectorAll(".folder-row.drop-target").forEach((r) => r.classList.remove("drop-target"));
}

$("bookmark-list")?.addEventListener("dragstart", (e) => {
  const row = e.target.closest(".bookmark-row, .folder-entry");
  if (!row || !row.draggable) return;
  const id = row.dataset.dragId;
  const type = row.dataset.dragType;
  if (!id || !type) return;
  dragState = { id, type, sourceParentId: selectedFolderId || null };
  e.dataTransfer.setData("text/plain", JSON.stringify(dragState));
  e.dataTransfer.effectAllowed = "move";
  row.classList.add("dragging");
});

$("bookmark-list")?.addEventListener("dragend", (e) => {
  document.querySelectorAll(".bookmark-row.dragging, .folder-entry.dragging").forEach((r) => r.classList.remove("dragging"));
  dragState = null;
  clearListDropIndicator();
});

$("bookmark-list")?.addEventListener("dragover", (e) => {
  if (!dragState) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  clearFolderDropTargets();
  const list = $("bookmark-list");
  const rows = listRows();
  if (rows.length === 0) {
    listDropIndex = 0;
    updateListDropIndicator(0);
    return;
  }
  const rect = list.getBoundingClientRect();
  const y = e.clientY;
  let idx = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) {
      idx = i;
      break;
    }
    idx = i + 1;
  }
  listDropIndex = idx;
  updateListDropIndicator(idx);
});

$("bookmark-list")?.addEventListener("dragleave", (e) => {
  if (!$("bookmark-list")?.contains(e.relatedTarget)) {
    clearListDropIndicator();
  }
});

$("bookmark-list")?.addEventListener("drop", async (e) => {
  e.preventDefault();
  const state = dragState || (() => { try { return JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return null; } })();
  if (!state?.id) return;
  const targetParentId = selectedFolderId || "1";
  const targetIndex = listDropIndex != null ? listDropIndex : listRows().length;
  clearListDropIndicator();
  clearFolderDropTargets();
  dragState = null;
  try {
    if (state.sourceParentId === targetParentId) {
      await chrome.bookmarks.move(state.id, { index: targetIndex });
    } else {
      await chrome.bookmarks.move(state.id, { parentId: targetParentId, index: targetIndex });
    }
    invalidateData();
    await renderFolderTree();
    await renderBookmarkList(targetParentId);
    showToast("Moved.");
  } catch (err) {
    showToast("Move failed: " + err.message);
  }
});

$("folder-tree")?.addEventListener("dragstart", (e) => {
  const row = e.target.closest(".folder-row");
  if (!row || !row.draggable) return;
  const id = row.dataset.dragId;
  if (!id) return;
  dragState = { id, type: "folder", sourceParentId: null };
  e.dataTransfer.setData("text/plain", JSON.stringify(dragState));
  e.dataTransfer.effectAllowed = "move";
  row.classList.add("dragging");
});

$("folder-tree")?.addEventListener("dragend", (e) => {
  document.querySelectorAll(".folder-row.dragging").forEach((r) => r.classList.remove("dragging"));
  dragState = null;
  clearFolderDropTargets();
});

$("folder-tree")?.addEventListener("dragover", (e) => {
  e.preventDefault();
  const row = e.target.closest(".folder-row");
  if (!row || row.dataset.folderId === "0") return;
  const state = dragState || (() => { try { return JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return null; } })();
  if (!state?.id) return;
  const targetFolderId = row.dataset.folderId;
  if (state.type === "folder" && state.id === targetFolderId) return;
  e.dataTransfer.dropEffect = "move";
  clearListDropIndicator();
  clearFolderDropTargets();
  row.classList.add("drop-target");
});

$("folder-tree")?.addEventListener("dragleave", (e) => {
  if (!$("folder-tree")?.contains(e.relatedTarget)) clearFolderDropTargets();
});

$("folder-tree")?.addEventListener("drop", async (e) => {
  const row = e.target.closest(".folder-row");
  if (!row || row.dataset.folderId === "0") return;
  e.preventDefault();
  const state = dragState || (() => { try { return JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return null; } })();
  if (!state?.id) return;
  const targetFolderId = row.dataset.folderId;
  if (state.type === "folder") {
    const data = await ensureData();
    const descendants = getCleanupScopeFolderIds(state.id, data.folders || []);
    if (descendants.has(targetFolderId)) {
      showToast("Cannot move a folder into itself or its subfolder.");
      clearFolderDropTargets();
      return;
    }
  }
  clearFolderDropTargets();
  dragState = null;
  try {
    await chrome.bookmarks.move(state.id, { parentId: targetFolderId });
    invalidateData();
    await renderFolderTree();
    if (selectedFolderId) await renderBookmarkList(selectedFolderId);
    showToast("Moved.");
  } catch (err) {
    showToast("Move failed: " + err.message);
  }
});

// --- Right-click context menu (Group 4) ---
const contextMenuEl = $("context-menu");

function hideContextMenu() {
  if (contextMenuEl) contextMenuEl.style.display = "none";
}

function showContextMenu(x, y, items) {
  if (!contextMenuEl || !items.length) return;
  contextMenuEl.innerHTML = "";
  items.forEach(({ label, action }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", () => { hideContextMenu(); action(); });
    contextMenuEl.appendChild(btn);
  });
  contextMenuEl.style.display = "block";
  contextMenuEl.style.left = x + "px";
  contextMenuEl.style.top = y + "px";
  const rect = contextMenuEl.getBoundingClientRect();
  if (rect.right > window.innerWidth) contextMenuEl.style.left = (window.innerWidth - rect.width) + "px";
  if (rect.bottom > window.innerHeight) contextMenuEl.style.top = (window.innerHeight - rect.height) + "px";
  requestAnimationFrame(() => document.addEventListener("click", hideContextMenu, { once: true }));
  document.addEventListener("keydown", function onEsc(e) {
    if (e.key === "Escape") { hideContextMenu(); document.removeEventListener("keydown", onEsc); }
  }, { once: true });
}

$("bookmark-list")?.addEventListener("contextmenu", (e) => {
  const row = e.target.closest(".bookmark-row");
  const folderEntry = e.target.closest(".folder-entry");
  if (row) {
    e.preventDefault();
    const bmId = row.dataset.id;
    const urlEl = row.querySelector(".bookmark-url");
    const titleEl = row.querySelector(".bookmark-title");
    const url = urlEl?.href || "";
    const title = titleEl?.textContent?.trim() || "";
    showContextMenu(e.clientX, e.clientY, [
      { label: "Open in new tab", action: () => { if (url) chrome.tabs.create({ url }); } },
      { label: "Copy URL", action: () => { if (url) navigator.clipboard.writeText(url).then(() => showToast("Copied"), () => showToast("Copy failed")); } },
      { label: "Copy name", action: () => { if (title) navigator.clipboard.writeText(title).then(() => showToast("Copied"), () => showToast("Copy failed")); } },
      { label: "Edit", action: () => { if (titleEl) startBookmarkInlineEdit(titleEl, bmId, true); } },
      { label: "Delete", action: async () => {
        if (!confirm("Delete this bookmark?")) return;
        try {
          await chrome.bookmarks.remove(bmId);
          invalidateData();
          if (selectedFolderId) await renderBookmarkList(selectedFolderId);
          await renderFolderTree();
          showToast("Deleted.");
        } catch (err) { showToast("Delete failed: " + err.message); }
      } },
    ]);
    return;
  }
  if (folderEntry) {
    e.preventDefault();
    const folderId = folderEntry.dataset.folderId;
    const name = folderEntry.querySelector(".folder-entry-name")?.textContent?.trim() || "folder";
    showContextMenu(e.clientX, e.clientY, [
      { label: "Open folder", action: () => selectFolder(folderId) },
      { label: "Rename", action: () => {
        const treeRow = document.querySelector(`.folder-row[data-folder-id="${folderId}"]`);
        const nameEl = treeRow?.querySelector(".folder-name");
        if (nameEl) startFolderRename(nameEl);
      } },
      { label: "Delete", action: async () => {
        const msg = `Delete "${name}" and its contents? This cannot be undone.`;
        if (!confirm(msg)) return;
        try {
          await deleteFolderRecursive(folderId);
          invalidateData();
          if (selectedFolderId === folderId) {
            selectedFolderId = null;
            $("bookmark-list").innerHTML = '<div class="empty-state">Select a folder to view bookmarks.</div>';
            document.querySelectorAll(".folder-row").forEach((r) => r.classList.remove("selected"));
          }
          await renderFolderTree();
          showToast("Folder deleted.");
        } catch (err) { showToast("Delete failed: " + err.message); }
      } },
    ]);
  }
});

$("folder-tree")?.addEventListener("contextmenu", (e) => {
  const row = e.target.closest(".folder-row");
  if (!row || row.dataset.folderId === "0") return;
  e.preventDefault();
  const folderId = row.dataset.folderId;
  const name = row.querySelector(".folder-name")?.textContent?.trim() || "folder";
  showContextMenu(e.clientX, e.clientY, [
    { label: "Rename", action: () => { const nameEl = row.querySelector(".folder-name"); if (nameEl) startFolderRename(nameEl); } },
    { label: "Delete", action: async () => {
      const msg = `Delete "${name}" and its contents? This cannot be undone.`;
      if (!confirm(msg)) return;
      try {
        await deleteFolderRecursive(folderId);
        invalidateData();
        if (selectedFolderId === folderId) {
          selectedFolderId = null;
          $("bookmark-list").innerHTML = '<div class="empty-state">Select a folder to view bookmarks.</div>';
          document.querySelectorAll(".folder-row").forEach((r) => r.classList.remove("selected"));
        }
        await renderFolderTree();
        showToast("Folder deleted.");
      } catch (err) { showToast("Delete failed: " + err.message); }
    } },
  ]);
});

function applyBookmarkSort(items, allTags) {
  const sorted = [...items];
  const getBase = (bm) => parseTitle(bm.title).baseTitle;
  const cmp = (a, b) => {
    switch (bookmarkSort) {
      case "title-asc": return getBase(a).localeCompare(getBase(b));
      case "title-desc": return getBase(b).localeCompare(getBase(a));
      case "date-desc": return (b.dateAdded || 0) - (a.dateAdded || 0);
      case "date-asc": return (a.dateAdded || 0) - (b.dateAdded || 0);
      case "url-asc": return (a.url || "").localeCompare(b.url || "");
      case "url-desc": return (b.url || "").localeCompare(a.url || "");
      default: return getBase(a).localeCompare(getBase(b));
    }
  };
  sorted.sort(cmp);
  return sorted;
}

function getFolderPath(folderId, folderMap) {
  if (!folderId) return "";
  const f = folderMap[folderId];
  if (!f) return "";
  const parentPath = f.parentId ? getFolderPath(f.parentId, folderMap) : "";
  return parentPath ? parentPath + " / " + (f.title || "") : (f.title || "");
}

async function renderBookmarkList(folderId) {
  const children = await chrome.bookmarks.getChildren(folderId);
  const folders = children.filter((c) => !c.url);
  let bookmarks = children.filter((c) => c.url);
  const container = $("bookmark-list");
  const allTags = await loadAllTags();
  bookmarks = applyBookmarkSort(bookmarks, allTags);

  const data = await ensureData();
  const folderMap = {};
  (data.folders || []).forEach((f) => {
    folderMap[f.id] = { title: f.title, parentId: f.parentId };
  });

  if (folders.length === 0 && bookmarks.length === 0) {
    container.innerHTML = '<div class="empty-state">This folder is empty.</div>';
    return;
  }

  container.innerHTML = "";

  for (const folder of folders) {
    const entry = document.createElement("div");
    entry.className = "folder-entry";
    entry.dataset.folderId = folder.id;
    entry.draggable = true;
    entry.dataset.dragId = folder.id;
    entry.dataset.dragType = "folder";
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
    const tags = allTags[bm.id] || [];
    const dateStr = bm.dateAdded ? new Date(bm.dateAdded).toLocaleDateString() : "";
    const displayTitle = (typeof bm.title === "string" && bm.title) ? bm.title : "Bookmark";
    const folderPath = getFolderPath(bm.parentId, folderMap);

    const row = document.createElement("div");
    row.className = "bookmark-row";
    row.dataset.id = bm.id;
    row.draggable = true;
    row.dataset.dragId = bm.id;
    row.dataset.dragType = "bookmark";
    const tagPills = tags.map((t) => tagPillHtml(bm.id, t)).join("");
    row.innerHTML = `
      <input type="checkbox" data-bm-id="${bm.id}" />
      <div class="bookmark-info">
        <div class="bookmark-title-wrap">
          <div class="bookmark-title" data-base-title="${escapeHtml(parseTitle(bm.title).baseTitle)}">${escapeHtml(displayTitle)}</div>
          <button type="button" class="bookmark-edit-title" title="Edit name" aria-label="Edit name">✎</button>
          <button type="button" class="bookmark-copy-title" title="Copy name" aria-label="Copy name">⎘</button>
        </div>
        <div class="bookmark-url-wrap">
          <a class="bookmark-url" href="${escapeHtml(bm.url)}" target="_blank" rel="noopener">${escapeHtml(bm.url)}</a>
          <button type="button" class="bookmark-edit-url" title="Edit URL" aria-label="Edit URL">✎</button>
          <button type="button" class="bookmark-copy-url" title="Copy URL" aria-label="Copy URL">⎘</button>
        </div>
        ${folderPath ? `<div class="bookmark-folder-path">${escapeHtml(folderPath)}</div>` : ""}
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
function startBookmarkInlineEdit(target, bmId, isTitle) {
  if (target.isContentEditable) return;

  if (isTitle) {
    const base = target.getAttribute("data-base-title");
    if (base != null) target.textContent = base;
  }
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
      if (isTitle) {
        const tags = await getTagsForBookmark(bmId);
        const priorityMap = await loadPriorityMap();
        const newTitle = buildTitle(newValue, tags, priorityMap);
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
}

$("bookmark-list").addEventListener("dblclick", (e) => {
  const titleEl = e.target.closest(".bookmark-title");
  const urlEl = e.target.closest(".bookmark-url");
  const target = titleEl || urlEl;
  if (!target) return;

  const row = target.closest(".bookmark-row");
  if (!row) return;
  const bmId = row.dataset.id;

  startBookmarkInlineEdit(target, bmId, !!titleEl);
});

$("bookmark-list").addEventListener("click", (e) => {
  const btn = e.target.closest(".bookmark-edit-url");
  if (!btn) return;
  e.preventDefault();
  const row = btn.closest(".bookmark-row");
  if (!row) return;
  const urlEl = row.querySelector(".bookmark-url");
  if (!urlEl) return;
  startBookmarkInlineEdit(urlEl, row.dataset.id, false);
});

$("bookmark-list").addEventListener("click", (e) => {
  const btn = e.target.closest(".bookmark-edit-title");
  if (!btn) return;
  e.preventDefault();
  const row = btn.closest(".bookmark-row");
  if (!row) return;
  const titleEl = row.querySelector(".bookmark-title");
  if (!titleEl) return;
  startBookmarkInlineEdit(titleEl, row.dataset.id, true);
});

$("bookmark-list").addEventListener("click", (e) => {
  const btn = e.target.closest(".bookmark-copy-url");
  if (!btn) return;
  e.preventDefault();
  const wrap = btn.closest(".bookmark-url-wrap");
  const link = wrap?.querySelector(".bookmark-url");
  const input = wrap?.querySelector(".item-url-input");
  const url = link?.href || input?.value || "";
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => showToast("Copied"), () => showToast("Copy failed"));
});

$("bookmark-list").addEventListener("click", (e) => {
  const btn = e.target.closest(".bookmark-copy-title");
  if (!btn) return;
  e.preventDefault();
  const wrap = btn.closest(".bookmark-title-wrap");
  const titleEl = wrap?.querySelector(".bookmark-title");
  const text = titleEl?.textContent?.trim() || "";
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => showToast("Copied"), () => showToast("Copy failed"));
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
  const countEl = $("selection-count");
  const bar = $("bottom-bar");
  if (countEl) countEl.textContent = `${ids.length} selected`;
  if (bar) bar.classList.toggle("visible", ids.length > 0);
  const allCbs = document.querySelectorAll('#bookmark-list input[data-bm-id]');
  const selectAllCb = $("select-all-bm");
  if (selectAllCb) selectAllCb.checked = allCbs.length > 0 && ids.length === allCbs.length;
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
$("bulk-deselect")?.addEventListener("click", () => {
  document.querySelectorAll('#bookmark-list input[data-bm-id]:checked').forEach((cb) => {
    cb.checked = false;
    const row = cb.closest(".bookmark-row");
    if (row) row.classList.remove("selected");
  });
  updateSelectionCount();
});

// --- Bulk delete ---
$("bulk-delete")?.addEventListener("click", async () => {
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

// --- Tags tab ---
async function renderTagsList() {
  const tags = await getAllTagsForManager();
  const priorityMap = await loadPriorityMap();
  const searchEl = $("tags-search");
  const searchQuery = (searchEl && searchEl.value.trim().toLowerCase()) || "";
  const filteredTags = searchQuery
    ? tags.filter((t) => t.toLowerCase().includes(searchQuery))
    : tags;

  const priorityTagNames = Object.entries(priorityMap)
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);

  const prioritySection = $("tags-priority-section");
  if (prioritySection) {
    const priorityNote = "<p class=\"tags-priority-note\" style=\"font-size:0.8rem;color:var(--muted);margin:4px 0 10px 0;\">These tags appear first in bookmark titles. Use ↑↓ to reorder.</p>";
    if (priorityTagNames.length === 0) {
      prioritySection.innerHTML = "<h3>Priority tags (1–3)</h3>" + priorityNote + "<div class=\"empty-state\" style=\"padding:12px 0;font-size:0.9rem;\">No priority tags. Use \"Add to priority\" on any tag below.</div>";
    } else {
      prioritySection.innerHTML = "<h3>Priority tags (1–3)</h3>" + priorityNote;
      for (let idx = 0; idx < priorityTagNames.length; idx++) {
        const tag = priorityTagNames[idx];
        const count = await getTagCount(tag);
        const style = tagToStyle(tag);
        const row = document.createElement("div");
        row.className = "tag-manager-row";
        row.innerHTML = `
          <span class="tag-name-editable" data-tag-rename="${escapeHtml(tag)}" style="background:${style.background};color:${style.color}">${escapeHtml(tag)}</span>
          <span class="tag-count">${count} bookmark(s)</span>
          <span class="tag-actions">
            <button type="button" class="small tag-btn-priority" data-tag-up="${escapeHtml(tag)}" title="Move up" ${idx === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="small tag-btn-priority" data-tag-down="${escapeHtml(tag)}" title="Move down" ${idx === priorityTagNames.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" class="small tag-btn-priority" data-tag-remove-priority="${escapeHtml(tag)}">Remove</button>
            <button type="button" class="small" data-tag-delete="${escapeHtml(tag)}">Delete</button>
          </span>
        `;
        prioritySection.appendChild(row);
      }
    }
  }

  const container = $("tags-list");
  if (!container) return;
  if (filteredTags.length === 0 && tags.length === 0) {
    container.innerHTML = '<div class="empty-state">No tags yet. Add a tag name above or tag bookmarks in the Bookmarks tab.</div>';
    return;
  }
  if (filteredTags.length === 0) {
    container.innerHTML = '<div class="empty-state">No tags match your search.</div>';
    return;
  }
  container.innerHTML =
    '<h3 style="font-size:0.9rem;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">All tags</h3>';
  const canAddMorePriority = priorityTagNames.length < 3;
  for (const tag of filteredTags) {
    const count = await getTagCount(tag);
    const style = tagToStyle(tag);
    const isPriority = tag in priorityMap;
    const showAddPriority = canAddMorePriority && !isPriority;
    const row = document.createElement("div");
    row.className = "tag-manager-row";
    row.innerHTML = `
      <span class="tag-name-editable" data-tag-rename="${escapeHtml(tag)}" style="background:${style.background};color:${style.color}">${escapeHtml(tag)}</span>
      <span class="tag-count">${count} bookmark(s)</span>
      <span class="tag-actions">
        ${showAddPriority ? `<button type="button" class="small tag-btn-priority" data-tag-add-priority="${escapeHtml(tag)}">Add to priority</button>` : ""}
        <button type="button" class="small" data-tag-delete="${escapeHtml(tag)}">Delete</button>
      </span>
    `;
    container.appendChild(row);
  }
}

$("tags-search")?.addEventListener("input", () => renderTagsList());
$("tags-search")?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("tags-search").value = "";
    renderTagsList();
  }
});

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

$("tags-content").addEventListener("click", async (e) => {
  const addPriorityBtn = e.target.closest("[data-tag-add-priority]");
  const upBtn = e.target.closest("[data-tag-up]");
  const downBtn = e.target.closest("[data-tag-down]");
  const removePriorityBtn = e.target.closest("[data-tag-remove-priority]");
  const editableSpan = e.target.closest(".tag-name-editable");
  const deleteBtn = e.target.closest("[data-tag-delete]");

  if (addPriorityBtn && !addPriorityBtn.disabled) {
    const tag = addPriorityBtn.dataset.tagAddPriority;
    const slot = await getNextPrioritySlot();
    if (slot == null) {
      showToast("Already 3 priority tags. Remove one first.");
      return;
    }
    const { error } = await setTagPriority(tag, slot);
    if (error) {
      showToast(error);
    } else {
      showToast(`Added "${tag}" to priority.`);
    }
    invalidateData();
    if (selectedFolderId) await renderBookmarkList(selectedFolderId);
    renderTagsList();
    return;
  }

  if (upBtn && !upBtn.disabled) {
    const tag = upBtn.dataset.tagUp;
    const { error } = await movePriority(tag, "up");
    if (error) showToast(error);
    else showToast(`Moved "${tag}" up.`);
    invalidateData();
    if (selectedFolderId) await renderBookmarkList(selectedFolderId);
    renderTagsList();
    return;
  }

  if (downBtn && !downBtn.disabled) {
    const tag = downBtn.dataset.tagDown;
    const { error } = await movePriority(tag, "down");
    if (error) showToast(error);
    else showToast(`Moved "${tag}" down.`);
    invalidateData();
    if (selectedFolderId) await renderBookmarkList(selectedFolderId);
    renderTagsList();
    return;
  }

  if (removePriorityBtn) {
    const tag = removePriorityBtn.dataset.tagRemovePriority;
    await setTagPriority(tag, null);
    showToast(`Removed "${tag}" from priority.`);
    invalidateData();
    if (selectedFolderId) await renderBookmarkList(selectedFolderId);
    renderTagsList();
    return;
  }

  if (editableSpan && !editableSpan.closest(".tag-manager-row")?.querySelector(".tag-rename-input")) {
    const oldTag = editableSpan.dataset.tagRename;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "tag-rename-input";
    input.value = oldTag;
    input.dataset.tagRename = oldTag;
    editableSpan.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const newTag = input.value.trim().toLowerCase();
      input.remove();
      if (!newTag || newTag === oldTag) {
        renderTagsList();
        return;
      }
      setTagsBusy(true);
      try {
        await renameTagGlobally(oldTag, newTag);
        invalidateData();
        if (selectedFolderId) await renderBookmarkList(selectedFolderId);
        renderTagsList();
        showToast(`Renamed to "${newTag}".`);
      } catch (err) {
        showToast(err.message || "Rename failed.");
        renderTagsList();
      } finally {
        setTagsBusy(false);
      }
    };

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        commit();
      } else if (ev.key === "Escape") {
        input.remove();
        renderTagsList();
      }
    });
    input.addEventListener("blur", () => commit());
    return;
  }

  if (deleteBtn) {
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

// --- Import tags from titles ---
function populateImportFolders() {
  const select = $("import-folder");
  if (!select) return;
  const scopeFolder = $("import-scope-folder");
  ensureData().then((data) => {
    const folders = flattenFolders(data.tree);
    select.innerHTML = '<option value="">— Select folder —</option>';
    folders.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.title || "(Unnamed)";
      select.appendChild(opt);
    });
    select.disabled = !scopeFolder || !scopeFolder.checked;
  });
}

$("import-scope-all")?.addEventListener("change", () => {
  const sel = $("import-folder");
  if (sel) sel.disabled = true;
});
$("import-scope-folder")?.addEventListener("change", () => {
  const sel = $("import-folder");
  if (sel) sel.disabled = false;
});

$("import-tags-btn")?.addEventListener("click", async () => {
  const progressWrap = $("import-progress");
  const progressFill = $("import-progress-fill");
  const progressText = $("import-progress-text");
  const btn = $("import-tags-btn");
  const useFolder = $("import-scope-folder")?.checked;
  const folderId = $("import-folder")?.value?.trim();

  if (useFolder && !folderId) {
    showToast("Select a folder first.");
    return;
  }

  let bookmarks = [];
  if (useFolder && folderId) {
    const children = await chrome.bookmarks.getChildren(folderId);
    bookmarks = children.filter((c) => c.url).map((c) => ({ id: c.id, url: c.url, title: c.title || "", parentId: c.parentId }));
  } else {
    const data = await ensureData();
    bookmarks = data.bookmarks;
  }

  if (bookmarks.length === 0) {
    showToast(useFolder ? "No bookmarks in that folder." : "No bookmarks found.");
    return;
  }

  btn.disabled = true;
  progressWrap.style.display = "block";
  progressFill.style.width = "0%";
  progressText.textContent = "Importing… 0%";

  const all = await loadAllTags();
  const total = bookmarks.length;
  let updated = 0;

  for (let i = 0; i < bookmarks.length; i++) {
    const bm = bookmarks[i];
    const { tags } = parseTitle(bm.title);
    if (tags.length > 0) {
      all[bm.id] = tags;
      await syncTitleForBookmark(bm.id, tags);
      updated++;
    }
    const pct = Math.round(((i + 1) / total) * 100);
    progressFill.style.width = pct + "%";
    progressText.textContent = "Importing… " + pct + "%";
  }

  await saveAllTags(all);
  progressWrap.style.display = "none";
  btn.disabled = false;
  invalidateData();
  if (selectedFolderId) renderBookmarkList(selectedFolderId);
  renderTagsList();
  showToast("Imported tags from " + updated + " bookmark(s). Titles use #tag format.");
});

// --- Bulk move ---
let moveTargetId = null;

$("bulk-move")?.addEventListener("click", async () => {
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
$("bulk-tag")?.addEventListener("click", async () => {
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

// --- Sort (permanent: reorder bookmarks in Chrome) ---
const sortSelect = $("sort-bookmarks");
if (sortSelect) {
  sortSelect.value = bookmarkSort;
  sortSelect.addEventListener("change", async () => {
    bookmarkSort = sortSelect.value;
    const query = $("search-input").value.trim().toLowerCase();
    if (query) {
      searchBookmarks(query);
      return;
    }
    if (selectedFolderId) {
      await applySortPermanently(selectedFolderId);
      renderBookmarkList(selectedFolderId);
    }
  });
}

async function applySortPermanently(folderId) {
  const children = await chrome.bookmarks.getChildren(folderId);
  const folders = children.filter((c) => !c.url);
  const bookmarks = children.filter((c) => c.url);
  if (bookmarks.length === 0) return;
  const allTags = await loadAllTags();
  const sorted = applyBookmarkSort(bookmarks, allTags);
  const baseIndex = folders.length;
  for (let i = 0; i < sorted.length; i++) {
    await chrome.bookmarks.move(sorted[i].id, { parentId: folderId, index: baseIndex + i });
  }
  invalidateData();
  showToast("Folder sorted.");
}

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
  const data = await ensureData();
  const { bookmarks } = data;
  const allTags = await loadAllTags();

  const folderMap = {};
  (data.folders || []).forEach((f) => {
    folderMap[f.id] = { title: f.title, parentId: f.parentId };
  });

  let results = bookmarks.filter((bm) => {
    const { baseTitle } = parseTitle(bm.title);
    const tags = allTags[bm.id] || [];
    return (
      baseTitle.toLowerCase().includes(query) ||
      bm.url.toLowerCase().includes(query) ||
      tags.some((t) => t.toLowerCase().includes(query))
    );
  });
  results = applyBookmarkSort(results, allTags);

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
    const displayTitle = (typeof bm.title === "string" && bm.title) ? bm.title : "Bookmark";
    const folderPath = getFolderPath(bm.parentId, folderMap);
    const tagPills = tags.map((t) => tagPillHtml(bm.id, t)).join("");
    const folderPathHtml = folderPath ? `<div class="bookmark-folder-path">${escapeHtml(folderPath)}</div>` : "";

    const row = document.createElement("div");
    row.className = "bookmark-row";
    row.dataset.id = bm.id;
    row.innerHTML = `
      <input type="checkbox" data-bm-id="${bm.id}" />
      <div class="bookmark-info">
        <div class="bookmark-title-wrap">
          <div class="bookmark-title" data-base-title="${escapeHtml(baseTitle)}">${escapeHtml(displayTitle)}</div>
          <button type="button" class="bookmark-edit-title" title="Edit name" aria-label="Edit name">✎</button>
          <button type="button" class="bookmark-copy-title" title="Copy name" aria-label="Copy name">⎘</button>
        </div>
        <div class="bookmark-url-wrap">
          <a class="bookmark-url" href="${escapeHtml(bm.url)}" target="_blank" rel="noopener">${escapeHtml(bm.url)}</a>
          <button type="button" class="bookmark-edit-url" title="Edit URL" aria-label="Edit URL">✎</button>
          <button type="button" class="bookmark-copy-url" title="Copy URL" aria-label="Copy URL">⎘</button>
        </div>
        ${folderPathHtml}
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

// --- Keyboard shortcuts ---
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if ($("move-modal")?.classList.contains("visible")) {
      $("move-modal").classList.remove("visible");
      e.preventDefault();
      return;
    }
    const ids = getSelectedIds();
    if (ids.length > 0 && $("view-bookmarks")?.classList.contains("active")) {
      document.querySelectorAll('#bookmark-list input[data-bm-id]:checked').forEach((cb) => {
        cb.checked = false;
        const row = cb.closest(".bookmark-row");
        if (row) row.classList.remove("selected");
      });
      updateSelectionCount();
      e.preventDefault();
    }
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    const active = document.activeElement;
    const isInput = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
    if (isInput) return;
    if ($("move-modal")?.classList.contains("visible")) return;
    if (!$("view-bookmarks")?.classList.contains("active")) return;
    const ids = getSelectedIds();
    if (ids.length === 0) return;
    e.preventDefault();
    if (!confirm(`Delete ${ids.length} selected bookmark(s)? This cannot be undone.`)) return;
    (async () => {
      for (const id of ids) await chrome.bookmarks.remove(id);
      invalidateData();
      showToast(`Deleted ${ids.length} bookmark(s).`);
      if (selectedFolderId) renderBookmarkList(selectedFolderId);
      renderFolderTree();
    })();
  }
});

// --- Init ---
renderFolderTree();

// =====================================================
// CLEANUP TOOLS (ported from options.js)
// =====================================================

/** Return folder ids that are the given folder or its descendants. If folderId is empty/null, return all folder ids. */
function getCleanupScopeFolderIds(folderId, folders) {
  if (!folders || !folders.length) return new Set();
  const allIds = new Set(folders.map((f) => String(f.id)));
  const id = folderId != null ? String(folderId).trim() : "";
  if (!id || id === "0") return allIds;
  const byParent = {};
  folders.forEach((f) => {
    const pid = f.parentId != null ? String(f.parentId) : "";
    if (!byParent[pid]) byParent[pid] = [];
    byParent[pid].push(String(f.id));
  });
  const result = new Set([id]);
  let queue = [id];
  while (queue.length) {
    const pid = queue.pop();
    (byParent[pid] || []).forEach((childId) => {
      if (!result.has(childId)) {
        result.add(childId);
        queue.push(childId);
      }
    });
  }
  return result;
}

/** Build { value, label, depth } for each folder from tree (tree structure with depth for indent). */
function getFolderPathsFromTree(node, depth = 0) {
  const list = [];
  if (!node || !node.children) return list;
  const isRoot = node.id === "0"; // Chrome root is "0"; "1" = Bookmarks bar, "2" = Other bookmarks
  const label = (node.title || (isRoot ? "Bookmarks" : "")).trim() || "Folder";
  if (!isRoot) {
    list.push({ value: String(node.id), label, depth });
  }
  const nextDepth = isRoot ? 0 : depth + 1;
  for (const c of node.children) {
    if (c.children) list.push(...getFolderPathsFromTree(c, nextDepth));
  }
  return list;
}

async function populateCleanupScopeDropdown() {
  const sel = $("cleanup-scope-folder");
  if (!sel) return;
  const data = await ensureData();
  const treeOptions = getFolderPathsFromTree(data.tree);
  const indentChar = "\u00A0\u00A0"; // two nbsp per level
  const options = [
    { value: "", label: "All bookmarks" },
    ...treeOptions.map((o) => ({ value: o.value, label: indentChar.repeat(o.depth) + o.label })),
  ];
  const current = sel.value;
  sel.innerHTML = options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
  if (options.some((o) => o.value === current)) sel.value = current;
}

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

  const data = await ensureData();
  const { bookmarks, folders } = data;
  const scopeId = $("cleanup-scope-folder")?.value || null;
  const scopeFolderIds = getCleanupScopeFolderIds(scopeId, folders);
  const bookmarksInScope = bookmarks.filter((b) => scopeFolderIds.has(b.parentId));
  duplicateGroups = findDuplicateGroups(bookmarksInScope);

  const folderMap = {};
  (data.folders || []).forEach((f) => {
    folderMap[f.id] = { title: f.title, parentId: f.parentId };
  });

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
      const folderPath = getFolderPath(item.parentId, folderMap);
      const folderPathHtml = folderPath ? `<div class="item-folder-path">${escapeHtml(folderPath)}</div>` : "";
      const itemDiv = document.createElement("div");
      itemDiv.className = "item";
      itemDiv.innerHTML = `
        <input type="checkbox" data-dup-id="${item.id}" data-group="${gi}" data-item="${ii}" />
        <div>
          <div class="item-title-wrap">
            <div class="item-title" data-item-title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
            <button type="button" class="item-edit-title" title="Edit name" aria-label="Edit name">✎</button>
            <button type="button" class="item-copy-title" title="Copy name" aria-label="Copy name">⎘</button>
          </div>
          <div class="item-url-wrap">
            <a class="item-url" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.url)}</a>
            <button type="button" class="item-edit-url" title="Edit URL" aria-label="Edit URL">✎</button>
            <button type="button" class="item-copy-url" title="Copy URL" aria-label="Copy URL">⎘</button>
          </div>
          ${folderPathHtml}
        </div>
      `;
      div.appendChild(itemDiv);
    });
    container.appendChild(div);
  });
  updateCleanupBottomBar();
});

$("dup-delete").addEventListener("click", async () => {
  const checked = document.querySelectorAll('input[data-dup-id]:checked');
  if (checked.length === 0) { showToast("Select at least one bookmark to delete."); return; }
  if (!confirm(`Delete ${checked.length} selected bookmark(s)? This cannot be undone.`)) return;
  for (const el of checked) {
    el.closest(".item")?.remove();
    await chrome.bookmarks.remove(el.dataset.dupId);
  }
  // Remove groups that have one or zero items left (no longer duplicates)
  $("dup-results").querySelectorAll(".group").forEach((group) => {
    if (group.querySelectorAll(".item").length <= 1) group.remove();
  });
  invalidateData();
  showToast(`Deleted ${checked.length} bookmark(s).`);
  scheduleCleanupRescan("dup-results");
  clearCleanupSelectionsAndHideBar();
});

// --- Empty folders ---
let emptyFolderList = [];

$("scan-empty").addEventListener("click", async () => {
  const status = $("empty-status");
  status.textContent = "Scanning…";
  status.className = "loading";
  $("empty-results").innerHTML = "";

  const { bookmarks, folders, tree } = await ensureData();
  const emptyIdsAll = findEmptyFolders(folders, bookmarks);
  const scopeId = $("cleanup-scope-folder")?.value || null;
  const scopeFolderIds = getCleanupScopeFolderIds(scopeId, folders);
  const emptyIds = emptyIdsAll.filter((id) => scopeFolderIds.has(id));
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
  updateCleanupBottomBar();
});

$("empty-delete").addEventListener("click", async () => {
  const checked = document.querySelectorAll('input[data-empty-id]:checked');
  if (checked.length === 0) { showToast("Select at least one folder to delete."); return; }
  if (!confirm(`Delete ${checked.length} selected empty folder(s)? This cannot be undone.`)) return;
  for (const el of checked) await chrome.bookmarks.remove(el.dataset.emptyId);
  invalidateData();
  showToast(`Deleted ${checked.length} folder(s).`);
  $("scan-empty").click();
  clearCleanupSelectionsAndHideBar();
});

// --- Merge folders ---
let mergeCandidates = [];

$("scan-merge").addEventListener("click", async () => {
  const status = $("merge-status");
  status.textContent = "Scanning…";
  status.className = "loading";
  $("merge-results").innerHTML = "";

  const { folders, tree } = await ensureData();
  const scopeId = $("cleanup-scope-folder")?.value || null;
  const scopeFolderIds = getCleanupScopeFolderIds(scopeId, folders);
  const scopeFolders = folders.filter((f) => scopeFolderIds.has(f.id));
  mergeCandidates = findMergeCandidates(scopeFolders);

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
  updateCleanupBottomBar();
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
  $("merge-results").innerHTML = "";
  clearCleanupSelectionsAndHideBar();
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

  const stripQuery = $("subset-strip-query").checked;
  const data = await ensureData();
  const { bookmarks, folders } = data;
  const scopeId = $("cleanup-scope-folder")?.value || null;
  const scopeFolderIds = getCleanupScopeFolderIds(scopeId, folders);
  const bookmarksInScope = bookmarks.filter((b) => scopeFolderIds.has(b.parentId));
  subsetGroups = findSubsetGroups(bookmarksInScope, { stripQuery });

  const folderMap = {};
  (data.folders || []).forEach((f) => {
    folderMap[f.id] = { title: f.title, parentId: f.parentId };
  });

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
      const folderPath = getFolderPath(item.parentId, folderMap);
      const folderPathHtml = folderPath ? `<div class="item-folder-path">${escapeHtml(folderPath)}</div>` : "";
      const keepHint = ii === 0 ? ' <span class="merge-target">(shortest – keep)</span>' : "";
      const itemDiv = document.createElement("div");
      itemDiv.className = "item";
      itemDiv.innerHTML = `
        <input type="checkbox" data-subset-id="${item.id}" data-group="${gi}" data-item="${ii}" />
        <div>
          <div class="item-title-wrap">
            <div class="item-title" data-item-title="${escapeHtml(item.title)}">${escapeHtml(item.title)}${keepHint}</div>
            <button type="button" class="item-edit-title" title="Edit name" aria-label="Edit name">✎</button>
            <button type="button" class="item-copy-title" title="Copy name" aria-label="Copy name">⎘</button>
          </div>
          <div class="item-url-wrap">
            <a class="item-url" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.url)}</a>
            <button type="button" class="item-edit-url" title="Edit URL" aria-label="Edit URL">✎</button>
            <button type="button" class="item-copy-url" title="Copy URL" aria-label="Copy URL">⎘</button>
          </div>
          ${folderPathHtml}
        </div>
      `;
      div.appendChild(itemDiv);
    });
    container.appendChild(div);
  });
  updateCleanupBottomBar();
});

$("subset-delete").addEventListener("click", async () => {
  const checked = document.querySelectorAll("input[data-subset-id]:checked");
  if (checked.length === 0) { showToast("Select at least one bookmark to delete."); return; }
  if (!confirm(`Delete ${checked.length} selected bookmark(s)? This cannot be undone.`)) return;
  for (const el of checked) {
    el.closest(".item")?.remove();
    await chrome.bookmarks.remove(el.dataset.subsetId);
  }
  invalidateData();
  showToast(`Deleted ${checked.length} bookmark(s).`);
  scheduleCleanupRescan("subset-results");
  clearCleanupSelectionsAndHideBar();
});

// --- Similar folder names ---
let similarFolderGroups = [];

$("scan-similar-folders").addEventListener("click", async () => {
  const status = $("similar-folders-status");
  status.textContent = "Scanning…";
  status.className = "loading";
  $("similar-folders-results").innerHTML = "";

  const { folders, tree } = await ensureData();
  const scopeId = $("cleanup-scope-folder")?.value || null;
  const scopeFolderIds = getCleanupScopeFolderIds(scopeId, folders);
  const scopeFolders = folders.filter((f) => scopeFolderIds.has(f.id));
  similarFolderGroups = findSimilarFolderGroups(scopeFolders, tree);

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
  updateCleanupBottomBar();
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
  $("similar-folders-results").innerHTML = "";
  clearCleanupSelectionsAndHideBar();
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

  const data = await ensureData();
  const { bookmarks, folders } = data;
  const scopeId = $("cleanup-scope-folder")?.value || null;
  const scopeFolderIds = getCleanupScopeFolderIds(scopeId, folders);
  const bookmarksInScope = bookmarks.filter((b) => scopeFolderIds.has(b.parentId));
  const httpBookmarks = bookmarksInScope.filter(
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

  const folderMap = {};
  (data.folders || []).forEach((f) => {
    folderMap[f.id] = { title: f.title, parentId: f.parentId };
  });

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
      const folderPath = getFolderPath(item.parentId, folderMap);
      const folderPathHtml = folderPath ? `<div class="item-folder-path">${escapeHtml(folderPath)}</div>` : "";
      const itemDiv = document.createElement("div");
      itemDiv.className = "item";
      const errText = item.status ? `${item.status}` : item.error || "Error";
      itemDiv.innerHTML = `
        <input type="checkbox" data-broken-id="${item.id}" />
        <div>
          <div class="item-title-wrap">
            <div class="item-title" data-item-title="${escapeHtml(item.title)}">${escapeHtml(item.title)} <span class="error-badge">${escapeHtml(errText)}</span></div>
            <button type="button" class="item-edit-title" title="Edit name" aria-label="Edit name">✎</button>
            <button type="button" class="item-copy-title" title="Copy name" aria-label="Copy name">⎘</button>
          </div>
          <div class="item-url-wrap">
            <a class="item-url" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.url)}</a>
            <button type="button" class="item-edit-url" title="Edit URL" aria-label="Edit URL">✎</button>
            <button type="button" class="item-copy-url" title="Copy URL" aria-label="Copy URL">⎘</button>
          </div>
          ${folderPathHtml}
        </div>
      `;
      div.appendChild(itemDiv);
    });
    container.appendChild(div);
  });
  updateCleanupBottomBar();
});

$("broken-delete").addEventListener("click", async () => {
  const checked = document.querySelectorAll("input[data-broken-id]:checked");
  if (checked.length === 0) { showToast("Select at least one bookmark to delete."); return; }
  if (!confirm(`Delete ${checked.length} selected bookmark(s)? This cannot be undone.`)) return;
  for (const el of checked) {
    el.closest(".item")?.remove();
    await chrome.bookmarks.remove(el.dataset.brokenId);
  }
  invalidateData();
  showToast(`Deleted ${checked.length} bookmark(s).`);
  $("broken-status").textContent = `Deleted ${checked.length}. Rescan in 15s when idle.`;
  scheduleCleanupRescan("broken-results");
  clearCleanupSelectionsAndHideBar();
});

// --- Cleanup result inline edit: edit icon → URL, double-click name → title ---
let cleanupRescanTimer = null;
const CLEANUP_RESCAN_IDLE_MS = 15000;
const cleanupRescanPending = { "dup-results": false, "subset-results": false, "broken-results": false };

function scheduleCleanupRescan(containerId) {
  if (!cleanupRescanPending.hasOwnProperty(containerId)) return;
  cleanupRescanPending[containerId] = true;
  if (cleanupRescanTimer) clearTimeout(cleanupRescanTimer);
  cleanupRescanTimer = setTimeout(() => {
    if (cleanupRescanPending["dup-results"]) $("scan-duplicates").click();
    if (cleanupRescanPending["subset-results"]) $("scan-subset").click();
    if (cleanupRescanPending["broken-results"]) $("scan-broken").click();
    cleanupRescanPending["dup-results"] = false;
    cleanupRescanPending["subset-results"] = false;
    cleanupRescanPending["broken-results"] = false;
    cleanupRescanTimer = null;
  }, CLEANUP_RESCAN_IDLE_MS);
}

function getCleanupBookmarkId(row) {
  const cb = row.querySelector("input[data-dup-id], input[data-subset-id], input[data-broken-id]");
  return cb ? (cb.dataset.dupId || cb.dataset.subsetId || cb.dataset.brokenId) : null;
}

function getCleanupScanButton(container) {
  if (!container) return null;
  const id = container.id;
  if (id === "dup-results") return $("scan-duplicates");
  if (id === "subset-results") return $("scan-subset");
  if (id === "broken-results") return $("scan-broken");
  return null;
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".item-edit-url");
  if (!btn) return;
  const wrap = btn.closest(".item-url-wrap");
  const container = wrap?.closest("#dup-results, #subset-results, #broken-results");
  if (!wrap || !container) return;
  const row = wrap.closest(".item");
  const bmId = getCleanupBookmarkId(row);
  if (!bmId) return;

  const link = wrap.querySelector(".item-url");
  const existingInput = wrap.querySelector(".item-url-input");
  if (existingInput) return;

  const currentUrl = link.href || "";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "item-url-input";
  input.value = currentUrl;
  input.setAttribute("size", "1");
  link.replaceWith(input);
  input.focus();
  input.select();

  async function commit() {
    input.removeEventListener("blur", commit);
    input.removeEventListener("keydown", onKey);
    const newUrl = input.value.trim();
    if (!newUrl) {
      restore();
      return;
    }
    try {
      await chrome.bookmarks.update(bmId, { url: newUrl });
      invalidateData();
      if (newUrl !== currentUrl) scheduleCleanupRescan(container.id);
    } catch (err) {
      showToast("Failed to save URL: " + err.message);
      restore();
    }
  }

  function restore() {
    const a = document.createElement("a");
    a.className = "item-url";
    a.href = input.value.trim() || currentUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = input.value.trim() || currentUrl;
    input.replaceWith(a);
  }

  function onKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      input.removeEventListener("blur", commit);
      input.removeEventListener("keydown", onKey);
      restore();
    }
  }

  input.addEventListener("blur", commit, { once: true });
  input.addEventListener("keydown", onKey);
});

function startCleanupTitleEdit(titleEl) {
  if (titleEl.classList.contains("editing")) return;
  const container = titleEl.closest("#dup-results, #subset-results, #broken-results");
  if (!container) return;
  const row = titleEl.closest(".item");
  const bmId = getCleanupBookmarkId(row);
  if (!bmId || !titleEl.dataset.itemTitle) return;

  const oldHtml = titleEl.innerHTML;
  const cleanTitle = titleEl.dataset.itemTitle;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "item-title-input";
  input.value = cleanTitle;
  titleEl.textContent = "";
  titleEl.classList.add("editing");
  titleEl.appendChild(input);
  input.focus();
  input.select();

  async function commit() {
    input.removeEventListener("blur", commit);
    input.removeEventListener("keydown", onKey);
    titleEl.classList.remove("editing");
    const newTitle = input.value.trim();
    if (!newTitle) {
      titleEl.innerHTML = oldHtml;
      return;
    }
    try {
      const tags = await getTagsForBookmark(bmId);
      const priorityMap = await loadPriorityMap();
      const builtTitle = buildTitle(newTitle, tags, priorityMap);
      await chrome.bookmarks.update(bmId, { title: builtTitle });
      invalidateData();
      if (newTitle !== cleanTitle) scheduleCleanupRescan(container.id);
    } catch (err) {
      showToast("Failed to save title: " + err.message);
      titleEl.innerHTML = oldHtml;
    }
  }

  function onKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      input.removeEventListener("blur", commit);
      input.removeEventListener("keydown", onKey);
      titleEl.classList.remove("editing");
      titleEl.innerHTML = oldHtml;
    }
  }

  input.addEventListener("blur", commit, { once: true });
  input.addEventListener("keydown", onKey);
}

document.addEventListener("dblclick", (e) => {
  const titleEl = e.target.closest(".item-title");
  if (!titleEl) return;
  startCleanupTitleEdit(titleEl);
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".item-edit-title");
  if (!btn) return;
  const wrap = btn.closest(".item-title-wrap");
  const container = wrap?.closest("#dup-results, #subset-results, #broken-results");
  if (!wrap || !container) return;
  const titleEl = wrap.querySelector(".item-title");
  if (!titleEl) return;
  e.preventDefault();
  startCleanupTitleEdit(titleEl);
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".item-copy-url");
  if (!btn) return;
  const wrap = btn.closest(".item-url-wrap");
  const link = wrap?.querySelector(".item-url");
  const input = wrap?.querySelector(".item-url-input");
  const url = link?.href || input?.value || "";
  if (!url) return;
  e.preventDefault();
  navigator.clipboard.writeText(url).then(() => showToast("Copied"), () => showToast("Copy failed"));
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".item-copy-title");
  if (!btn) return;
  const wrap = btn.closest(".item-title-wrap");
  const titleEl = wrap?.querySelector(".item-title");
  const text = (titleEl?.dataset.itemTitle ?? titleEl?.textContent?.trim()) || "";
  if (!text) return;
  e.preventDefault();
  navigator.clipboard.writeText(text).then(() => showToast("Copied"), () => showToast("Copy failed"));
});
