import type { CommitInfo, BranchHead, TagInfo, StashInfo } from '../../types/git';

export const UNCOMMITTED_COMMIT_ID = '__UNCOMMITTED__';

export type RemoteProvider = 'github' | 'gitlab' | 'bitbucket' | 'generic';

export interface GraphNode {
  commit: CommitInfo;
  lane: number;
  row: number;
  maxActiveLane: number; // Maximum lane occupied at this row (incoming or outgoing)
  isMerge: boolean;
  isStash: boolean;
  isUncommitted: boolean;
  hasBody: boolean;
  displaySubject: string;
  parentConnections: ParentConnection[];
  branchLabels: BranchLabel[];
  tagLabels: string[];
  stashLabels: string[];
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
  viaLane: number;
  toRow: number;
  toLane: number;
  color: string;
  isStraight: boolean;
  isDashed: boolean;
}

export interface BranchLabel {
  name: string;
  title: string;
  isHead: boolean;
  hasLocal: boolean;
  hasRemote: boolean;
  remoteProvider: RemoteProvider | null;
  color: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  maxLane: number;
}

export interface GraphLayoutOptions {
  tags?: TagInfo[];
  stashes?: StashInfo[];
  remoteUrls?: Record<string, string>;
  localChangesCount?: number;
}

// High-contrast Fork-inspired rail palette (legible on both dark and light backgrounds)
const BRANCH_COLORS = [
  '#f59e0b', // amber / gold
  '#f97316', // orange
  '#ef4444', // red / coral
  '#22c55e', // emerald green
  '#3b82f6', // sky blue
  '#a855f7', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
  '#14b8a6', // teal
];

interface AssignedParent {
  parentId: string;
  viaLane: number;
}

function highestOccupiedLane(lanes: (string | null)[]): number {
  return Math.max(0, lanes.length - 1);
}

function trimTrailingNulls(lanes: (string | null)[]): void {
  while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
    lanes.pop();
  }
}

export function detectRemoteProvider(remoteUrl?: string | null): RemoteProvider {
  if (!remoteUrl) return 'generic';
  const lower = remoteUrl.toLowerCase();
  if (lower.includes('github.com') || lower.includes('github.')) return 'github';
  if (lower.includes('gitlab.com') || lower.includes('gitlab.')) return 'gitlab';
  if (lower.includes('bitbucket.org') || lower.includes('bitbucket.')) return 'bitbucket';
  return 'generic';
}

function isRemoteHead(b: BranchHead): boolean {
  if (b.is_remote !== undefined) return b.is_remote;
  if (b.remote_name) return true;
  return !b.is_head && b.name.includes('/');
}

function splitRemoteBranch(b: BranchHead): { remoteName: string; shortName: string } {
  if (b.remote_name) {
    const prefix = `${b.remote_name}/`;
    return {
      remoteName: b.remote_name,
      shortName: b.name.startsWith(prefix) ? b.name.slice(prefix.length) : b.name,
    };
  }
  const slashIdx = b.name.indexOf('/');
  if (slashIdx === -1) {
    return { remoteName: '', shortName: b.name };
  }
  return {
    remoteName: b.name.slice(0, slashIdx),
    shortName: b.name.slice(slashIdx + 1),
  };
}

