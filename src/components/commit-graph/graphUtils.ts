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

export interface BranchLabel {
  name: string;
  isHead: boolean;
  color: string;
}

export interface GraphData {
  nodes: GraphNode[];
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
    return { nodes: [], maxLane: 0 };
  }

  const nodes: GraphNode[] = [];
  const commitToNode = new Map<string, GraphNode>();
  const commitToRow = new Map<string, number>();

  // Track active lanes (which commit SHA is currently in each lane)
  const activeLanes: (string | null)[] = [];

  // Map branch heads to their commits for labels
  const branchHeadsMap = new Map<string, BranchHead[]>();
  branchHeads.forEach((branch) => {
    const existing = branchHeadsMap.get(branch.commit_sha) || [];
    existing.push(branch);
    branchHeadsMap.set(branch.commit_sha, existing);
  });

  // Assign color to each branch
  const branchColors = new Map<string, string>();
  branchHeads.forEach((branch, index) => {
    branchColors.set(branch.name, BRANCH_COLORS[index % BRANCH_COLORS.length]);
  });

  // First pass: create nodes and assign rows
  commits.forEach((commit, index) => {
    commitToRow.set(commit.id, index);
  });

  // Second pass: assign lanes
  commits.forEach((commit, row) => {
    let lane = -1;

    // Check if any of the parent commits are in active lanes
    // If so, this commit might continue that lane
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] === commit.id) {
        lane = i;
        break;
      }
    }

    // If no lane found, find the first empty lane or create new one
    if (lane === -1) {
      lane = activeLanes.indexOf(null);
      if (lane === -1) {
        lane = activeLanes.length;
        activeLanes.push(null);
      }
    }

    // Update the lane with the first parent (main line of history)
    if (commit.parent_ids.length > 0) {
      activeLanes[lane] = commit.parent_ids[0];
    } else {
      activeLanes[lane] = null;
    }

    // For merge commits, assign additional parents to new lanes if needed
    if (commit.parent_ids.length > 1) {
      for (let i = 1; i < commit.parent_ids.length; i++) {
        const parentId = commit.parent_ids[i];
        // Check if parent is already in a lane
        let parentLane = activeLanes.indexOf(parentId);
        if (parentLane === -1) {
          // Find empty lane or create new one for branch parent
          parentLane = activeLanes.indexOf(null);
          if (parentLane === -1) {
            parentLane = activeLanes.length;
            activeLanes.push(parentId);
          } else {
            activeLanes[parentLane] = parentId;
          }
        }
      }
    }

    // Get branch labels for this commit
    const commitBranches = branchHeadsMap.get(commit.id) || [];
    const branchLabels: BranchLabel[] = commitBranches.map((b) => ({
      name: b.name,
      isHead: b.is_head,
      color: branchColors.get(b.name) || BRANCH_COLORS[0],
    }));

    // Calculate the maximum active lane at this row
    let maxActiveLane = lane;
    for (let i = activeLanes.length - 1; i >= 0; i--) {
      if (activeLanes[i] !== null) {
        maxActiveLane = Math.max(maxActiveLane, i);
        break;
      }
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

  // Third pass: calculate parent connections
  nodes.forEach((node) => {
    node.commit.parent_ids.forEach((parentId, index) => {
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
      } else {
        // Parent is outside the visible range, draw line going down
        node.parentConnections.push({
          parentSha: parentId,
          parentLane: node.lane,
          parentRow: node.row + 1,
          type: 'straight',
        });
      }
    });
  });

  const maxLane = Math.max(...nodes.map((n) => n.lane), 0);

  return { nodes, maxLane };
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
    } else if (diffDays < 7) {
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
