import { FC } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Menu, MenuItem, MenuSeparator, SubMenu, MenuHeader } from '../menu';
import './Toolbar.css';

interface ToolbarProps {
  onOpenRepo: () => void;
  repoName?: string;
  currentBranch?: string;
  onThemeChange?: (theme: 'system' | 'light' | 'dark') => void;
  currentTheme?: 'system' | 'light' | 'dark';
  onFetch?: () => void;
  onPull?: () => void;
  onPush?: () => void;
  isLoading?: boolean;
}

// Check icon for selected items
const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z"/>
  </svg>
);

// Icon components for menu items
const Icons = {
  Folder: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/>
    </svg>
  ),
  Clone: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 4.85v6.3a.85.85 0 00.85.85h6.3a.85.85 0 00.85-.85v-6.3a.85.85 0 00-.85-.85h-6.3a.85.85 0 00-.85.85zM5.85 2.5A2.35 2.35 0 003.5 4.85v6.3a2.35 2.35 0 002.35 2.35h6.3a2.35 2.35 0 002.35-2.35v-6.3a2.35 2.35 0 00-2.35-2.35h-6.3z"/>
      <path d="M1.5 3.5v8a2 2 0 002 2h8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    </svg>
  ),
  Settings: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z"/>
      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 002.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 001.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 00-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 00-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 00-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291a1.873 1.873 0 00-1.116-2.693l-.318-.094c-.835-.246-.835-1.428 0-1.674l.319-.094a1.873 1.873 0 001.115-2.692l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 002.692-1.116l.094-.318z"/>
    </svg>
  ),
  Help: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 15A7 7 0 118 1a7 7 0 010 14zm0 1A8 8 0 108 0a8 8 0 000 16z"/>
      <path d="M5.255 5.786a.237.237 0 00.241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 00.25.246h.811a.25.25 0 00.25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z"/>
    </svg>
  ),
  Info: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 15A7 7 0 118 1a7 7 0 010 14zm0 1A8 8 0 108 0a8 8 0 000 16z"/>
      <path d="M8.93 6.588l-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 11-2 0 1 1 0 012 0z"/>
    </svg>
  ),
  Terminal: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6 9a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3A.5.5 0 016 9zM3.854 4.146a.5.5 0 10-.708.708L4.793 6.5 3.146 8.146a.5.5 0 10.708.708l2-2a.5.5 0 000-.708l-2-2z"/>
      <path d="M2 1a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V3a2 2 0 00-2-2H2zm12 1a1 1 0 011 1v10a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1h12z"/>
    </svg>
  ),
  Theme: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 11a3 3 0 110-6 3 3 0 010 6zm0 1a4 4 0 100-8 4 4 0 000 8zM8 0a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2A.5.5 0 018 0zm0 13a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2A.5.5 0 018 13zm8-5a.5.5 0 01-.5.5h-2a.5.5 0 010-1h2a.5.5 0 01.5.5zM3 8a.5.5 0 01-.5.5h-2a.5.5 0 010-1h2A.5.5 0 013 8zm10.657-5.657a.5.5 0 010 .707l-1.414 1.415a.5.5 0 11-.707-.708l1.414-1.414a.5.5 0 01.707 0zm-9.193 9.193a.5.5 0 010 .707L3.05 13.657a.5.5 0 01-.707-.707l1.414-1.414a.5.5 0 01.707 0zm9.193 2.121a.5.5 0 01-.707 0l-1.414-1.414a.5.5 0 01.707-.707l1.414 1.414a.5.5 0 010 .707zM4.464 4.465a.5.5 0 01-.707 0L2.343 3.05a.5.5 0 11.707-.707l1.414 1.414a.5.5 0 010 .708z"/>
    </svg>
  ),
  Keyboard: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M14 5a1 1 0 011 1v5a1 1 0 01-1 1H2a1 1 0 01-1-1V6a1 1 0 011-1h12zM2 4a2 2 0 00-2 2v5a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H2z"/>
      <path d="M13 10.25a.25.25 0 01.25-.25h.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-.5a.25.25 0 01-.25-.25v-.5zm0-2a.25.25 0 01.25-.25h.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-.5a.25.25 0 01-.25-.25v-.5zm-5 0A.25.25 0 018.25 8h.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-.5A.25.25 0 018 8.75v-.5zm2 0a.25.25 0 01.25-.25h1.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-1.5a.25.25 0 01-.25-.25v-.5zm1 2a.25.25 0 01.25-.25h.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-.5a.25.25 0 01-.25-.25v-.5zm-5-2A.25.25 0 016.25 8h.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-.5A.25.25 0 016 8.75v-.5zm-2 0A.25.25 0 014.25 8h.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-.5A.25.25 0 014 8.75v-.5zm-2 0A.25.25 0 012.25 8h.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-.5A.25.25 0 012 8.75v-.5zm11-2a.25.25 0 01.25-.25h.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-.5a.25.25 0 01-.25-.25v-.5zm-2 0a.25.25 0 01.25-.25h.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-.5a.25.25 0 01-.25-.25v-.5zm-2 0A.25.25 0 019.25 6h.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-.5A.25.25 0 019 6.75v-.5zm-2 0A.25.25 0 017.25 6h.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-.5A.25.25 0 017 6.75v-.5zm-2 0A.25.25 0 015.25 6h.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-.5A.25.25 0 015 6.75v-.5zm-3 0A.25.25 0 012.25 6h1.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-1.5A.25.25 0 012 6.75v-.5zm0 4a.25.25 0 01.25-.25h.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-.5a.25.25 0 01-.25-.25v-.5zm2 0a.25.25 0 01.25-.25h5.5a.25.25 0 01.25.25v.5a.25.25 0 01-.25.25h-5.5a.25.25 0 01-.25-.25v-.5z"/>
    </svg>
  ),
  Exit: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M10 12.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-9a.5.5 0 01.5-.5h8a.5.5 0 01.5.5v2a.5.5 0 001 0v-2A1.5 1.5 0 009.5 2h-8A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h8a1.5 1.5 0 001.5-1.5v-2a.5.5 0 00-1 0v2z"/>
      <path d="M15.854 8.354a.5.5 0 000-.708l-3-3a.5.5 0 00-.708.708L14.293 7.5H5.5a.5.5 0 000 1h8.793l-2.147 2.146a.5.5 0 00.708.708l3-3z"/>
    </svg>
  ),
  Hamburger: () => (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2.5 12a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5z"/>
    </svg>
  ),
};

