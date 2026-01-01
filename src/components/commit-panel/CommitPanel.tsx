import type { FC } from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import './CommitPanel.css';

interface CommitPanelProps {
  stagedCount: number;
  onCommit: (subject: string, description: string, amend: boolean) => Promise<void>;
  isLoading: boolean;
  lastCommitMessage?: { subject: string; body: string } | null;
  onAmendChange: (amend: boolean) => void;
}

export const CommitPanel: FC<CommitPanelProps> = ({
  stagedCount,
  onCommit,
  isLoading,
  lastCommitMessage,
  onAmendChange,
}) => {
  const { t } = useTranslation();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [amend, setAmend] = useState(false);

  // Load last commit message when amend is toggled on
  useEffect(() => {
    if (amend && lastCommitMessage) {
      setSubject(lastCommitMessage.subject);
      setDescription(lastCommitMessage.body);
    } else if (!amend) {
      // Clear fields when amend is toggled off
      setSubject('');
      setDescription('');
    }
  }, [amend, lastCommitMessage]);

  const handleAmendChange = useCallback(
    (checked: boolean) => {
      setAmend(checked);
      onAmendChange(checked);
    },
    [onAmendChange]
  );

  const handleCommit = useCallback(async () => {
    if (!subject.trim()) return;
    if (stagedCount === 0 && !amend) return;

    await onCommit(subject.trim(), description.trim(), amend);

    // Clear form after successful commit
    setSubject('');
    setDescription('');
    setAmend(false);
  }, [subject, description, amend, stagedCount, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Cmd/Ctrl + Enter to commit
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleCommit();
      }
    },
    [handleCommit]
  );

  const isCommitDisabled = !subject.trim() || (stagedCount === 0 && !amend) || isLoading;

  const buttonText = amend ? t('localChanges.amendLastCommit') : t('localChanges.commit');

  return (
    <div className="commit-panel" onKeyDown={handleKeyDown}>
      <div className="commit-subject-row">
        <input
          type="text"
          className="commit-subject"
          placeholder={t('localChanges.commitMessagePlaceholder')}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={isLoading}
          maxLength={72}
        />
        <span className="commit-subject-count">{subject.length}/72</span>
      </div>
      <textarea
        className="commit-description"
        placeholder={t('localChanges.commitMessage')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={isLoading}
        rows={3}
      />
      <div className="commit-footer">
        <label className="commit-amend-label">
          <input
            type="checkbox"
            checked={amend}
            onChange={(e) => handleAmendChange(e.target.checked)}
            disabled={isLoading}
          />
          <span className="commit-amend-checkbox" data-checked={amend}>
            {amend && <Check size={10} />}
          </span>
          <span className="commit-amend-text">{t('localChanges.amendLastCommit')}</span>
        </label>
        <button className="commit-button" onClick={handleCommit} disabled={isCommitDisabled}>
          {isLoading ? t('localChanges.committing') : buttonText}
        </button>
      </div>
    </div>
  );
};
