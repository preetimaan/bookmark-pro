# Bookmark Pro

Chrome extension: full bookmark manager with cleanup tools, tag system, and folder management. Built on Chrome's Bookmarks API and Storage Sync — no backend, syncs across devices via Chrome account.

---

## How to run

1. Open Chrome → **`chrome://extensions`**.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** → select this project folder.
4. Click the extension icon to open the manager, or right-click → **Options**.

Reload the extension after editing files (click the refresh icon on the extension card at `chrome://extensions`). No build step; plain HTML, CSS, and JS.

---

## Status

### Cleanup tools

| Feature | Status |
|---------|--------|
| Find exact duplicate URLs | Done |
| Clean empty folders (recursive) | Done |
| Merge duplicate folders (same parent, same name) | Done |
| Find similar/subset URLs (prefix matching) | Done |
| Find similar folder names (nested, any parent) | Done |
| Broken-link checker (404, 403, 5xx, timeout, network) | Done |
| Clickable URLs in all results | Done |
| Select all / deselect all per group | Done |
| Backup warning | Done |

### Bookmark manager

| Feature | Status |
|---------|--------|
| Full-page manager UI (sidebar tree + main area) | Pending |
| Folder tree with expand/collapse | Pending |
| Bookmark list view (title, URL, tags, date) | Pending |
| Inline edit (title, URL) | Pending |
| Multi-select + bulk actions (move, tag, delete) | Pending |
| Search (title, URL, tags) | Pending |
| Drag and drop (reorder + move between folders) | Pending |
| Create / rename / delete folders | Pending |
| Import / export (JSON with tags) | Pending |

### Tag system

| Feature | Status |
|---------|--------|
| Add tags to bookmarks | Pending |
| Remove tags from bookmarks | Pending |
| Tags encoded in bookmark title (e.g. `Page Title [tag1, tag2]`) | Pending |
| Tags synced via `chrome.storage.sync` as source of truth | Pending |
| Tag autocomplete from existing tags | Pending |
| Priority tags (user-defined, shown first) | Pending |
| Non-priority tags sorted alphabetically after priority tags | Pending |
| Priority tag settings page | Pending |
| Bulk tag (multi-select → add/remove tag) | Pending |
| Filter bookmarks by tag | Pending |

---

## Architecture

```
bookmark-cleanup-extension/
├── manifest.json              # MV3; bookmarks, storage; optional host_permissions
├── background.js              # service worker: broken-link fetch, message handling
├── manager.html               # (pending) full bookmark manager UI
├── manager.js                 # (pending) tree, list, CRUD, drag-drop, search
├── options.html               # cleanup tools UI (current)
├── options.js                 # cleanup tools wiring
├── lib/
│   ├── bookmarks.js           # getTree, flatten, folder helpers
│   ├── duplicates.js          # exact duplicate URL grouping
│   ├── empty-folders.js       # recursive empty folder detection
│   ├── merge-folders.js       # same-parent same-name merge
│   ├── subset-finder.js       # subset/prefix URL groups
│   ├── similar-folders.js     # same-name folders across tree
│   ├── broken-links.js        # link check via background SW messaging
│   ├── tags.js                # (pending) tag CRUD, title encoding, storage sync
│   └── search.js              # (pending) search/filter logic
└── styles/
    └── manager.css            # (pending) manager UI styles
```

---

## Tag system design

### Storage

- **Source of truth:** `chrome.storage.sync` stores a map of `{ bookmarkId: ["tag1", "tag2"] }`.
- **Title encoding:** Tags are also written into the bookmark title as a suffix: `Page Title [tag1, tag2]`. This makes tags visible in Chrome's native bookmark bar/manager and portable if the extension is removed.
- Edits flow: user adds/removes tag → update `storage.sync` → rewrite bookmark title via `chrome.bookmarks.update`.
- On load: read tags from `storage.sync`. If a bookmark has tags in its title but not in storage (e.g. imported or manually edited), parse and sync.

### Tag ordering in title

Tags in the bookmark title follow this order:

1. **Priority tags first** — User defines priority tags and their order in settings (e.g. `["urgent", "work", "personal"]`). These appear first, in the defined priority order.
2. **Remaining tags alphabetically** — All other tags follow, sorted A–Z.

Example with priority tags `["work", "urgent"]`:
- Tags on bookmark: `reference`, `work`, `api`, `urgent`
- Title: `Page Title [work, urgent, api, reference]`

### Priority tag settings

- Stored in `chrome.storage.sync` under a `settings.priorityTags` key.
- UI: a settings section where the user can:
  - Add a tag name to the priority list.
  - Reorder priority tags (drag or up/down buttons).
  - Remove a tag from priority (it becomes a regular tag, sorted alphabetically).

### Tag operations

| Operation | What happens |
|-----------|-------------|
| Add tag to bookmark | Update `storage.sync` entry → rewrite title with new tag list → `chrome.bookmarks.update` |
| Remove tag from bookmark | Remove from `storage.sync` → rewrite title without that tag → `chrome.bookmarks.update` |
| Rename tag globally | Find all bookmarks with that tag in `storage.sync` → update each entry + rewrite each title |
| Delete tag globally | Same as rename but remove instead of replace |
| Bulk tag (multi-select) | For each selected bookmark, add/remove the tag, update storage + title |

