import type { FC } from 'react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import {
  FolderOpen,
  Download,
  ArrowDown,
  ArrowUp,
  Archive,
  GitBranch,
  GitMerge,
  Menu as MenuIcon,
  FolderInput,
  Copy,
  Terminal,
  Sun,
  Settings,
  Keyboard,
  HelpCircle,
  Info,
  LogOut,
  Check,
  Smile,
  ChevronDown,
} from 'lucide-react';
import { Menu, MenuItem, MenuSeparator, SubMenu, MenuHeader } from '../menu';
import type { GitOperationState } from '../repository-info-box';
import { RepositoryInfoBox } from '../repository-info-box';
import { StashDropdown } from './StashDropdown';
import { MergeDropdown } from './MergeDropdown';
import { BranchDropdown } from './BranchDropdown';
import type { BranchInfo, StashInfo, GitFlowConfig, CurrentBranchFlowInfo } from '../../types/git';
import './Toolbar.css';

interface ToolbarProps {
  onOpenRepo: () => void;
  repoName?: string;
  repoPath?: string;
  currentBranch?: string;
  branches?: BranchInfo[];
  stashes?: StashInfo[];
  onBranchChange?: (branchName: string) => void;
  onThemeChange?: (theme: 'system' | 'light' | 'dark') => void;
  currentTheme?: 'system' | 'light' | 'dark';
  onFetch?: () => void;
  onPull?: () => void;
  onPush?: () => void;
  onStash?: () => void;
  onSaveSnapshot?: () => void;
  onStashSelect?: (stash: StashInfo) => void;
  onMergeSelect?: (branch: BranchInfo) => void;
  // Branch dropdown props
  gitFlowConfig?: GitFlowConfig | null;
  currentBranchFlowInfo?: CurrentBranchFlowInfo | null;
  onNewBranch?: () => void;
  onStartFeature?: () => void;
  onStartRelease?: () => void;
  onStartHotfix?: () => void;
  onFinishBranch?: () => void;
  onInitGitFlow?: () => void;
  isLoading?: boolean;
  gitOperation?: GitOperationState | null;
  onDismissOperation?: () => void;
  onFeedback?: () => void;
  onAbout?: () => void;
}

const ICON_SIZE = 16;