function buildBranchLabelsForCommit(
  commitBranches: BranchHead[],
  laneColor: string,
  remoteUrls: Record<string, string>
): BranchLabel[] {
  if (commitBranches.length === 0) return [];

  const locals: BranchHead[] = [];
  const remotes: BranchHead[] = [];
  for (const b of commitBranches) {
    if (isRemoteHead(b)) {
      remotes.push(b);
    } else {
      locals.push(b);
    }
  }

  locals.sort((a, b) => {
    if (a.is_head !== b.is_head) return a.is_head ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  remotes.sort((a, b) => a.name.localeCompare(b.name));

  const consumedRemotes = new Set<string>();
  const labels: BranchLabel[] = [];

  for (const local of locals) {
    const matchingRemotes = remotes.filter((r) => {
      if (consumedRemotes.has(r.name)) return false;
      if (local.upstream && local.upstream === r.name) return true;
      return splitRemoteBranch(r).shortName === local.name;
    });

    if (matchingRemotes.length > 0) {
      matchingRemotes.sort((a, b) => {
        const aExact = local.upstream === a.name ? 0 : 1;
        const bExact = local.upstream === b.name ? 0 : 1;
        return aExact - bExact || a.name.localeCompare(b.name);
      });
      for (const r of matchingRemotes) {
        consumedRemotes.add(r.name);
      }
      const { remoteName } = splitRemoteBranch(matchingRemotes[0]);
      labels.push({
        name: local.name,
        title: `${local.name} (${matchingRemotes.map((r) => r.name).join(', ')})`,
        isHead: local.is_head,
        hasLocal: true,
        hasRemote: true,
        remoteProvider: detectRemoteProvider(remoteUrls[remoteName]),
        color: laneColor,
      });
    } else {
      labels.push({
        name: local.name,
        title: local.name,
        isHead: local.is_head,
        hasLocal: true,
        hasRemote: false,
        remoteProvider: null,
        color: laneColor,
      });
    }
  }

  for (const remote of remotes) {
    if (consumedRemotes.has(remote.name)) continue;
    const { remoteName } = splitRemoteBranch(remote);
    labels.push({
      name: remote.name,
      title: remote.name,
      isHead: false,
      hasLocal: false,
      hasRemote: true,
      remoteProvider: detectRemoteProvider(remoteUrls[remoteName]),
      color: laneColor,
    });
  }

  return labels;
}

function hasCommitBody(message: string): boolean {
  const newlineIdx = message.indexOf('\n');
  return newlineIdx !== -1 && message.slice(newlineIdx + 1).trim().length > 0;
}

export function calculateGraphLayout(
  commits: CommitInfo[],
  branchHeads: BranchHead[],
  options: GraphLayoutOptions = {}
): GraphData {
  if (commits.length === 0) {
    return { nodes: [], edges: [], maxLane: 0 };
  }

  const { tags = [], stashes = [], remoteUrls = {}, localChangesCount = 0 } = options;

  const commitIdSet = new Set(commits.map((c) => c.id));
  const headBranch = branchHeads.find((b) => b.is_head && commitIdSet.has(b.commit_sha));
  const headSha = headBranch?.commit_sha ?? commits[0].id;

  const effectiveCommits: CommitInfo[] =
    localChangesCount > 0
      ? [
          {
            id: UNCOMMITTED_COMMIT_ID,
            short_id: '',
            message: '',
            author: '',
            author_email: '',
            date: '',
            parent_ids: headSha ? [headSha] : [],
          },
          ...commits,
        ]
      : commits;

  const nodes: GraphNode[] = [];
  const commitToNode = new Map<string, GraphNode>();
  const assignedParentsByRow: AssignedParent[][] = [];
  const activeLanes: (string | null)[] = [];

  // Group branch heads by commit SHA
  const branchHeadsMap = new Map<string, BranchHead[]>();
  for (const branch of branchHeads) {
    const existing = branchHeadsMap.get(branch.commit_sha);
    if (existing) {
      existing.push(branch);
    } else {
      branchHeadsMap.set(branch.commit_sha, [branch]);
    }
  }

  // Group tags by commit SHA
  const tagsMap = new Map<string, string[]>();
  for (const tag of tags) {
    const existing = tagsMap.get(tag.commit_sha);
    if (existing) {
      existing.push(tag.name);
    } else {
      tagsMap.set(tag.commit_sha, [tag.name]);
    }
  }
  for (const list of tagsMap.values()) {
    list.sort((a, b) => a.localeCompare(b));
  }

  // Group stashes by commit SHA (ordered by stash index)
  const stashesMap = new Map<string, StashInfo[]>();
  for (const stash of stashes) {
    if (!stash.commit_sha) continue;
    const existing = stashesMap.get(stash.commit_sha);
    if (existing) {
      existing.push(stash);
    } else {
      stashesMap.set(stash.commit_sha, [stash]);
    }
  }
  for (const list of stashesMap.values()) {
    list.sort((a, b) => a.index - b.index);
  }

  let maxLane = 0;

  effectiveCommits.forEach((commit, row) => {
    const maxBefore = highestOccupiedLane(activeLanes);
    let lane = -1;

    // Claim the leftmost lane expecting this commit; release any converging lanes AT this row
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

    const assignedParents: AssignedParent[] = [];

    // Keep first parent on `lane` until `firstParent` is reached so no other branch steals this rail
    if (commit.parent_ids.length > 0) {
      const firstParent = commit.parent_ids[0];
      activeLanes[lane] = firstParent;
      assignedParents.push({ parentId: firstParent, viaLane: lane });
    } else {
      activeLanes[lane] = null;
    }

    // Assign merge parents to dedicated rails (or reuse an existing rail already tracking that parent)
    for (let i = 1; i < commit.parent_ids.length; i++) {
      const parentId = commit.parent_ids[i];
      if (commit.parent_ids.indexOf(parentId) !== i) continue; // skip duplicate parent SHAs

      let parentLane = activeLanes.indexOf(parentId);
      if (parentLane === -1) {
        parentLane = activeLanes.indexOf(null);
        if (parentLane === -1) {
          parentLane = activeLanes.length;
          activeLanes.push(parentId);
        } else {
          activeLanes[parentLane] = parentId;
        }
      }

      assignedParents.push({ parentId, viaLane: parentLane });
    }

    trimTrailingNulls(activeLanes);

    const maxAfter = highestOccupiedLane(activeLanes);
    const maxActiveLane = Math.max(lane, maxBefore, maxAfter);
    if (maxActiveLane > maxLane) {
      maxLane = maxActiveLane;
    }

    const isUncommitted = commit.id === UNCOMMITTED_COMMIT_ID;
    const laneColor = getLaneColor(lane);
    const commitBranches = isUncommitted ? [] : branchHeadsMap.get(commit.id) || [];
    const branchLabels = buildBranchLabelsForCommit(commitBranches, laneColor, remoteUrls);
    const tagLabels = isUncommitted ? [] : tagsMap.get(commit.id) || [];
    const stashLabels = isUncommitted ? [] : (stashesMap.get(commit.id) || []).map((s) => s.id);
    const isStash = !isUncommitted && stashLabels.length > 0 && branchLabels.length === 0;
    const rawSubject = commit.message.split('\n')[0];
    const displaySubject = isStash ? rawSubject.replace(/^On [^:]+:\s*/, '') : rawSubject;

    const node: GraphNode = {
      commit,
      lane,
      row,
      maxActiveLane,
      isMerge: !isUncommitted && !isStash && commit.parent_ids.length > 1,
      isStash,
      isUncommitted,
      hasBody: !isUncommitted && hasCommitBody(commit.message),
      displaySubject,
      parentConnections: [],
      branchLabels,
      tagLabels,
      stashLabels,
    };

    nodes.push(node);
    assignedParentsByRow.push(assignedParents);
    commitToNode.set(commit.id, node);
  });

  // Build orthogonal metro-style edges (straight rails first, then curved elbows on top)
  const straightEdges: GraphEdge[] = [];
  const curvedEdges: GraphEdge[] = [];
  const seenEdges = new Set<string>();
  const bottomRow = effectiveCommits.length;

  nodes.forEach((node, rowIndex) => {
    const assigned = assignedParentsByRow[rowIndex];
    assigned.forEach(({ parentId, viaLane }, index) => {
      const edgeKey = `${node.commit.id}-${parentId}`;
      if (seenEdges.has(edgeKey)) return;
      seenEdges.add(edgeKey);

      const parentNode = commitToNode.get(parentId);
      const toRow = parentNode ? parentNode.row : bottomRow;
      const toLane = parentNode ? parentNode.lane : viaLane;
      const effectiveViaLane =
        toRow === node.row + 1 && node.lane !== viaLane && viaLane !== toLane ? toLane : viaLane;

      if (effectiveViaLane > maxLane) {
        maxLane = effectiveViaLane;
      }

      let type: ParentConnection['type'] = 'straight';
      if (toLane < node.lane) {
        type = index === 0 ? 'merge-left' : 'branch-left';
      } else if (toLane > node.lane) {
        type = index === 0 ? 'merge-right' : 'branch-right';
      }

      node.parentConnections.push({
        parentSha: parentId,
        parentLane: toLane,
        parentRow: toRow,
        type,
      });

      const isStraight = node.lane === effectiveViaLane && effectiveViaLane === toLane;
      const edge: GraphEdge = {
        key: edgeKey,
        fromRow: node.row,
        fromLane: node.lane,
        viaLane: effectiveViaLane,
        toRow,
        toLane,
        color: node.isUncommitted ? 'var(--text-secondary)' : getLaneColor(effectiveViaLane),
        isStraight,
        isDashed: node.isStash || node.isUncommitted,
      };

      if (isStraight) {
        straightEdges.push(edge);
      } else {
        curvedEdges.push(edge);
      }
    });
  });

  return {
    nodes,
    edges: [...straightEdges, ...curvedEdges],
    maxLane,
  };
}

export function getLaneColor(lane: number): string {
  return BRANCH_COLORS[lane % BRANCH_COLORS.length];
}
