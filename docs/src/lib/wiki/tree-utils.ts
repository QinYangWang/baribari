import type { TreeNode } from "@/components/wiki/WikiNavNode.astro";
import { CATEGORY_ORDER, PAGE_ORDER, navOrderIndex } from "@/lib/i18n";

function isTreeNodeFolder(node: TreeNode): boolean {
  return Object.keys(node.children).length > 0;
}

/**
 * Sort nav nodes to match the homepage:
 * root categories → CATEGORY_ORDER; pages under a category → PAGE_ORDER.
 */
export function sortTreeNodes(
  children: Record<string, TreeNode>,
  parentKey?: string,
): string[] {
  const pageOrder = parentKey ? PAGE_ORDER[parentKey] : undefined;

  return Object.keys(children).sort((a, b) => {
    const nodeA = children[a]!;
    const nodeB = children[b]!;
    const aIsFolder = isTreeNodeFolder(nodeA);
    const bIsFolder = isTreeNodeFolder(nodeB);

    // Root: fixed category order (folders first in that order)
    if (!parentKey) {
      const ia = navOrderIndex(CATEGORY_ORDER, a);
      const ib = navOrderIndex(CATEGORY_ORDER, b);
      if (ia !== ib) return ia - ib;
      return nodeA.label.localeCompare(nodeB.label);
    }

    // Nested: prefer documented page order for leaves
    if (pageOrder && !aIsFolder && !bIsFolder) {
      const ia = navOrderIndex(pageOrder, a);
      const ib = navOrderIndex(pageOrder, b);
      if (ia !== ib) return ia - ib;
    }

    if (!aIsFolder && bIsFolder) return -1;
    if (aIsFolder && !bIsFolder) return 1;

    return nodeA.label.localeCompare(nodeB.label);
  });
}
