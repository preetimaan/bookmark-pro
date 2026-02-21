/**
 * Find folders with the same name anywhere in the tree (nested, different parents).
 * Group by title; user can pick one to keep and merge others into it.
 */

/**
 * @param {{ id: string, title: string, parentId: string, childIds: string[] }[]} folders
 * @param {chrome.bookmarks.BookmarkTreeNode} tree
 * @returns {{ title: string, folders: { id: string, path: string }[] }[]} Groups with same title (only groups with > 1 folder).
 */
function findSimilarFolderGroups(folders, tree) {
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

  const byTitle = new Map();
  for (const f of folders) {
    if (f.id === "0") continue;
    const title = (f.title || "").trim();
    if (!title) continue;
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title).push({
      id: f.id,
      path: pathById.get(f.id) ?? f.id,
    });
  }

  return Array.from(byTitle.entries())
    .filter(([, list]) => list.length > 1)
    .map(([title, folders]) => ({ title, folders }));
}
