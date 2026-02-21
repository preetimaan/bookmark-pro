/**
 * Bookmark Pro manager: top-level tabs (Bookmarks | Cleanup),
 * folder tree, bookmark list, and all cleanup tools.
 */

let bookmarksData = null;
let selectedFolderId = null;

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
    $("view-" + btn.dataset.view).classList.add("active");
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

  row.innerHTML = `
    <span class="arrow">${hasSubfolders ? "▶" : ""}</span>
    <span class="folder-name">${escapeHtml(node.title || "Bookmarks")}</span>
    <span class="folder-count">${bookmarkCount}</span>
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
      }
    }
  });

  li.appendChild(row);

  const subFolders = node.children.filter((c) => c.children);
  if (subFolders.length > 0) {
    const ul = document.createElement("ul");
    ul.style.display = "none";
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
  const bookmarks = children.filter((c) => c.url);
  const container = $("bookmark-list");
  const allTags = await loadAllTags();

  if (bookmarks.length === 0) {
    container.innerHTML = '<div class="empty-state">No bookmarks in this folder.</div>';
    return;
  }

  container.innerHTML = "";
  for (const bm of bookmarks) {
    const { baseTitle } = parseTitle(bm.title);
    const tags = allTags[bm.id] || [];
    const dateStr = bm.dateAdded ? new Date(bm.dateAdded).toLocaleDateString() : "";

    const row = document.createElement("div");
    row.className = "bookmark-row";
    row.dataset.id = bm.id;
    row.innerHTML = `
      <input type="checkbox" data-bm-id="${bm.id}" />
      <div class="bookmark-info">
        <div class="bookmark-title">${escapeHtml(baseTitle)}</div>
        <a class="bookmark-url" href="${escapeHtml(bm.url)}" target="_blank" rel="noopener">${escapeHtml(bm.url)}</a>
        <div class="bookmark-tags">${tags.map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("")}</div>
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
$("bookmark-list").addEventListener("change", (e) => {
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
}

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
