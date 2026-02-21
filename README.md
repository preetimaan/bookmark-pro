# Bookmark Cleanup

Chrome extension to clean bookmarks: find duplicate URLs, remove empty folders, merge same-name folders.

## How to run

1. Open Chrome and go to **`chrome://extensions`**.
2. Turn on **Developer mode** (toggle in the top-right).
3. Click **Load unpacked**.
4. Select the `bookmark-cleanup-extension` folder (this project root).
5. The extension will appear in your toolbar. Click its icon to open the cleanup page, or right-click the icon → **Options**.

## Usage

- **Duplicate URLs** — Find bookmarks with the same URL (fragment and trailing slash normalized). Select which to delete; keep at least one per group.
- **Empty folders** — List folders that have no bookmarks (recursively). Select folders to remove.
- **Merge folders** — Find sibling folders with the same name. Choose one to keep; others are merged into it and then removed.

**Back up first:** Export bookmarks (Chrome → Bookmarks → Bookmark manager → ⋮ → Export bookmarks) before deleting. Removed bookmarks cannot be restored.

## Development

- Edit files in this folder. Reload the extension at `chrome://extensions` (click the refresh icon on the card) to pick up changes.
- No build step; plain HTML, CSS, and JS.

## Plan

See [PLAN.md](./PLAN.md) for the full roadmap (v1: duplicates, empty folders, merge; v2: subset URLs, similar folder names; v3: broken-link check, sort).
