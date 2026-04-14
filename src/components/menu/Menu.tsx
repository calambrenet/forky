import type { FC, ReactNode } from 'react';
import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { ChevronRight, Check } from 'lucide-react';
import './Menu.css';

// Context for menu state
interface MenuContextType {
  closeMenu: () => void;
}

const MenuContext = createContext<MenuContextType | null>(null);

// Hook to use menu context (optional - returns null if not in context)
export const useMenu = () => {
  return useContext(MenuContext);
};

// Main Menu component
interface MenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
}

export const Menu: FC<MenuProps> = ({ trigger, children, align = 'right' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleMenu = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close menu on Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <MenuContext.Provider value={{ closeMenu }}>
      <div className="menu-container">
        <div ref={triggerRef} className="menu-trigger" onClick={toggleMenu}>
          {trigger}
        </div>
        {isOpen && (
          <div ref={menuRef} className={`menu-dropdown ${align}`}>
            {children}
          </div>
        )}
      </div>
    </MenuContext.Provider>
  );
};

// MenuItem component
interface MenuItemProps {
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export const MenuItem: FC<MenuItemProps> = ({
  icon,
  shortcut,
  disabled = false,
  danger = false,
  onClick,
  children,
}) => {
  const menuContext = useMenu();

  const handleClick = () => {
    if (disabled) return;
    onClick?.();
    menuContext?.closeMenu();
  };

  return (
    <div
      className={`menu-item ${disabled ? 'disabled' : ''} ${danger ? 'danger' : ''}`}
      onClick={handleClick}
    >
      {icon !== undefined && <span className="menu-item-icon">{icon}</span>}
      <span className="menu-item-label">{children}</span>
      {shortcut && <span className="menu-item-shortcut">{shortcut}</span>}
    </div>
  );
};

// MenuSeparator component
export const MenuSeparator: FC = () => {
  return <div className="menu-separator" />;
};

// MenuHeader component (for grouping items)
interface MenuHeaderProps {
  children: ReactNode;
}

export const MenuHeader: FC<MenuHeaderProps> = ({ children }) => {
  return <div className="menu-header">{children}</div>;
};

// SubMenu component
interface SubMenuProps {
  icon?: ReactNode;
  label: string;
  children: ReactNode;
}

export const SubMenu: FC<SubMenuProps> = ({ icon, label, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuContext = useMenu();

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  // Create a new context that closes both submenu and parent menu
  const subMenuContext: MenuContextType = {
    closeMenu: () => {
      setIsOpen(false);
      menuContext?.closeMenu();
    },
  };

  return (
    <MenuContext.Provider value={subMenuContext}>
      <div
        ref={containerRef}
        className={`submenu-container ${isOpen ? 'open' : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="menu-item submenu-trigger" onClick={handleClick}>
          {icon !== undefined && <span className="menu-item-icon">{icon}</span>}
          <span className="menu-item-label">{label}</span>
          <span className="submenu-arrow">
            <ChevronRight size={12} />
          </span>
        </div>
        {isOpen && (
          <div
            className="submenu-dropdown"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {children}
          </div>
        )}
      </div>
    </MenuContext.Provider>
  );
};

// MenuCheckbox component
interface MenuCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}

export const MenuCheckbox: FC<MenuCheckboxProps> = ({ checked, onChange, children }) => {
  const menuContext = useMenu();

  const handleClick = () => {
    onChange(!checked);
    menuContext?.closeMenu();
  };

  return (
    <div className="menu-item menu-checkbox" onClick={handleClick}>
      <span className="menu-item-icon">{checked && <Check size={14} />}</span>
      <span className="menu-item-label">{children}</span>
    </div>
  );
};
