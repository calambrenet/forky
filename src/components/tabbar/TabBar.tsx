import { FC } from 'react';
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
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8z"/>
              </svg>
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
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <button className="tabbar-add" onClick={onAddTab} title="Open Repository">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z"/>
        </svg>
      </button>
    </div>
  );
};
