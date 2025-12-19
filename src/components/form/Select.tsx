import { FC, useState, useRef, useEffect, useCallback } from 'react';
import './Form.css';

interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const Select: FC<SelectProps> = ({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Select...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (selectRef.current && !selectRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, handleClickOutside, handleEscape]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div className={`select-container ${disabled ? 'disabled' : ''}`} ref={selectRef}>
      <button
        className={`select-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        type="button"
      >
        <span className="select-value">
          {selectedOption?.icon && <span className="select-icon">{selectedOption.icon}</span>}
          <span className="select-label">{selectedOption?.label || placeholder}</span>
        </span>
        <span className="select-arrow">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </button>
      {isOpen && (
        <div className="select-dropdown">
          {options.map((option) => (
            <div
              key={option.value}
              className={`select-option ${option.value === value ? 'selected' : ''}`}
              onClick={() => handleSelect(option.value)}
            >
              {option.icon && <span className="select-option-icon">{option.icon}</span>}
              <span className="select-option-label">{option.label}</span>
              {option.value === value && (
                <span className="select-check">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <path d="M11.854 4.146a.5.5 0 010 .708l-5.5 5.5a.5.5 0 01-.708 0l-2.5-2.5a.5.5 0 11.708-.708L6 9.293l5.146-5.147a.5.5 0 01.708 0z"/>
                  </svg>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
