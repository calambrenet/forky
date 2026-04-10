import type { FC } from 'react';
import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import type { GitIdentity, GitOperationResult } from '../../../types/git';
import { useUIStore } from '../../../stores/uiStore';

interface GitPanelProps {
  onClose: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

export const GitPanel: FC<GitPanelProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const addAlert = useUIStore((state) => state.addAlert);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const identity = await invoke<GitIdentity>('git_get_global_identity');
        if (cancelled) return;
        setName(identity.name ?? '');
        setEmail(identity.email ?? '');
      } catch (err) {
        if (!cancelled) {
          addAlert('error', t('settings.git.loadFailed'), String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addAlert, t]);

  const initials = useMemo(() => getInitials(name), [name]);

  const validate = (): boolean => {
    let ok = true;
    if (!name.trim()) {
      setNameError(t('settings.git.nameRequired'));
      ok = false;
    } else {
      setNameError(null);
    }
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError(t('settings.git.invalidEmail'));
      ok = false;
    } else {
      setEmailError(null);
    }
    return ok;
  };

  const handleSave = async () => {
    if (!validate() || saving) return;
    setSaving(true);
    try {
      const result = await invoke<GitOperationResult>('git_set_global_identity', {
        name: name.trim(),
        email: email.trim(),
      });
      if (result.success) {
        addAlert('success', t('settings.title'), t('settings.git.saved'));
        onClose();
      } else {
        addAlert('error', t('settings.git.saveFailed'), result.message);
      }
    } catch (err) {
      addAlert('error', t('settings.git.saveFailed'), String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-panel">
      <section className="settings-section">
        <h3 className="settings-section-title">{t('settings.git.globalUserInfo')}</h3>

        <div className="settings-git-identity">
          <div className="settings-avatar" aria-hidden="true">
            {initials}
          </div>

          <div className="settings-git-fields">
            <div className="settings-field">
              <input
                type="text"
                className={`settings-input${nameError ? ' settings-input-error' : ''}`}
                placeholder={t('settings.git.namePlaceholder')}
                value={name}
                disabled={loading}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(null);
                }}
              />
              {nameError && <span className="settings-field-error">{nameError}</span>}
            </div>

            <div className="settings-field">
              <input
                type="email"
                className={`settings-input${emailError ? ' settings-input-error' : ''}`}
                placeholder={t('settings.git.emailPlaceholder')}
                value={email}
                disabled={loading}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
              />
              {emailError && <span className="settings-field-error">{emailError}</span>}
            </div>
          </div>
        </div>
      </section>

      <footer className="settings-panel-footer">
        <button type="button" className="settings-btn-cancel" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="settings-btn-primary"
          disabled={loading || saving}
          onClick={handleSave}
        >
          {saving ? t('settings.git.saving') : t('settings.git.save')}
        </button>
      </footer>
    </div>
  );
};