### Title parsing

- Format: `Title [tag1, tag2, tag3]`
- Parser: strip trailing `[...]` from title, split by `,`, trim each.
- Writer: sort tags (priority first, then alphabetical), append ` [tag1, tag2]` to base title.
- Edge case: title already contains `[...]` that isn't tags — only parse the last `[...]` block.

### Storage sync limits

- `chrome.storage.sync`: 100KB total, 8KB per item, 512 items max.
- Strategy: batch bookmark tags into chunks (e.g. 100 bookmarks per storage key) to stay under the per-item limit.
- For users with 1000+ tagged bookmarks, consider overflow to `chrome.storage.local` (unlimited, but device-only).

---

## Bookmark manager design

### Layout

Two top-level tabs: **Bookmarks** (the manager) and **Cleanup** (all cleanup tools).

```
┌─────────────────────────────────────────────────────┐
│  Bookmark Pro              [ Bookmarks | Cleanup ]  ⚙│
├═════════════════════════════════════════════════════━┤
│                                                      │
│  BOOKMARKS TAB                                       │
│                                                      │
├──────────────┬──────────────────────────────────────┤
│              │  Search: [________________] [by tag ▼]│
│  FOLDERS     │──────────────────────────────────────│
│              │  [☐ Select all]  [+ Add bookmark]     │
│  ▼ Bookmarks │──────────────────────────────────────│
│    ▼ Work    │  ☐ Page Title          example.com    │
│      APIs    │    [work] [api]        2025-01-15     │
│      Docs    │──────────────────────────────────────│
│    ▶ Personal│  ☐ Another Page        other.com      │
│    ▶ Reading │    [reference]         2025-02-01     │
│  ▼ Other     │                                       │
│              │                                       │
├──────────────┴──────────────────────────────────────┤
│  [Delete selected]  [Move to...]  [Tag: _______ +]  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Bookmark Pro              [ Bookmarks | Cleanup ]  ⚙│
├═════════════════════════════════════════════════════━┤
│                                                      │
│  CLEANUP TAB                                         │
│                                                      │
│  [ Duplicates | Empty folders | Merge | Similar URLs │
│    | Similar folders | Broken links ]                │
│                                                      │
│  (existing cleanup UI — scan, results, actions)      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

- **Bookmarks tab:** Sidebar folder tree + main bookmark list with tags, search, multi-select, bulk actions.
- **Cleanup tab:** All existing cleanup tools as sub-tabs (duplicates, empty folders, merge, similar URLs, similar folders, broken links). Same UI as current implementation.
- **Settings (⚙):** Priority tags, excluded folders for scans.

### Bookmark CRUD

| Action | API |
|--------|-----|
| Create bookmark | `chrome.bookmarks.create({ parentId, title, url })` |
| Edit title/URL | `chrome.bookmarks.update(id, { title, url })` |
| Move to folder | `chrome.bookmarks.move(id, { parentId })` |
| Reorder | `chrome.bookmarks.move(id, { parentId, index })` |
| Delete | `chrome.bookmarks.remove(id)` |
| Create folder | `chrome.bookmarks.create({ parentId, title })` |
| Rename folder | `chrome.bookmarks.update(id, { title })` |
| Delete folder | `chrome.bookmarks.removeTree(id)` |

### Search

- Client-side filtering of the flattened bookmark list.
- Match against: title (without tag suffix), URL, tags.
- Filter modes: "All bookmarks" or "Current folder (recursive)."
- Tag filter: click a tag anywhere → filter to bookmarks with that tag.

### Permissions

```json
{
  "permissions": ["bookmarks", "storage"],
  "optional_host_permissions": ["<all_urls>"]
}
```

- `bookmarks`: always required.
- `storage`: for tags and settings (sync + local).
- `<all_urls>`: optional, requested only when running broken-link checker.

---

## Implementation order

1. **Tag system core** — `lib/tags.js`: read/write tags from `storage.sync`, parse/write title suffix, priority tag ordering. Settings UI for priority tags.
2. **Manager UI scaffold** — `manager.html` + `manager.css`: sidebar folder tree, main bookmark list, bottom action bar. Wire to `chrome.bookmarks.getTree`.
3. **Folder tree** — Expand/collapse, click to show bookmarks, create/rename/delete folder.
4. **Bookmark list** — Show bookmarks for selected folder. Inline edit title/URL. Show tags.
5. **Tag UI** — Click to add/remove tags on a bookmark. Autocomplete dropdown. Tags displayed as pills.
6. **Multi-select + bulk actions** — Checkbox per row, select all, bulk delete/move/tag.
7. **Search** — Search bar with title/URL/tag matching. Tag click → filter.
8. **Integrate cleanup tools** — Move current cleanup features into the manager sidebar or as a dedicated section.
9. **Drag and drop** — Reorder within folder, move between folders.
10. **Import/export** — Export bookmarks + tags as JSON. Import and reconcile.

---

## References

- [Chrome Bookmarks API](https://developer.chrome.com/docs/extensions/reference/bookmarks/)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Chrome Identity API](https://developer.chrome.com/docs/extensions/reference/identity/) (if needed later)
- [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)
