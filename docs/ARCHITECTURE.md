# Bookmark Pro — Architecture

Chrome Extension (Manifest V3) bookmark manager. No backend, no build step — plain HTML/CSS/JS loaded as an unpacked extension.

## System boundary

```
User
  │
  ▼
┌─────────────────────────────────────────────┐
│  manager.html + manager.js  (options page)  │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│  │ Bookmarks│ │ Tags     │ │ Cleanup     │  │
│  └────┬─────┘ └────┬─────┘ └──────┬──────┘  │
│       └────────────┼──────────────┘         │
│                    ▼                        │
│              lib/*.js (pure logic)          │
└──────────┬──────────────────┬───────────────┘
           │                  │
           ▼                  ▼
  chrome.bookmarks.*   chrome.storage.sync
  chrome.tabs.*        localStorage (UI prefs)
           │
           ▼ (broken-link checks only)
  background.js (service worker)
       fetch HEAD → GET retry
```

## Layering

| Layer | Files | Responsibility |
|-------|-------|----------------|
| **Manifest / entry** | `manifest.json`, `background.js` | MV3 config, icon click → open manager, proxy fetches for link checks |
| **UI shell** | `manager.html` | Three-tab layout (Bookmarks, Tags, Cleanup), CSS, script load order |
| **Orchestration** | `manager.js` (~3k lines) | Chrome API calls, event wiring, drag-drop, import/export, cleanup UX |
| **Algorithms** | `lib/*.js` | Tree flattening, duplicate/empty/merge/subset detection, tag encoding, broken-link batching |
| **Legacy** | `options.html`, `options.js` | Standalone cleanup UI; logic ported into manager |

Algorithms stay pure (in-memory structures). Chrome I/O lives in `manager.js`.

## Data model

**Bookmarks** — Chrome Bookmarks API is source of truth. Cross-device sync is Chrome Sync, not the extension.

**Tags** — Dual-write design:
1. `chrome.storage.sync` map: `{ bookmarkId: [tags] }`
2. Title encoding: `#tag1 #tag2 Base Title` so tags appear in native Chrome UI and on other devices

Legacy format `Title [tag1, tag2]` still parsed.

**UI state** — `localStorage`: sidebar width, expanded folder IDs. Local-only, not synced.

## Key flows

### Bookmark change → UI refresh

`chrome.bookmarks.onCreated/onChanged/onMoved/onRemoved/onChildrenReordered` → `refreshViewAfterBookmarkChange()`. Handles external changes (other devices, other clients).

### Cleanup scan → action

1. `loadBookmarks()` → flatten tree to `{ bookmarks, folders, tree }`
2. `lib/*` analyzes in memory (scoped by folder subtree if selected)
3. User confirms → `chrome.bookmarks.remove/move` or custom merge
4. `invalidateData()` + optional debounced rescan (15s idle after inline edits)

### Broken links

Options page CSP blocks arbitrary fetches → `lib/broken-links.js` sends `chrome.runtime.sendMessage({ type: "checkUrl" })` to `background.js`. HEAD first, random 500–2000ms delay, GET retry. Requires `<all_urls>` permission at runtime.

### Smart folder merge

`mergeFolderIntoWithDedupe()` — recursive merge, skip duplicate URLs by URL, merge same-named subfolders. Used by cleanup and manual "Merge into folder…".

## Design decisions (explain these)

1. **No build step** — Load unpacked; global scripts via ordered `<script>` tags. Tradeoff: monolithic `manager.js`.
2. **Tags in titles** — Sync metadata without a separate tag sync layer; readable in native bookmark UI.
3. **Service worker only for fetch** — Minimal background script; everything else runs in the options page.
4. **Permanent sort** — Reorders via `chrome.bookmarks.move`, not a view-only filter.
5. **YouTube-aware subset grouping** — `subset-finder.js` normalizes to `youtube:VIDEO_ID` for playlist/query variants.
6. **System theme** — CSS `light-dark()` + `color-scheme`; neutral gray palette.

## Extension points

- New cleanup tool: add `lib/<tool>.js`, wire panel in `manager.html` + scan handler in `manager.js`
- New tag behavior: extend `lib/tags.js`; title encoding stays the sync contract
- New permission: update `manifest.json` + runtime request before use

## Related docs

- `README.md` — features, install, status table
- `PLAN.md` — roadmap, UX notes, manual test checklist
