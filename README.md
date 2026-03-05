# Bookmark Pro

Chrome extension: bookmark manager with tags, folder tree, and cleanup tools. Uses Chrome’s Bookmarks API and Storage Sync — no backend; tags sync across devices with your Chrome account.

---

## How to run

1. Open Chrome → **`chrome://extensions`**.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** → select the **bookmark-pro** folder.
4. Open the manager via the extension icon or right-click → **Options**.

Reload the extension after code changes (refresh icon on the extension card). No build step; plain HTML, CSS, and JS.

---

## Features

### Bookmarks tab

- **Folder tree** — Sidebar with expand/collapse (state kept when switching tabs). Each folder shows a **total count** of bookmarks (recursive: folder + all subfolders). **New folder** button creates a folder under the selected folder (or Bookmarks bar). **Rename** via double-click on folder name or ✎ icon; **delete** via ⌫ (with confirmation; recursively removes folder and contents). Sidebar width is **resizable** (drag handle); width persists.
- **Main pane** — Shows subfolders and bookmarks for the selected folder. **Add bookmark** adds the current window’s first non-extension tab (or the active tab if it’s a page) into the selected folder. **Add folder** creates a new subfolder in the selected folder (same as sidebar “New folder”). **Drag and drop** — Drag bookmarks or folders in the list to reorder; drag onto a folder in the sidebar to move into that folder. When **multiple bookmarks are selected**, dragging any selected row moves the **whole selection** to the drop target (folder or new position in list). Drag sidebar folders to another folder or into the list. Folder context menu: **Merge into folder…** to manually merge a folder into another. Content wraps (no horizontal scroll).
- **Inline edit** — Double-click title or URL to edit, or click ✎ next to name or URL; tags stay in sync. **Copy** (⎘) next to name and URL to copy to clipboard.
- **Context menu** — Right-click a bookmark: Open in new tab, Copy URL, Copy name, Edit, Delete. Right-click a folder (in list or sidebar): Open folder / Rename, Delete.
- **Tags** — Add/remove tags per bookmark; pills use a hash-based color. Autocomplete from existing tags.
- **Multi-select** — Select all, deselect all, bulk delete, move to folder, bulk tag.
- **Search** — Filters by title, URL, or tag across all bookmarks.
- **Sort** — Dropdown: title A–Z/Z–A, date newest/oldest, URL A–Z/Z–A. Sort is **permanent** (reorders bookmarks in Chrome via `chrome.bookmarks.move`).
- **Import / Export** — **Export:** as HTML (Netscape format, for backup or use in other apps) or as JSON (includes tags; for backup and restore). **Import:** from HTML or from Bookmark Pro JSON; imports into the selected folder (or Bookmarks bar).

### Tags tab

- List all tags (from bookmarks and “known” tags) with bookmark count.
- **Add** — New tag name (for autocomplete / priority).
- **Rename** — Rename a tag everywhere.
- **Delete** — Remove tag from all bookmarks (with confirmation). Shows “Updating bookmarks…” during the operation.

### Cleanup tab

- **Duplicate URLs** — Find and delete exact duplicates. **Select by folder:** dropdown (includes parent folders) + “Select in folder” to select duplicates in that folder and its descendants. “Select all but oldest (per folder)” selects all except the oldest in each folder for each duplicate group.
- **Empty folders** — Find and remove recursively empty folders.
- **Merge folders** — Same-name folders anywhere in the tree; merge into one (duplicate bookmarks by URL skipped; same-name subfolders merged recursively).
- **Similar URLs** — Prefix/subset URL groups; optional strip query.
- **Similar folders** — Same-name folders anywhere in the tree; merge into one (same as Merge folders).
- **Broken links** — Check for 404, 403, timeouts, etc. (requests `<all_urls>` when used). HEAD then GET retry with delay.

### Theme

- Follows system light/dark. Neutral black/gray palette (no blue accent).

---

## Status

| Area            | Feature                          | Status |
|-----------------|-----------------------------------|--------|
| **Bookmarks**   | Folder tree, expand/collapse, total count (recursive) | Done   |
|                 | Resizable sidebar (persisted width) | Done   |
|                 | Add bookmark / Add folder (toolbar) | Done (Group 2) |
|                 | Bookmark list, mixed folders+URLs | Done   |
|                 | Inline edit title/URL            | Done   |
|                 | Tags on bookmarks, pills, +tag   | Done   |
|                 | Multi-select, bulk delete/move/tag | Done |
|                 | Multi-select drag (move selection to folder / reorder) | Done |
|                 | Search (title, URL, tag)         | Done   |
|                 | Permanent sort (folder)         | Done   |
|                 | Manual merge: Merge into folder… (context menu) | Done   |
| **Tags**        | Tags tab, add/rename/delete      | Done   |
|                 | Title encoding `#tag1 #tag2 Title` | Done  |
|                 | storage.sync, priority (1–3), search, inline rename | Done |
|                 | Filter by tag                    | Via search |
| **Cleanup**     | Duplicates, empty, merge         | Done   |
|                 | Duplicates: select by folder, select all but oldest (per folder) | Done   |
|                 | Merge: same-name anywhere; skip duplicate URLs; manual merge    | Done   |
|                 | Similar URLs, similar folders    | Done   |
|                 | Broken links                     | Done   |
|                 | Scope (folder tree dropdown)     | Done   |
|                 | Inline edit/copy in results     | Done   |
|                 | 15s debounced rescan, clear selection after action | Done   |
| **Future**      | Drag and drop reorder/move       | Done (Group 3) |
|                 | Create/rename/delete folders     | Done (Group 1) |
|                 | Right-click context menu        | Done (Group 4) |
|                 | Import/export (JSON with tags)   | Done (Group 5) |

---

## Project layout

```
bookmark-pro/
├── manifest.json       # MV3; name "Bookmark Pro"; bookmarks, storage
├── background.js       # Service worker: open options, broken-link fetch
├── manager.html        # Main UI: Bookmarks | Tags | Cleanup
├── manager.js          # Tabs, folder tree, bookmark list, tags, cleanup wiring
├── options.html        # Legacy cleanup-only UI (optional)
├── options.js          # Cleanup logic (also used by manager via Cleanup tab)
├── lib/
│   ├── bookmarks.js    # getTree, flatten, folder helpers
│   ├── tags.js         # Tag CRUD, title encoding, storage.sync, priority
│   ├── duplicates.js   # Exact duplicate URL groups
│   ├── empty-folders.js
│   ├── merge-folders.js
│   ├── subset-finder.js
│   ├── similar-folders.js
│   └── broken-links.js  # Link check via background messaging
├── README.md
└── PLAN.md
```

---

## Tag system (short)

- **Storage:** `chrome.storage.sync` holds `{ bookmarkId: ["tag1", "tag2"] }` and a priority map (up to 3 tags with order 1–3).
- **Title:** Tags are written at the **start** of the title with a `#` prefix: `#tag1 #tag2 Base Title`. Order: priority tags (1–3) first, then the rest alphabetically. Adding/removing a tag updates the bookmark title; legacy format `Title [tag1, tag2]` is still parsed.
- **Sync:** Add/remove/rename/delete tag updates storage and rewrites the bookmark title so Chrome’s native UI and other devices see the same tags.

---

## Permissions

- **bookmarks** — Read and modify bookmarks.
- **storage** — Tags and settings (sync).
- **optional_host_permissions: \<all_urls>** — Requested when you run the broken-link checker.

---

## References

- [Chrome Bookmarks API](https://developer.chrome.com/docs/extensions/reference/bookmarks/)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)
