import type { FC } from 'react';
import { memo, useCallback } from 'react';
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

interface TreeNodeItemProps {
  node: TreeNode;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onBranchClick?: (branch: BranchInfo) => void;
  onBranchDoubleClick?: (branch: BranchInfo) => void;
  onBranchContextMenu?: (branch: BranchInfo, event: React.MouseEvent) => void;
  onTagClick?: (tag: TagInfo) => void;
  depth: number;
  isRemote?: boolean;
  renderChildren: (nodes: TreeNode[], depth: number, isRemote: boolean) => React.ReactNode;
}

const TreeNodeItem: FC<TreeNodeItemProps> = memo(
  ({
    node,
    expandedPaths,
    onToggleExpand,
    onBranchClick,
    onBranchDoubleClick,
    onBranchContextMenu,
    onTagClick,
    depth,
    isRemote,
    renderChildren,
  }) => {
    const isExpanded = expandedPaths.has(node.fullPath);
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
      <>
        <div
          className={itemClassName}
          style={{ paddingLeft }}
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
        {isExpanded &&
          hasChildren &&
          renderChildren(node.children, depth + 1, isRemote || node.type === 'remote')}
      </>
    );
  }
);

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
    const renderChildren = useCallback(
      (childNodes: TreeNode[], childDepth: number, childIsRemote: boolean): React.ReactNode => {
        if (childNodes.length === 0) return null;
        return (
          <div className="branch-tree">
            {childNodes.map((node) => (
              <TreeNodeItem
                key={node.fullPath}
                node={node}
                expandedPaths={expandedPaths}
                onToggleExpand={onToggleExpand}
                onBranchClick={onBranchClick}
                onBranchDoubleClick={onBranchDoubleClick}
                onBranchContextMenu={onBranchContextMenu}
                onTagClick={onTagClick}
                depth={childDepth}
                isRemote={childIsRemote}
                renderChildren={renderChildren}
              />
            ))}
          </div>
        );
      },
      [
        expandedPaths,
        onToggleExpand,
        onBranchClick,
        onBranchDoubleClick,
        onBranchContextMenu,
        onTagClick,
      ]
    );

    if (nodes.length === 0) return null;

    return (
      <div className="branch-tree">
        {nodes.map((node) => (
          <TreeNodeItem
            key={node.fullPath}
            node={node}
            expandedPaths={expandedPaths}
            onToggleExpand={onToggleExpand}
            onBranchClick={onBranchClick}
            onBranchDoubleClick={onBranchDoubleClick}
            onBranchContextMenu={onBranchContextMenu}
            onTagClick={onTagClick}
            depth={depth}
            isRemote={isRemote}
            renderChildren={renderChildren}
          />
        ))}
      </div>
    );
  }
);
