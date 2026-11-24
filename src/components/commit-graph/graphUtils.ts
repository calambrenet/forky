import type { CommitInfo, BranchHead } from '../../types/git';

export interface GraphNode {
  commit: CommitInfo;
  lane: number;
  row: number;
  maxActiveLane: number; // Maximum lane active at this row (for proper spacing)
  parentConnections: ParentConnection[];
  branchLabels: BranchLabel[];
}

export interface ParentConnection {
  parentSha: string;
  parentLane: number;
  parentRow: number;
  type: 'straight' | 'merge-left' | 'merge-right' | 'branch-left' | 'branch-right';
}

export interface GraphEdge {
  key: string;
  fromRow: number;
  fromLane: number;
  toRow: number;
  toLane: number;
  color: string;
}

export interface BranchLabel {
  name: string;
  isHead: boolean;
  color: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  maxLane: number;
}

const BRANCH_COLORS = [
  '#4078c0', // blue
  '#6cc644', // green
  '#bd2c00', // red
  '#c9510c', // orange
  '#6e5494', // purple
  '#0086b3', // cyan
  '#f9826c', // coral
  '#28a745', // bright green
  '#6f42c1', // violet
  '#17a2b8', // teal
];

export function calculateGraphLayout(commits: CommitInfo[], branchHeads: BranchHead[]): GraphData {
  if (commits.length === 0) {
    return { nodes: [], edges: [], maxLane: 0 };
  }

  const nodes: GraphNode[] = [];
  const commitToNode = new Map<string, GraphNode>();
  const activeLanes: (string | null)[] = [];

  const branchHeadsMap = new Map<string, BranchHead[]>();
  branchHeads.forEach((branch) => {
    const existing = branchHeadsMap.get(branch.commit_sha) || [];
    existing.push(branch);
    branchHeadsMap.set(branch.commit_sha, existing);
  });

  const branchColors = new Map<string, string>();
  branchHeads.forEach((branch, index) => {
    branchColors.set(branch.name, BRANCH_COLORS[index % BRANCH_COLORS.length]);
  });

  let maxLane = 0;

  commits.forEach((commit, row) => {
    let lane = -1;

    // Claim the first lane expecting this commit, and free any duplicate lanes pointing to it
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] === commit.id) {
        if (lane === -1) {
          lane = i;
        } else {
          activeLanes[i] = null;
        }
      }
    }

    if (lane === -1) {
      lane = activeLanes.indexOf(null);
      if (lane === -1) {
        lane = activeLanes.length;
        activeLanes.push(null);
      }
    }

    // Update the lane with the first parent unless another lane already tracks it
    if (commit.parent_ids.length > 0) {
      const firstParent = commit.parent_ids[0];
      const existingParentLane = activeLanes.indexOf(firstParent);
      if (existingParentLane !== -1 && existingParentLane !== lane) {
        activeLanes[lane] = null;
      } else {
        activeLanes[lane] = firstParent;
      }
    } else {
      activeLanes[lane] = null;
    }

    // Assign additional merge parents to free lanes if not already tracked
    for (let i = 1; i < commit.parent_ids.length; i++) {
      const parentId = commit.parent_ids[i];
      if (activeLanes.indexOf(parentId) === -1) {
        const emptyLane = activeLanes.indexOf(null);
        if (emptyLane === -1) {
          activeLanes.push(parentId);
        } else {
          activeLanes[emptyLane] = parentId;
        }
      }
    }

    // Trim trailing null slots so activeLanes stays compact
    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop();
    }

    const commitBranches = branchHeadsMap.get(commit.id) || [];
    const branchLabels: BranchLabel[] = commitBranches.map((b) => ({
      name: b.name,
      isHead: b.is_head,
      color: branchColors.get(b.name) || BRANCH_COLORS[0],
    }));

    let maxActiveLane = lane;
    for (let i = activeLanes.length - 1; i >= 0; i--) {
      if (activeLanes[i] !== null) {
        maxActiveLane = Math.max(maxActiveLane, i);
        break;
      }
    }

    if (maxActiveLane > maxLane) {
      maxLane = maxActiveLane;
    }

    const node: GraphNode = {
      commit,
      lane,
      row,
      maxActiveLane,
      parentConnections: [],
      branchLabels,
    };

    nodes.push(node);
    commitToNode.set(commit.id, node);
  });

  // Precompute flat edges so virtualized rendering draws continuing lines crossing the viewport
  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  nodes.forEach((node) => {
    const color = getLaneColor(node.lane);
    node.commit.parent_ids.forEach((parentId, index) => {
      const edgeKey = `${node.commit.id}-${parentId}`;
      if (seenEdges.has(edgeKey)) return;
      seenEdges.add(edgeKey);

      const parentNode = commitToNode.get(parentId);
      if (parentNode) {
        let type: ParentConnection['type'] = 'straight';

        if (parentNode.lane < node.lane) {
          type = index === 0 ? 'merge-left' : 'branch-left';
        } else if (parentNode.lane > node.lane) {
          type = index === 0 ? 'merge-right' : 'branch-right';
        }

        node.parentConnections.push({
          parentSha: parentId,
          parentLane: parentNode.lane,
          parentRow: parentNode.row,
          type,
        });

        edges.push({
          key: edgeKey,
          fromRow: node.row,
          fromLane: node.lane,
          toRow: parentNode.row,
          toLane: parentNode.lane,
          color,
        });
      } else {
        node.parentConnections.push({
          parentSha: parentId,
          parentLane: node.lane,
          parentRow: node.row + 1,
          type: 'straight',
        });

        edges.push({
          key: edgeKey,
          fromRow: node.row,
          fromLane: node.lane,
          toRow: node.row + 1,
          toLane: node.lane,
          color,
        });
      }
    });
  });

  return { nodes, edges, maxLane };
}

export function getLaneColor(lane: number): string {
  return BRANCH_COLORS[lane % BRANCH_COLORS.length];
}

export function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays > 1 && diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  } catch {
    return dateStr;
  }
}
