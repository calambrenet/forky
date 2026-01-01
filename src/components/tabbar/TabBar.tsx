import type { FC } from 'react';
import { useState } from 'react';
import { BookOpen, X, Plus } from 'lucide-react';
import type { RepositoryTab } from '../../types/git';
import { TabContextMenu } from './TabContextMenu';
import './TabBar.css';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  tabId: string;
  tabIndex: number;
}

interface TabBarProps {
  tabs: RepositoryTab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseAll: () => void;
  onCloseToRight: (tabIndex: number) => void;
  onCloseToLeft: (tabIndex: number) => void;
  onAddTab: () => void;
}

export const TabBar: FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onCloseOthers,
  onCloseAll,
  onCloseToRight,
  onCloseToLeft,
  onAddTab,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleCloseClick = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onTabClose(tabId);
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: string, tabIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      tabId,
      tabIndex,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  return (
    <div className="tabbar">
      <div className="tabbar-tabs">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`tab ${activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => onTabSelect(tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab.id, index)}
          >
            <span className="tab-icon">
              <BookOpen size={14} />
            </span>
            {tab.hasPendingChanges && (
              <span className="tab-pending-indicator" title="Pending changes" />
            )}
            <span className="tab-name">{tab.name}</span>
            {tab.currentBranch && <span className="tab-branch">{tab.currentBranch}</span>}
            <button
              className="tab-close"
              onClick={(e) => handleCloseClick(e, tab.id)}
              title="Close tab"
            >
              <X size={10} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
      <button className="tabbar-add" onClick={onAddTab} title="Open Repository">
        <Plus size={14} />
      </button>

      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          tabId={contextMenu.tabId}
          tabIndex={contextMenu.tabIndex}
          totalTabs={tabs.length}
          onClose={handleCloseContextMenu}
          onCloseTab={onTabClose}
          onCloseOthers={onCloseOthers}
          onCloseAll={onCloseAll}
          onCloseToRight={onCloseToRight}
          onCloseToLeft={onCloseToLeft}
        />
      )}
    </div>
  );
};
