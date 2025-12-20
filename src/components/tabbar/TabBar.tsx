import { FC } from 'react';
import { BookOpen, X, Plus } from 'lucide-react';
import { RepositoryTab } from '../../types/git';
import './TabBar.css';

interface TabBarProps {
  tabs: RepositoryTab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onAddTab: () => void;
}

export const TabBar: FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onAddTab,
}) => {
  const handleCloseClick = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onTabClose(tabId);
  };

  return (
    <div className="tabbar">
      <div className="tabbar-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => onTabSelect(tab.id)}
          >
            <span className="tab-icon">
              <BookOpen size={14} />
            </span>
            <span className="tab-name">{tab.name}</span>
            {tab.currentBranch && (
              <span className="tab-branch">{tab.currentBranch}</span>
            )}
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
    </div>
  );
};
