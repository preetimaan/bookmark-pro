/**
 * Find folders that are empty (no bookmarks in this folder or any descendant), recursively.
 */

/**
 * @param {{ id: string, title: string, parentId: string, childIds: string[] }[]} folders
 * @param {{ id: string, url: string, title: string, parentId: string }[]} bookmarks
 * @returns {string[]} Folder ids that are empty (no bookmarks in self or any descendant). Excludes root.
 */
function findEmptyFolders(folders, bookmarks) {
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const bookmarkParentIds = new Set(bookmarks.map((b) => b.parentId));

  /** True if this folder or any descendant contains a bookmark. */
  function hasBookmarksInSubtree(folderId) {
    if (bookmarkParentIds.has(folderId)) return true;
    const folder = folderById.get(folderId);
    if (!folder || !folder.childIds.length) return false;
    return folder.childIds.some((cid) => hasBookmarksInSubtree(cid));
  }

  return folders
    .filter((f) => f.id !== "0")
    .filter((f) => !hasBookmarksInSubtree(f.id))
    .map((f) => f.id);
}

/**
 * Get folder details for given ids.
 * @param {string[]} folderIds
 * @param {{ id: string, title: string, parentId: string, childIds: string[] }[]} folders
 * @param {chrome.bookmarks.BookmarkTreeNode} tree - root node for path resolution
 * @returns {{ id: string, title: string, path: string }[]}
 */
function getEmptyFolderDetails(folderIds, folders, tree) {
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const pathById = new Map();

  function pathTo(node, segments = []) {
    if (!node) return;
    const title = node.title || (node.id === "0" ? "Bookmarks" : node.id);
    const seg = [...segments, title];
    pathById.set(node.id, seg.join(" / "));
    if (node.children) {
      for (const c of node.children) pathTo(c, seg);
    }
  }
  pathTo(tree);

  return folderIds.map((id) => ({
    id,
    title: folderById.get(id)?.title ?? "",
    path: pathById.get(id) ?? id,
  }));
}
