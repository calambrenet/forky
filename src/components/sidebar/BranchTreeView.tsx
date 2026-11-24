import type { FC, CSSProperties } from 'react';
import { memo, useCallback, useMemo } from 'react';
import { List, type RowComponentProps } from 'react-window';
import {
  GitBranch,
  Folder,
  FolderOpen,
  Tag,
  Check,
  Server,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { TreeNode } from './branchTree';
import type { BranchInfo, TagInfo } from '../../types/git';

const ICON_SIZE = 14;
const VIRTUALIZE_TREE_THRESHOLD = 100;
const TREE_ROW_HEIGHT = 26;
const MAX_VIRTUAL_TREE_HEIGHT = 360;

interface FlatTreeNode {
  node: TreeNode;
  depth: number;
  isRemote: boolean;
  isExpanded: boolean;
}

interface BranchCounterProps {
  branch: BranchInfo;
}

const BranchCounter: FC<BranchCounterProps> = memo(({ branch }) => {
  const { ahead, behind } = branch;

  // Don't show if no upstream or both are 0 (synchronized)
  if (ahead === null || behind === null) return null;
  if (ahead === 0 && behind === 0) return null;

  return (
    <span className="branch-counters">
      {ahead > 0 && (
        <span
          className="branch-counter ahead"
          title={`${ahead} commit${ahead !== 1 ? 's' : ''} ahead of upstream`}
        >
          {ahead}
          <ArrowUp size={10} />
        </span>
      )}
      {behind > 0 && (
        <span
          className="branch-counter behind"
          title={`${behind} commit${behind !== 1 ? 's' : ''} behind upstream`}
        >
          {behind}
          <ArrowDown size={10} />
        </span>
      )}
    </span>
  );
});

interface BranchTreeProps {
  nodes: TreeNode[];
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onBranchClick?: (branch: BranchInfo) => void;
  onBranchDoubleClick?: (branch: BranchInfo) => void;
  onBranchContextMenu?: (branch: BranchInfo, event: React.MouseEvent) => void;
  onTagClick?: (tag: TagInfo) => void;
  depth?: number;
  isRemote?: boolean;
}

interface FlatTreeItemProps {
  item: FlatTreeNode;
  onToggleExpand: (path: string) => void;
  onBranchClick?: (branch: BranchInfo) => void;
  onBranchDoubleClick?: (branch: BranchInfo) => void;
  onBranchContextMenu?: (branch: BranchInfo, event: React.MouseEvent) => void;
  onTagClick?: (tag: TagInfo) => void;
  style?: CSSProperties;
}

const FlatTreeItem: FC<FlatTreeItemProps> = memo(
  ({
    item,
    onToggleExpand,
    onBranchClick,
    onBranchDoubleClick,
    onBranchContextMenu,
    onTagClick,
    style,
  }) => {
    const { node, depth, isExpanded } = item;
    const hasChildren = node.children.length > 0;
    const paddingLeft = 12 + depth * 16;

    const handleClick = useCallback(() => {
      if (node.type === 'folder' || node.type === 'remote') {
        onToggleExpand(node.fullPath);
      } else if (node.type === 'branch' && node.branch && onBranchClick) {
        onBranchClick(node.branch);
      } else if (node.type === 'tag' && node.tag && onTagClick) {
        onTagClick(node.tag);
      }
    }, [node, onToggleExpand, onBranchClick, onTagClick]);

    const handleDoubleClick = useCallback(() => {
      if (node.type === 'branch' && node.branch && onBranchDoubleClick) {
        onBranchDoubleClick(node.branch);
      }
    }, [node, onBranchDoubleClick]);

    const handleContextMenu = useCallback(
      (e: React.MouseEvent) => {
        if (node.type === 'branch' && node.branch && onBranchContextMenu) {
          e.preventDefault();
          e.stopPropagation();
          onBranchContextMenu(node.branch, e);
        }
      },
      [node, onBranchContextMenu]
    );

    const renderIcon = () => {
      switch (node.type) {
        case 'folder':
          return isExpanded ? (
            <FolderOpen size={ICON_SIZE} className="tree-icon folder-icon" />
          ) : (
            <Folder size={ICON_SIZE} className="tree-icon folder-icon" />
          );
        case 'remote':
          return <Server size={ICON_SIZE} className="tree-icon remote-icon" />;
        case 'branch':
          if (node.isHead) {
            return <Check size={ICON_SIZE} className="tree-icon branch-icon current" />;
          }
          return <GitBranch size={ICON_SIZE} className="tree-icon branch-icon" />;
        case 'tag':
          return <Tag size={ICON_SIZE} className="tree-icon tag-icon" />;
        default:
          return null;
      }
    };

    const itemClassName = [
      'tree-item',
      node.type,
      node.isHead ? 'current-branch' : '',
      hasChildren ? 'has-children' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        className={itemClassName}
        style={style ? { ...style, paddingLeft, boxSizing: 'border-box' } : { paddingLeft }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {(node.type === 'folder' || node.type === 'remote' || hasChildren) && (
          <span className={`tree-expand-icon ${isExpanded ? 'expanded' : ''}`}>▶</span>
        )}
        {!(node.type === 'folder' || node.type === 'remote' || hasChildren) && (
          <span className="tree-expand-icon placeholder" />
        )}
        <span className="tree-node-icon">{renderIcon()}</span>
        <span className="tree-node-label" title={node.fullPath}>
          {node.name}
        </span>
        {node.type === 'branch' && node.branch && !node.branch.is_remote && (
          <BranchCounter branch={node.branch} />
        )}
      </div>
    );
  }
);

interface VirtualTreeRowExtraProps {
  items: FlatTreeNode[];
  onToggleExpand: (path: string) => void;
  onBranchClick?: (branch: BranchInfo) => void;
  onBranchDoubleClick?: (branch: BranchInfo) => void;
  onBranchContextMenu?: (branch: BranchInfo, event: React.MouseEvent) => void;
  onTagClick?: (tag: TagInfo) => void;
}

const VirtualTreeRow = ({
  index,
  style,
  ariaAttributes,
  items,
  onToggleExpand,
  onBranchClick,
  onBranchDoubleClick,
  onBranchContextMenu,
  onTagClick,
}: RowComponentProps<VirtualTreeRowExtraProps>) => {
  const item = items[index];
  if (!item) return <div style={style} {...ariaAttributes} />;
  return (
    <div style={style} {...ariaAttributes}>
      <FlatTreeItem
        item={item}
        onToggleExpand={onToggleExpand}
        onBranchClick={onBranchClick}
        onBranchDoubleClick={onBranchDoubleClick}
        onBranchContextMenu={onBranchContextMenu}
        onTagClick={onTagClick}
        style={{ height: TREE_ROW_HEIGHT }}
      />
    </div>
  );
};

export const BranchTree: FC<BranchTreeProps> = memo(
  ({
    nodes,
    expandedPaths,
    onToggleExpand,
    onBranchClick,
    onBranchDoubleClick,
    onBranchContextMenu,
    onTagClick,
    depth = 0,
    isRemote = false,
  }) => {
    // Flatten visible tree nodes according to expandedPaths for O(visible) rendering & virtualization
    const flatNodes = useMemo<FlatTreeNode[]>(() => {
      const result: FlatTreeNode[] = [];
      const walk = (list: TreeNode[], currentDepth: number, currentIsRemote: boolean) => {
        for (const node of list) {
          const isExpanded = expandedPaths.has(node.fullPath);
          result.push({
            node,
            depth: currentDepth,
            isRemote: currentIsRemote,
            isExpanded,
          });
          if (isExpanded && node.children.length > 0) {
            walk(node.children, currentDepth + 1, currentIsRemote || node.type === 'remote');
          }
        }
      };
      walk(nodes, depth, isRemote);
      return result;
    }, [nodes, expandedPaths, depth, isRemote]);

    const rowProps = useMemo<VirtualTreeRowExtraProps>(
      () => ({
        items: flatNodes,
        onToggleExpand,
        onBranchClick,
        onBranchDoubleClick,
        onBranchContextMenu,
        onTagClick,
      }),
      [
        flatNodes,
        onToggleExpand,
        onBranchClick,
        onBranchDoubleClick,
        onBranchContextMenu,
        onTagClick,
      ]
    );

    if (flatNodes.length === 0) return null;

    if (flatNodes.length > VIRTUALIZE_TREE_THRESHOLD) {
      const listHeight = Math.min(flatNodes.length * TREE_ROW_HEIGHT, MAX_VIRTUAL_TREE_HEIGHT);
      return (
        <div className="branch-tree" style={{ height: listHeight }}>
          <List<VirtualTreeRowExtraProps>
            rowComponent={VirtualTreeRow}
            rowCount={flatNodes.length}
            rowHeight={TREE_ROW_HEIGHT}
            rowProps={rowProps}
            overscanCount={10}
            style={{ height: listHeight, width: '100%' }}
          />
        </div>
      );
    }

    return (
      <div className="branch-tree">
        {flatNodes.map((item) => (
          <FlatTreeItem
            key={item.node.fullPath}
            item={item}
            onToggleExpand={onToggleExpand}
            onBranchClick={onBranchClick}
            onBranchDoubleClick={onBranchDoubleClick}
            onBranchContextMenu={onBranchContextMenu}
            onTagClick={onTagClick}
          />
        ))}
      </div>
    );
  }
);
