# Bookmark Cleanup Extension – Plan

Chrome extension for cleaning bookmarks: duplicates, empty folders, mergeable folders, subset/similar URLs, similar folder names, broken-link checking, and sorting. UI and feature set aligned with the original [Bookmarks clean up](https://chromewebstore.google.com/detail/bookmarks-clean-up/oncbjlgldmiagjophlhobkogeladjijl) extension.

---

## Goals

- **Primary:** Safe, local bookmark cleanup with clear sections per problem type (duplicates, empty folders, merge folders, etc.) and confirmation before any delete.
- **UX:** Match the original extension’s flow: dedicated sections/tabs per feature, select/deselect items, batch actions, backup warning.

---

## UI/UX alignment with original extension

- **Full-page UI** (options/side panel or tab), not just a tiny popup: room for lists, filters, and actions.
- **Sectioned or tabbed:** e.g. “Duplicate URLs” | “Empty folders” | “Merge folders” | “Similar URLs” (v2) | “Broken links” (v3) | “Sort” (v3).
- **Per section:** Run scan → show results grouped (e.g. duplicate groups, list of empty folders, merge candidates). Checkboxes to select what to remove/merge. “Select all” / “Deselect all” in each group. Clear “Delete selected” / “Merge selected” (etc.) with confirmation.
- **Settings:** Optional toggles (e.g. exclude certain folders from scans) in a gear/settings area.
- **Backup warning:** Prominent note that removed bookmarks can’t be restored; suggest exporting bookmarks first.
- **Loading states:** Spinner or “Scanning…” when running a scan (especially for broken links in v3).

---

## Version roadmap

| Version | Features |
|--------|----------|
| **v1** | Exact duplicate URLs, clean empty folders, merge duplicate folders |
| **v2** | Similar/subset URLs, similar folder names (including nested) |
| **v3** | Broken-link checking (404, 403, etc.), sort features |

---

## V1 – Exact duplicates, empty folders, merge folders

### V1 scope

- **Find exact duplicate URLs** – Same URL in multiple bookmarks (any folder). Group by URL; user selects which to keep, rest get deleted.
- **Clean empty folders** – List all bookmark folders that have no children (or only empty subfolders, recursively). User selects folders to remove.
- **Merge duplicate folders** – Folders with the same name under the same parent. Show merge candidates; user chooses “merge into one” (move all children into one folder, delete the other empty folders).
- **Permissions:** `bookmarks` only. Manifest V3.
- **UI:** One page with three sections (or three tabs): Duplicates | Empty folders | Merge folders. Same interaction pattern: scan → results with checkboxes → batch action.

### V1 data flow

1. **Duplicates:** `getTree()` → flatten to bookmark nodes (skip folders) → group by `url` (normalize: strip `#` and optionally `?` if we add a toggle) → render each group; user marks “keep one, delete others” → `chrome.bookmarks.remove(id)` for selected.
2. **Empty folders:** `getTree()` → collect all folders → for each folder, check if it has no bookmark children and no non-empty subfolders (recursive) → list those; user selects → `chrome.bookmarks.remove(id)` for selected folders.
3. **Merge folders:** `getTree()` → for each parent, find folders with identical title (same parent) → groups of “siblings with same name”; user picks one target per group, “Merge” → move all children from others into target (`chrome.bookmarks.move` or create under target + remove from source), then remove empty folders.

### V1 edge cases

- **Duplicates:** `https://a.com` vs `https://a.com/` vs `https://a.com#x` – optional normalization (trailing slash, strip fragment; query optional).
- **Empty folders:** Nested empty A → B → C: list all three or only “leaf” empties (v1: list all that are empty after recursive check).
- **Merge:** Only merge siblings (same parent). Same name in different parents = different sections in UI (no cross-parent merge in v1).

### V1 implementation order

1. Scaffold: manifest (MV3, bookmarks), single options/full page HTML + JS.
2. Shared: `getTree()` + flatten helpers (bookmarks list, folders list, parent/child map).
3. Duplicates: group by URL → UI section → select + delete.
4. Empty folders: detect recursive empty → UI section → select + delete.
5. Merge folders: find same-name siblings → UI section → choose target → move children → delete empty.
6. Backup warning, “Select all / Deselect all” per group, loading state.

---

## V2 – Similar/subset URLs, similar folder names

### V2 scope

- **Find similar/subset URLs** – URLs where one is a prefix of another (e.g. `example.com` and `example.com/page`), or same path with different `#` / `?`. Normalize (strip fragment, optional query), group “subset families,” let user delete chosen bookmarks.
- **Find similar folder names (nested)** – Folders with similar or identical names even in different parts of the tree (e.g. “Work” under A and “Work” under B). List merge candidates; user can merge (move contents into one, remove others) or just review. “Similar” = exact match in v2; fuzzy (e.g. “Work” vs “work”) can be optional.

### V2 subset-URL logic

- **Normalize:** Strip `#...`; optional strip `?...`; optional normalize trailing slash.
- **Subset:** A and B in same group if normalized A is prefix of normalized B (with path boundary) or equal. Build transitive groups.
- **UI:** Section “Similar / subset URLs” with groups; checkboxes “remove this”; suggest “keep shortest” by default.

### V2 similar folder names

- **Collect:** All folders with (normalized) title; group by title (and optionally by “similar” if we add fuzzy).
- **Display:** Groups of folders that share a name; show path (e.g. “Bookmarks bar / Work”, “Other / Projects / Work”). User can “Merge” (pick target, move all children from others into it, delete empty) or “Delete” selected empty ones.
- **Nested:** Same name in different parents both included; merge is explicit (user picks which folder becomes the target).

### V2 implementation order

1. Subset finder lib: `normalizeUrl(options)`, `findSubsetGroups(bookmarks, options)`.
2. UI section “Similar URLs”: run finder, render groups, checkboxes, delete selected.
3. Similar-folders: group folders by title, show with path; merge flow (move children, remove empties).

---

## V3 – Broken-link checking, sort

### V3 scope

- **Broken-link checking** – For selected bookmarks (or “all”), fetch URL (e.g. `fetch` with `mode: 'no-cors'` or head request). Detect 404, 403, timeout, DNS/connection errors. List by error type; user can delete or export list. **Permission:** `host_permissions` (e.g. `<all_urls>`) or per-origin; request only when user runs “Check broken links” (like original extension).
- **Sort features** – Sort bookmarks (and/or folders) by title, dateAdded, URL; recursive (whole tree or per folder). Optional “Sort all” action. Use `chrome.bookmarks.move` to reorder.

### V3 broken-link details

- **Detection:** HTTP status 4xx/5xx, network errors, timeouts. Group results: “404”, “403”, “Timeout”, “Other errors”.
- **Safety:** Optional permission; explain in UI (“This feature needs access to open links to check them”). Don’t run automatically; user clicks “Check broken links.”
- **Deceptive site warning:** If Chrome shows “deceptive site” etc., document that user can disable that check in Chrome settings or remove the flagged bookmark manually.

### V3 sort details (implemented)

- **Options:** Sort by title (A–Z), date added (newest/oldest), URL. Scope: current folder.
- **UI:** Sort dropdown in Bookmarks toolbar; applies **permanently** via `chrome.bookmarks.move` (reorders children in Chrome).
- **Tags in titles:** Implemented with `#tag1 #tag2 Base Title` format; priority tags (1–3) first, then alphabetical. Tags tab: priority section (↑/↓, Remove), “Add to priority,” inline rename, search.

### V3 implementation order

1. Broken links: request optional host permission when user enters “Broken links” section or clicks “Check.” Fetch each URL (head or get), classify status, list by group, delete selected.
2. Sort: add “Sort” section; by title/date/URL, apply `chrome.bookmarks.getChildren` + sort + `move` to reorder.

---

## Recent UX (manager)

- **Folder create/rename/delete (Group 1)** — “New folder” button in sidebar creates a folder under the selected folder (or Bookmarks bar) and starts rename. Rename: double-click folder name or click ✎; delete: click ⌫ with confirmation; delete recursively removes folder and all contents. Root folders (Bookmarks bar / Other bookmarks) cannot be renamed or deleted.
- **Add bookmark / Add folder (Group 2)** — Main toolbar: “Add bookmark” adds the current window’s first non-extension tab (or active page tab) into the selected folder; requires `tabs` permission. “Add folder” creates a new subfolder in the selected folder (same as sidebar “New folder”).
- **Drag and drop (Group 3)** — Bookmark list: drag bookmarks or folder entries to reorder (same folder) or drop on a sidebar folder to move. Sidebar: drag folder rows to move into another folder or into the list. Drop indicator line in list; folder rows highlight as drop targets. Cannot drop a folder into itself or a descendant.
- **Context menu (Group 4)** — Right-click on bookmark row: Open in new tab, Copy URL, Copy name, Edit, Delete. Right-click on folder (main list or sidebar): Open folder (list only), Rename, Delete. In-page menu (no chrome.contextMenus); closes on click outside or Escape.
- **Import / Export (Group 5)** — Export as HTML (Netscape Bookmark File format) or as JSON (full tree + tags keyed by bookmark id). Import from HTML (parse DL/DT/A and H3+DL) or from JSON (create tree under selected folder, map old ids to new ids, apply tags). Import target: selected folder or Bookmarks bar.
- **Scope** — Cleanup scans can be limited to a folder: dropdown with tree-style list (indented). “All bookmarks” or pick a folder; only that subtree is scanned.
- **Inline edit in cleanup** — Edit icon (✎) next to name and URL in duplicate/similar-URL/broken results; copy icon (⎘) next to name and URL. Double-click name also edits title.
- **Rescan** — After edit or delete in cleanup, rescan is debounced (15s idle). No rescan if user only opens edit and cancels or saves without changing value.
- **Delete flow** — After deleting from duplicate/similar/broken results: remove deleted rows from DOM; remove duplicate groups that have ≤1 item left; clear selections and hide bottom bar. Same for empty/merge/similar-folders.
- **Layout** — Result items wrap (no horizontal scroll); edit/copy buttons in wrap.

---

## Architecture (evolving)

```
bookmark-cleanup-extension/
├── manifest.json           # MV3; bookmarks; optional host_permissions in v3
├── PLAN.md
├── icons/                  # 16, 48, 128
├── options.html            # Full-page UI (tabs or sections)
├── options.js              # Orchestration, chrome.bookmarks calls
├── lib/
│   ├── bookmarks.js        # getTree, flatten, folders, parent map
│   ├── duplicates.js      # exact duplicate grouping (v1)
│   ├── empty-folders.js    # recursive empty detection (v1)
│   ├── merge-folders.js    # same-parent same-name merge (v1)
│   ├── subset-finder.js    # subset URL groups (v2)
│   ├── similar-folders.js  # same-name folder groups, nested (v2)
│   ├── broken-links.js     # fetch + status classification (v3)
│   └── sort.js             # reorder by title/date/URL (v3)
└── (optional) background.js  # only if we need persistent state or delayed work in v3)
```

- No remote server; all logic and data local.

---

## Tags and title format (implemented)

- **Title format:** `#tag1 #tag2 Base Title`. Tags at start with `#` prefix; add/remove tag updates bookmark title. Legacy `Title [tag1, tag2]` still parsed.
- **Priority:** Up to 3 priority tags (1–3) in Tags tab; order by ↑/↓; “Add to priority” / “Remove.” Priority order used when building title.
- **Tags tab UI:** Priority section (with note), search + add-new-tag on one line, “All tags” with search filter; inline rename (click tag name), Delete, Add to priority.

---

## Testing (manual)

- **v1:** Create exact duplicate URLs in different folders; nested empty folders; same-name sibling folders. Run each section, delete/merge, verify in Chrome bookmarks.
- **v2:** Create subset URLs (`a.com`, `a.com/p`); same-named folders in different parents. Run similar-URL and similar-folder sections.
- **v3:** Add bookmarks to 404/403/test URLs; run broken-link check. Sort a folder by title and by date.

---

## References

- [Chrome Bookmarks API](https://developer.chrome.com/docs/extensions/reference/bookmarks/)
- [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Bookmarks clean up](https://chromewebstore.google.com/detail/bookmarks-clean-up/oncbjlgldmiagjophlhobkogeladjijl) (reference UI/features)
