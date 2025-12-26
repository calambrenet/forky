import type { BranchInfo, TagInfo } from '../../types/git';

// Tree node types
export interface TreeNode {
  name: string; // Display name (just the segment, not full path)
  fullPath: string; // Full path for identification
  type: 'folder' | 'branch' | 'tag' | 'remote';
  branch?: BranchInfo; // Original branch data if type is 'branch'
  tag?: TagInfo; // Original tag data if type is 'tag'
  children: TreeNode[];
  isHead?: boolean; // Is current branch
}

// Build a tree structure from flat branch list
export function buildBranchTree(branches: BranchInfo[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const branch of branches) {
    const parts = branch.name.split('/');
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      let existing = currentLevel.find((node) => node.name === part && node.fullPath === fullPath);

      if (!existing) {
        if (isLast) {
          // This is the branch itself
          existing = {
            name: part,
            fullPath: branch.name,
            type: 'branch',
            branch,
            children: [],
            isHead: branch.is_head,
          };
        } else {
          // This is a folder
          existing = {
            name: part,
            fullPath,
            type: 'folder',
            children: [],
          };
        }
        currentLevel.push(existing);
      }

      currentLevel = existing.children;
    }
  }

  // Sort the tree: folders first, then branches, alphabetically
  sortTree(root);
  return root;
}

// Build tree for remote branches grouped by remote name
export function buildRemoteTree(branches: BranchInfo[], remotes: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  // Create remote folder nodes first
  for (const remote of remotes) {
    root.push({
      name: remote,
      fullPath: remote,
      type: 'remote',
      children: [],
    });
  }

  // Add branches to their respective remotes
  for (const branch of branches) {
    // Remote branch format: "origin/feature/branch-name"
    const parts = branch.name.split('/');
    if (parts.length < 2) continue;

    const remoteName = parts[0];
    const branchPath = parts.slice(1); // Everything after remote name

    const remoteNode = root.find((node) => node.name === remoteName);
    if (!remoteNode) continue;

    let currentLevel = remoteNode.children;

    for (let i = 0; i < branchPath.length; i++) {
      const part = branchPath[i];
      const isLast = i === branchPath.length - 1;
      const fullPath = [remoteName, ...branchPath.slice(0, i + 1)].join('/');

      let existing = currentLevel.find((node) => node.name === part && node.fullPath === fullPath);

      if (!existing) {
        if (isLast) {
          existing = {
            name: part,
            fullPath: branch.name,
            type: 'branch',
            branch,
            children: [],
          };
        } else {
          existing = {
            name: part,
            fullPath,
            type: 'folder',
            children: [],
          };
        }
        currentLevel.push(existing);
      }

      currentLevel = existing.children;
    }
  }

  // Sort the tree
  for (const remoteNode of root) {
    sortTree(remoteNode.children);
  }

  return root;
}

// Build tree for tags
export function buildTagTree(tags: TagInfo[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const tag of tags) {
    const parts = tag.name.split('/');
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      let existing = currentLevel.find((node) => node.name === part && node.fullPath === fullPath);

      if (!existing) {
        if (isLast) {
          existing = {
            name: part,
            fullPath: tag.name,
            type: 'tag',
            tag,
            children: [],
          };
        } else {
          existing = {
            name: part,
            fullPath,
            type: 'folder',
            children: [],
          };
        }
        currentLevel.push(existing);
      }

      currentLevel = existing.children;
    }
  }

  sortTree(root);
  return root;
}

// Sort tree: folders first, then items, alphabetically
function sortTree(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    // Folders come first
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    // Then alphabetically
    return a.name.localeCompare(b.name);
  });

  // Recursively sort children
  for (const node of nodes) {
    if (node.children.length > 0) {
      sortTree(node.children);
    }
  }
}

// Filter tree by search term, keeping parent folders of matching items
export function filterTree(nodes: TreeNode[], filter: string): TreeNode[] {
  if (!filter.trim()) return nodes;

  const lowerFilter = filter.toLowerCase();

  function nodeMatches(node: TreeNode): boolean {
    // Check if this node's name matches
    if (node.name.toLowerCase().includes(lowerFilter)) return true;
    // Check full path for branches/tags
    if (
      (node.type === 'branch' || node.type === 'tag') &&
      node.fullPath.toLowerCase().includes(lowerFilter)
    )
      return true;
    return false;
  }

  function filterNode(node: TreeNode): TreeNode | null {
    // Check if any children match
    const filteredChildren: TreeNode[] = [];
    for (const child of node.children) {
      const filtered = filterNode(child);
      if (filtered) {
        filteredChildren.push(filtered);
      }
    }

    // If this node matches or has matching children, include it
    if (nodeMatches(node) || filteredChildren.length > 0) {
      return {
        ...node,
        children:
          filteredChildren.length > 0 ? filteredChildren : nodeMatches(node) ? node.children : [],
      };
    }

    return null;
  }

  const result: TreeNode[] = [];
  for (const node of nodes) {
    const filtered = filterNode(node);
    if (filtered) {
      result.push(filtered);
    }
  }

  return result;
}

// Count total items in tree (branches + tags, not folders)
export function countTreeItems(nodes: TreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === 'branch' || node.type === 'tag') {
      count++;
    }
    count += countTreeItems(node.children);
  }
  return count;
}

// Get all expanded folder paths from tree that have children
export function getDefaultExpandedPaths(nodes: TreeNode[]): Set<string> {
  const paths = new Set<string>();

  function traverse(nodeList: TreeNode[]) {
    for (const node of nodeList) {
      if (node.type === 'folder' || node.type === 'remote') {
        // Don't expand by default
      }
      traverse(node.children);
    }
  }

  traverse(nodes);
  return paths;
}