export const Toolbar: FC<ToolbarProps> = ({
  onOpenRepo,
  repoName,
  currentBranch,
  onThemeChange,
  currentTheme = 'system',
  onFetch,
  onPull,
  onPush,
  isLoading = false,
}) => {
  const appWindow = getCurrentWindow();

  const handleOpenInTerminal = () => {
    console.log('Open in terminal');
  };

  const handleSettings = () => {
    console.log('Settings');
  };

  const handleKeyboardShortcuts = () => {
    console.log('Keyboard shortcuts');
  };

  const handleAbout = () => {
    console.log('About');
  };

  const handleHelp = () => {
    console.log('Help');
  };

  const handleExit = async () => {
    await appWindow.close();
  };

  const handleThemeChange = (theme: 'system' | 'light' | 'dark') => {
    onThemeChange?.(theme);
  };

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        {repoName && (
          <div className="repo-selector">
            <span className="repo-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8z"/>
              </svg>
            </span>
            <span className="repo-name">{repoName}</span>
            {currentBranch && (
              <>
                <span className="branch-separator">/</span>
                <span className="branch-name">{currentBranch}</span>
              </>
            )}
          </div>
        )}
        <div className="toolbar-separator" />
        <button className="toolbar-btn" onClick={onOpenRepo} title="Open Repository">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/>
          </svg>
          <span className="btn-label">Open</span>
        </button>
        <div className="toolbar-separator" />
        <button className="toolbar-btn" title="Fetch" onClick={onFetch} disabled={isLoading}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4a.5.5 0 01.5.5v5.793l2.146-2.147a.5.5 0 01.708.708l-3 3a.5.5 0 01-.708 0l-3-3a.5.5 0 11.708-.708L7.5 10.293V4.5A.5.5 0 018 4z"/>
            <path d="M3.5 1A1.5 1.5 0 002 2.5v11A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5v-11A1.5 1.5 0 0012.5 1h-9z" fillOpacity="0.3"/>
          </svg>
          <span className="btn-label">{isLoading ? 'Loading...' : 'Fetch'}</span>
        </button>
        <button className="toolbar-btn" title="Pull" onClick={onPull} disabled={isLoading}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a.5.5 0 01.5.5v11.793l3.146-3.147a.5.5 0 01.708.708l-4 4a.5.5 0 01-.708 0l-4-4a.5.5 0 01.708-.708L7.5 13.293V1.5A.5.5 0 018 1z"/>
          </svg>
          <span className="btn-label">Pull</span>
        </button>
        <button className="toolbar-btn" title="Push" onClick={onPush} disabled={isLoading}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 15a.5.5 0 01-.5-.5V2.707L4.354 5.854a.5.5 0 11-.708-.708l4-4a.5.5 0 01.708 0l4 4a.5.5 0 01-.708.708L8.5 2.707V14.5a.5.5 0 01-.5.5z"/>
          </svg>
          <span className="btn-label">Push</span>
        </button>
        <div className="toolbar-separator" />
        <button className="toolbar-btn" title="Branch">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"/>
          </svg>
          <span className="btn-label">Branch</span>
        </button>
        <button className="toolbar-btn" title="Merge">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.5 2.5 0 006 8.5h1.5v5.128a2.251 2.251 0 101.5 0V8.5H10a2.5 2.5 0 002.5-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a1 1 0 01-1 1H6a1 1 0 01-1-1v-.878zm6-2.122a.75.75 0 111.5 0 .75.75 0 01-1.5 0zm-3 10a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"/>
          </svg>
          <span className="btn-label">Merge</span>
        </button>
        <div className="toolbar-separator" />
        <button className="toolbar-btn" title="Stash">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 4.5A2.5 2.5 0 014.5 2h7A2.5 2.5 0 0114 4.5v7a2.5 2.5 0 01-2.5 2.5h-7A2.5 2.5 0 012 11.5v-7zM4.5 3A1.5 1.5 0 003 4.5v7A1.5 1.5 0 004.5 13h7a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0011.5 3h-7z"/>
            <path d="M5 6.5A.5.5 0 015.5 6h5a.5.5 0 010 1h-5a.5.5 0 01-.5-.5zm0 3a.5.5 0 01.5-.5h5a.5.5 0 010 1h-5a.5.5 0 01-.5-.5z"/>
          </svg>
          <span className="btn-label">Stash</span>
        </button>
      </div>
      <div className="toolbar-right">
        <input type="text" placeholder="Search..." className="search-input" />
        <Menu
          trigger={
            <button className="hamburger-btn" title="Menu">
              <Icons.Hamburger />
            </button>
          }
          align="right"
        >
          <MenuHeader>Repository</MenuHeader>
          <MenuItem icon={<Icons.Folder />} shortcut="Ctrl+O" onClick={onOpenRepo}>
            Open Repository...
          </MenuItem>
          <MenuItem icon={<Icons.Clone />} shortcut="Ctrl+Shift+O">
            Clone Repository...
          </MenuItem>
          <MenuItem icon={<Icons.Terminal />} onClick={handleOpenInTerminal}>
            Open in Terminal
          </MenuItem>
          <MenuSeparator />
          <SubMenu icon={<Icons.Theme />} label="Theme">
            <MenuItem
              icon={currentTheme === 'system' ? <CheckIcon /> : undefined}
              onClick={() => handleThemeChange('system')}
            >
              System
            </MenuItem>
            <MenuItem
              icon={currentTheme === 'light' ? <CheckIcon /> : undefined}
              onClick={() => handleThemeChange('light')}
            >
              Light
            </MenuItem>
            <MenuItem
              icon={currentTheme === 'dark' ? <CheckIcon /> : undefined}
              onClick={() => handleThemeChange('dark')}
            >
              Dark
            </MenuItem>
          </SubMenu>
          <MenuSeparator />
          <MenuItem icon={<Icons.Settings />} shortcut="Ctrl+," onClick={handleSettings}>
            Settings
          </MenuItem>
          <MenuItem icon={<Icons.Keyboard />} shortcut="Ctrl+K" onClick={handleKeyboardShortcuts}>
            Keyboard Shortcuts
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Icons.Help />} shortcut="F1" onClick={handleHelp}>
            Help
          </MenuItem>
          <MenuItem icon={<Icons.Info />} onClick={handleAbout}>
            About Forky
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Icons.Exit />} shortcut="Ctrl+Q" danger onClick={handleExit}>
            Exit
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
};
