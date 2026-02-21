/**
 * Shared bookmark tree helpers.
 */

/**
 * @typedef {chrome.bookmarks.BookmarkTreeNode}
 */

/**
 * Flatten tree to list of bookmark nodes (no folders).
 * @param {chrome.bookmarks.BookmarkTreeNode} node
 * @returns {{ id: string, url: string, title: string, parentId: string }[]}
 */
function flattenBookmarks(node) {
  const out = [];
  function walk(n) {
    if (n.url) {
      out.push({
        id: n.id,
        url: n.url,
        title: n.title || n.url,
        parentId: n.parentId,
      });
    }
    if (n.children) {
      for (const c of n.children) walk(c);
    }
  }
  walk(node);
  return out;
}

/**
 * Flatten tree to list of folder nodes (id, title, parentId, children ids).
 * @param {chrome.bookmarks.BookmarkTreeNode} node
 * @returns {{ id: string, title: string, parentId: string, childIds: string[] }[]}
 */
function flattenFolders(node) {
  const out = [];
  function walk(n) {
    if (n.children) {
      const childIds = n.children.map((c) => c.id);
      out.push({
        id: n.id,
        title: n.title || "",
        parentId: n.parentId,
        childIds,
      });
      for (const c of n.children) walk(c);
    }
  }
  walk(node);
  return out;
}

/**
 * Get full tree and return flattened bookmarks and folders.
 * @returns {Promise<{ bookmarks: ReturnType<typeof flattenBookmarks>, folders: ReturnType<typeof flattenFolders>, tree: chrome.bookmarks.BookmarkTreeNode[] }>}
 */
async function loadBookmarks() {
  const tree = await chrome.bookmarks.getTree();
  const bookmarks = flattenBookmarks(tree[0]);
  const folders = flattenFolders(tree[0]);
  return { bookmarks, folders, tree: tree[0] };
}