export const Toolbar: FC<ToolbarProps> = memo(
  ({
    onOpenRepo,
    repoName,
    repoPath,
    currentBranch,
    branches = [],
    stashes = [],
    onBranchChange,
    onThemeChange,
    currentTheme = 'system',
    onFetch,
    onPull,
    onPush,
    onStash,
    onSaveSnapshot,
    onStashSelect,
    onMergeSelect,
    gitFlowConfig,
    currentBranchFlowInfo,
    onNewBranch,
    onStartFeature,
    onStartRelease,
    onStartHotfix,
    onFinishBranch,
    onInitGitFlow,
    isLoading = false,
    gitOperation,
    onDismissOperation,
    onFeedback,
    onAbout,
  }) => {
    const { t } = useTranslation();
    const appWindow = getCurrentWindow();
    const [stashDropdownOpen, setStashDropdownOpen] = useState(false);
    const [mergeDropdownOpen, setMergeDropdownOpen] = useState(false);
    const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

    const handleOpenInTerminal = async () => {
      if (!repoPath) {
        console.warn('No repository path available');
        return;
      }
      try {
        await invoke('open_in_terminal', { path: repoPath });
      } catch (error) {
        console.error('Failed to open terminal:', error);
      }
    };

    const handleSettings = () => {
      // TODO: Open settings
    };

    const handleKeyboardShortcuts = () => {
      // TODO: Show keyboard shortcuts
    };

    const handleHelp = () => {
      // TODO: Open help
    };

    const handleExit = async () => {
      await appWindow.close();
    };

    const handleThemeChange = (theme: 'system' | 'light' | 'dark') => {
      onThemeChange?.(theme);
    };

    return (
      <div className="toolbar">
        {/* Left section: Open, Fetch, Pull, Push, Stash */}
        <div className="toolbar-left">
          <button className="toolbar-btn" onClick={onOpenRepo} title={t('toolbar.openRepository')}>
            <FolderOpen size={ICON_SIZE} />
            <span className="btn-label">{t('toolbar.open')}</span>
          </button>
          <div className="toolbar-separator" />
          <button
            className="toolbar-btn"
            title={t('toolbar.fetch')}
            onClick={onFetch}
            disabled={isLoading}
          >
            <Download size={ICON_SIZE} />
            <span className="btn-label">{t('toolbar.fetch')}</span>
          </button>
          <button
            className="toolbar-btn"
            title={t('toolbar.pull')}
            onClick={onPull}
            disabled={isLoading}
          >
            <ArrowDown size={ICON_SIZE} />
            <span className="btn-label">{t('toolbar.pull')}</span>
          </button>
          <button
            className="toolbar-btn"
            title={t('toolbar.push')}
            onClick={onPush}
            disabled={isLoading}
          >
            <ArrowUp size={ICON_SIZE} />
            <span className="btn-label">{t('toolbar.push')}</span>
          </button>
          <div className="toolbar-split-btn">
            <button
              className="toolbar-btn split-main"
              title={t('toolbar.stash')}
              onClick={onStash}
              disabled={isLoading}
            >
              <Archive size={ICON_SIZE} />
              <span className="btn-label">{t('toolbar.stash')}</span>
            </button>
            <button
              className="toolbar-btn split-dropdown-trigger"
              onClick={() => setStashDropdownOpen(!stashDropdownOpen)}
              disabled={isLoading}
            >
              <ChevronDown size={10} />
            </button>
            {stashDropdownOpen && (
              <StashDropdown
                stashes={stashes}
                onStashClick={(stash) => onStashSelect?.(stash)}
                onSaveSnapshot={() => onSaveSnapshot?.()}
                onClose={() => setStashDropdownOpen(false)}
              />
            )}
          </div>
        </div>

        {/* Center section: Repository Info Box */}
        <div className="toolbar-center">
          <RepositoryInfoBox
            repoName={repoName}
            currentBranch={currentBranch}
            branches={branches}
            onBranchChange={onBranchChange || (() => {})}
            gitOperation={gitOperation}
            onDismissOperation={onDismissOperation}
          />
        </div>

        {/* Right section: Branch, Merge, Menu */}
        <div className="toolbar-right">
          <div className="toolbar-dropdown-container">
            <button
              className="toolbar-btn"
              title={t('toolbar.branch')}
              onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
              disabled={isLoading || !currentBranch}
            >
              <GitBranch size={ICON_SIZE} />
              <span className="btn-label">{t('toolbar.branch')}</span>
            </button>
            {branchDropdownOpen && (
              <BranchDropdown
                gitFlowConfig={gitFlowConfig ?? null}
                currentBranchFlowInfo={currentBranchFlowInfo ?? null}
                onNewBranch={() => {
                  onNewBranch?.();
                  setBranchDropdownOpen(false);
                }}
                onStartFeature={() => {
                  onStartFeature?.();
                  setBranchDropdownOpen(false);
                }}
                onStartRelease={() => {
                  onStartRelease?.();
                  setBranchDropdownOpen(false);
                }}
                onStartHotfix={() => {
                  onStartHotfix?.();
                  setBranchDropdownOpen(false);
                }}
                onFinishBranch={() => {
                  onFinishBranch?.();
                  setBranchDropdownOpen(false);
                }}
                onClose={() => setBranchDropdownOpen(false)}
              />
            )}
          </div>
          <div className="toolbar-dropdown-container">
            <button
              className="toolbar-btn"
              title={t('toolbar.merge')}
              onClick={() => setMergeDropdownOpen(!mergeDropdownOpen)}
              disabled={isLoading || !currentBranch}
            >
              <GitMerge size={ICON_SIZE} />
              <span className="btn-label">{t('toolbar.merge')}</span>
            </button>
            {mergeDropdownOpen && (
              <MergeDropdown
                branches={branches}
                currentBranch={currentBranch || null}
                onBranchSelect={(branch) => {
                  onMergeSelect?.(branch);
                  setMergeDropdownOpen(false);
                }}
                onClose={() => setMergeDropdownOpen(false)}
              />
            )}
          </div>
          <div className="toolbar-separator" />
          <button className="toolbar-icon-btn" title={t('feedback.title')} onClick={onFeedback}>
            <Smile size={18} />
          </button>
          <Menu
            trigger={
              <button className="hamburger-btn" title={t('menu.repository')}>
                <MenuIcon size={18} />
              </button>
            }
            align="right"
          >
            <MenuHeader>{t('menu.repository')}</MenuHeader>
            <MenuItem
              icon={<FolderInput size={ICON_SIZE} />}
              shortcut="Ctrl+O"
              onClick={onOpenRepo}
            >
              {t('menu.openRepository')}
            </MenuItem>
            <MenuItem icon={<Copy size={ICON_SIZE} />} shortcut="Ctrl+Shift+O">
              {t('menu.cloneRepository')}
            </MenuItem>
            <MenuItem icon={<Terminal size={ICON_SIZE} />} onClick={handleOpenInTerminal}>
              {t('menu.openInTerminal')}
            </MenuItem>
            <SubMenu icon={<GitBranch size={ICON_SIZE} />} label={t('menu.gitFlow')}>
              {gitFlowConfig?.initialized ? (
                <>
                  <MenuItem onClick={onStartFeature}>{t('branchDropdown.startFeature')}</MenuItem>
                  <MenuItem onClick={onStartRelease}>{t('branchDropdown.startRelease')}</MenuItem>
                  <MenuItem onClick={onStartHotfix}>{t('branchDropdown.startHotfix')}</MenuItem>
                </>
              ) : (
                <MenuItem onClick={onInitGitFlow}>{t('menu.initGitFlow')}</MenuItem>
              )}
            </SubMenu>
            <MenuSeparator />
            <SubMenu icon={<Sun size={ICON_SIZE} />} label={t('menu.theme')}>
              <MenuItem
                icon={currentTheme === 'system' ? <Check size={ICON_SIZE} /> : undefined}
                onClick={() => handleThemeChange('system')}
              >
                {t('menu.themeSystem')}
              </MenuItem>
              <MenuItem
                icon={currentTheme === 'light' ? <Check size={ICON_SIZE} /> : undefined}
                onClick={() => handleThemeChange('light')}
              >
                {t('menu.themeLight')}
              </MenuItem>
              <MenuItem
                icon={currentTheme === 'dark' ? <Check size={ICON_SIZE} /> : undefined}
                onClick={() => handleThemeChange('dark')}
              >
                {t('menu.themeDark')}
              </MenuItem>
            </SubMenu>
            <MenuSeparator />
            <MenuItem
              icon={<Settings size={ICON_SIZE} />}
              shortcut="Ctrl+,"
              onClick={handleSettings}
            >
              {t('menu.settings')}
            </MenuItem>
            <MenuItem
              icon={<Keyboard size={ICON_SIZE} />}
              shortcut="Ctrl+K"
              onClick={handleKeyboardShortcuts}
            >
              {t('menu.keyboardShortcuts')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<HelpCircle size={ICON_SIZE} />} shortcut="F1" onClick={handleHelp}>
              {t('menu.help')}
            </MenuItem>
            <MenuItem icon={<Info size={ICON_SIZE} />} onClick={onAbout}>
              {t('menu.about')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<LogOut size={ICON_SIZE} />}
              shortcut="Ctrl+Q"
              danger
              onClick={handleExit}
            >
              {t('menu.exit')}
            </MenuItem>
          </Menu>
        </div>
      </div>
    );
  }
);
