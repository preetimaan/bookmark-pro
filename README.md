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

- **Folder tree** — Sidebar with expand/collapse (state kept when switching tabs).
- **Main pane** — Shows subfolders and bookmarks for the selected folder. Mixed folders list both.
- **Inline edit** — Double-click title or URL to edit; tags stay in sync.
- **Tags** — Add/remove tags per bookmark; pills use a hash-based color. Autocomplete from existing tags.
- **Multi-select** — Select all, deselect all, bulk delete, move to folder, bulk tag.
- **Search** — Filters by title, URL, or tag across all bookmarks.
- **Sort** — Dropdown: title A–Z/Z–A, date newest/oldest, URL A–Z/Z–A. Sort is **permanent** (reorders bookmarks in Chrome via `chrome.bookmarks.move`).

### Tags tab

- List all tags (from bookmarks and “known” tags) with bookmark count.
- **Add** — New tag name (for autocomplete / priority).
- **Rename** — Rename a tag everywhere.
- **Delete** — Remove tag from all bookmarks (with confirmation). Shows “Updating bookmarks…” during the operation.

### Cleanup tab

- **Duplicate URLs** — Find and delete exact duplicates.
- **Empty folders** — Find and remove recursively empty folders.
- **Merge folders** — Same name under same parent; pick one to keep.
- **Similar URLs** — Prefix/subset URL groups; optional strip query.
- **Similar folders** — Same-name folders anywhere in the tree; merge into one.
- **Broken links** — Check for 404, 403, timeouts, etc. (requests `<all_urls>` when used). HEAD then GET retry with delay.

### Theme

- Follows system light/dark. Neutral black/gray palette (no blue accent).

---

## Status

| Area            | Feature                          | Status |
|-----------------|-----------------------------------|--------|
| **Bookmarks**   | Folder tree, expand/collapse      | Done   |
|                 | Bookmark list, mixed folders+URLs | Done   |
|                 | Inline edit title/URL            | Done   |
|                 | Tags on bookmarks, pills, +tag   | Done   |
|                 | Multi-select, bulk delete/move/tag | Done |
|                 | Search (title, URL, tag)         | Done   |
|                 | Permanent sort (folder)         | Done   |
| **Tags**        | Tags tab, add/rename/delete      | Done   |
|                 | Title encoding `#tag1 #tag2 Title` | Done  |
|                 | storage.sync, priority (1–3), search, inline rename | Done |
|                 | Filter by tag                    | Via search |
| **Cleanup**     | Duplicates, empty, merge         | Done   |
|                 | Similar URLs, similar folders    | Done   |
|                 | Broken links                     | Done   |
| **Future**      | Drag and drop reorder/move       | Pending |
|                 | Create/rename/delete folders     | Pending |
|                 | Import/export (JSON with tags)   | Pending |

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
