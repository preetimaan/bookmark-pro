/**
 * Find folders that are siblings (same parent) and have the same title.
 * Merge = move all children from others into one target, then remove empty folders.
 */

/**
 * @param {{ id: string, title: string, parentId: string, childIds: string[] }[]} folders
 * @returns {{ parentId: string, title: string, folderIds: string[] }[]} Groups of sibling folder ids with same title.
 */
function findMergeCandidates(folders) {
  const byParentAndTitle = new Map();
  for (const f of folders) {
    if (f.id === "0") continue; // root
    const key = `${f.parentId}\t${f.title}`;
    if (!byParentAndTitle.has(key)) byParentAndTitle.set(key, []);
    byParentAndTitle.get(key).push(f.id);
  }
  return Array.from(byParentAndTitle.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([key, folderIds]) => {
      const [parentId, title] = key.split("\t");
      return { parentId, title, folderIds };
    });
}

/**
 * Get folder path for display.
 * @param {string} folderId
 * @param {{ id: string, title: string, parentId: string }[]} folders
 * @param {chrome.bookmarks.BookmarkTreeNode} tree
 * @returns {string}
 */
function getFolderPath(folderId, folders, tree) {
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const pathById = new Map();

  function pathTo(node, segments = []) {
    if (!node) return "";
    const title = node.title || (node.id === "0" ? "Bookmarks" : node.id);
    const seg = [...segments, title];
    pathById.set(node.id, seg.join(" / "));
    if (node.children) {
      for (const c of node.children) pathTo(c, seg);
    }
  }
  pathTo(tree);
  return pathById.get(folderId) ?? folderId;
}
