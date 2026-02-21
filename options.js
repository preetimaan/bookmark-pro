/**
 * Options page: tabs, run scans, render results, handle delete/merge.
 */

let bookmarksData = null;

function $(id) {
  return document.getElementById(id);
}

function showToast(message) {
  const el = $("toast");
  el.textContent = message;
  el.style.display = "block";
  setTimeout(() => {
    el.style.display = "none";
  }, 3000);
}

// --- Tabs ---
document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $("panel-" + btn.dataset.tab).classList.add("active");
  });
});

// --- Load data ---
async function ensureData() {
  if (!bookmarksData) {
    bookmarksData = await loadBookmarks();
  }
  return bookmarksData;
}

// --- Duplicates ---
let duplicateGroups = [];

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
    const selectAllId = `dup-group-${gi}-all`;
    div.innerHTML = `
      <div class="group-header">
        <label><input type="checkbox" id="${selectAllId}" data-group="${gi}" data-dup-select-all /> Select all in group (to delete)</label>
      </div>
    `;
    group.items.forEach((item, ii) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "item";
      itemDiv.innerHTML = `
        <input type="checkbox" data-dup-id="${item.id}" data-group="${gi}" data-item="${ii}" />
        <div>
          <div class="item-title">${escapeHtml(item.title)}</div>
          <div class="item-url">${escapeHtml(item.url)}</div>
        </div>
      `;
      div.appendChild(itemDiv);
    });
    container.appendChild(div);
  });

  // Select-all: check all in group except first (suggest keep one)
  document.querySelectorAll(`[data-dup-select-all]`).forEach((cb) => {
    cb.addEventListener("change", function () {
      const gi = parseInt(this.dataset.group, 10);
      const group = duplicateGroups[gi];
      group.items.forEach((_, ii) => {
        const itemCb = document.querySelector(
          `input[data-dup-id][data-group="${gi}"][data-item="${ii}"]`
        );
        if (itemCb) itemCb.checked = ii > 0 ? this.checked : false; // keep first
      });
    });
  });

  $("dup-actions").style.display = "block";
});

$("dup-delete").addEventListener("click", async () => {
  const checked = document.querySelectorAll('input[data-dup-id]:checked');
  if (checked.length === 0) {
    showToast("Select at least one bookmark to delete.");
    return;
  }
  if (!confirm(`Delete ${checked.length} selected bookmark(s)? This cannot be undone.`)) return;

  for (const el of checked) {
    await chrome.bookmarks.remove(el.dataset.dupId);
  }
  bookmarksData = null;
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

  status.textContent =
    emptyFolderList.length === 0
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
      <div>
        <div class="item-title">${escapeHtml(f.title)}</div>
        <div class="item-url">${escapeHtml(f.path)}</div>
      </div>
    `;
    group.appendChild(itemDiv);
  });
  container.appendChild(group);

  $("empty-select-all").addEventListener("change", function () {
    document.querySelectorAll('input[data-empty-id]').forEach((cb) => {
      cb.checked = this.checked;
    });
  });

  $("empty-actions").style.display = "block";
});

$("empty-delete").addEventListener("click", async () => {
  const checked = document.querySelectorAll('input[data-empty-id]:checked');
  if (checked.length === 0) {
    showToast("Select at least one folder to delete.");
    return;
  }
  if (!confirm(`Delete ${checked.length} selected empty folder(s)? This cannot be undone.`)) return;

  for (const el of checked) {
    await chrome.bookmarks.remove(el.dataset.emptyId);
  }
  bookmarksData = null;
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

  status.textContent =
    mergeCandidates.length === 0
      ? "No merge candidates found."
      : `Found ${mergeCandidates.length} group(s) of same-name folders.`;
  status.className = "";

  if (mergeCandidates.length === 0) return;

  const container = $("merge-results");
  mergeCandidates.forEach((group, gi) => {
    const div = document.createElement("div");
    div.className = "group";
    const paths = group.folderIds.map((id) => getFolderPath(id, folders, tree));
    div.innerHTML = `
      <div class="group-header">
        <strong>${escapeHtml(group.title)}</strong> (${group.folderIds.length} folders) — choose one to keep, others will be merged into it.
      </div>
    `;
    group.folderIds.forEach((folderId, fi) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "item";
      itemDiv.innerHTML = `
        <input type="radio" name="merge-keep-${gi}" value="${folderId}" data-group="${gi}" ${fi === 0 ? "checked" : ""} />
        <div>
          <span class="item-title">${escapeHtml(paths[fi])}</span>
          <span class="merge-target">${fi === 0 ? " (keep this one)" : ""}</span>
        </div>
      `;
      const input = itemDiv.querySelector("input");
      input.addEventListener("change", function () {
        div.querySelectorAll("input[type=radio]").forEach((r) => {
          const target = r.nextElementSibling?.querySelector(".merge-target");
          if (target) target.textContent = r.checked ? " (keep this one)" : "";
        });
      });
      div.appendChild(itemDiv);
    });
    container.appendChild(div);
  });

  $("merge-actions").style.display = "block";
});

$("merge-do").addEventListener("click", async () => {
  const { folders, tree } = await ensureData();
  let merged = 0;
  for (let gi = 0; gi < mergeCandidates.length; gi++) {
    const group = mergeCandidates[gi];
    const keepId = document.querySelector(`input[name="merge-keep-${gi}"]:checked`)?.value;
    if (!keepId) continue;
    const others = group.folderIds.filter((id) => id !== keepId);
    for (const folderId of others) {
      const children = await chrome.bookmarks.getChildren(folderId);
      for (const child of children) {
        await chrome.bookmarks.move(child.id, { parentId: keepId });
      }
      await chrome.bookmarks.remove(folderId);
      merged++;
    }
  }
  bookmarksData = null;
  showToast(`Merged folders. Removed ${merged} duplicate folder(s).`);
  $("scan-merge").click();
});

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}
