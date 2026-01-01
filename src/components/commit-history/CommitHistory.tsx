import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import type { CommitInfo } from '../../types/git';
import './CommitHistory.css';

interface CommitHistoryProps {
  commits: CommitInfo[];
  selectedCommit: CommitInfo | null;
  onSelectCommit: (commit: CommitInfo) => void;
}

export const CommitHistory: FC<CommitHistoryProps> = ({
  commits,
  selectedCommit,
  onSelectCommit,
}) => {
  const { t } = useTranslation();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return t('commits.today');
    } else if (days === 1) {
      return t('commits.yesterday');
    } else if (days < 7) {
      return t('commits.daysAgo', { count: days });
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="commit-history">
      <div className="commit-header">
        <div className="commit-col graph-col">{t('commits.graph')}</div>
        <div className="commit-col message-col">{t('commits.description')}</div>
        <div className="commit-col author-col">{t('commits.author')}</div>
        <div className="commit-col date-col">{t('commits.date')}</div>
        <div className="commit-col sha-col">{t('commits.sha')}</div>
      </div>
      <div className="commit-list">
        {commits.map((commit, index) => (
          <div
            key={commit.id}
            className={`commit-row ${selectedCommit?.id === commit.id ? 'selected' : ''}`}
            onClick={() => onSelectCommit(commit)}
          >
            <div className="commit-col graph-col">
              <div className="graph-node">
                <div className="graph-line top" style={{ opacity: index === 0 ? 0 : 1 }} />
                <div className="graph-dot" />
                <div
                  className="graph-line bottom"
                  style={{ opacity: index === commits.length - 1 ? 0 : 1 }}
                />
              </div>
            </div>
            <div className="commit-col message-col">
              <span className="commit-message">{commit.message.split('\n')[0]}</span>
            </div>
            <div className="commit-col author-col">
              <span className="commit-author">{commit.author}</span>
            </div>
            <div className="commit-col date-col">
              <span className="commit-date">{formatDate(commit.date)}</span>
            </div>
            <div className="commit-col sha-col">
              <span className="commit-sha">{commit.short_id}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
