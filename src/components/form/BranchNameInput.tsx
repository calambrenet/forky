import type { FC, ReactNode, KeyboardEvent, ChangeEvent } from 'react';
import { memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Tag, AlertTriangle } from 'lucide-react';
import {
  sanitizeBranchName,
  sanitizeTagName,
  sanitizePrefixName,
  validateBranchName,
  getValidationErrorKey,
  type ValidationResult,
} from '../../utils/branchNameValidation';
import './BranchNameInput.css';

export type BranchNameInputMode = 'branch' | 'tag' | 'prefix';

export interface BranchNameInputProps {
  /** Current value */
  value: string;
  /** Called when value changes (already sanitized) */
  onChange: (value: string) => void;
  /** Input mode: branch, tag, or prefix */
  mode?: BranchNameInputMode;
  /** Placeholder text */
  placeholder?: string;
  /** Auto focus on mount */
  autoFocus?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Existing names to check for duplicates */
  existingNames?: string[];
  /** Custom icon (defaults based on mode) */
  icon?: ReactNode;
  /** Additional CSS class */
  className?: string;
  /** Called when Enter key is pressed */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** Called when validation state changes */
  onValidationChange?: (result: ValidationResult) => void;
  /** Show validation errors below input */
  showErrors?: boolean;
  /** Prefix to display before the input (for GitFlow preview) */
  prefix?: string;
}

/**
 * A specialized input component for Git branch, tag, and prefix names.
 * Automatically sanitizes input by:
 * - Converting spaces to hyphens
 * - Removing invalid characters
 * - Enforcing Git naming rules
 */
export const BranchNameInput: FC<BranchNameInputProps> = memo(
  ({
    value,
    onChange,
    mode = 'branch',
    placeholder,
    autoFocus = false,
    disabled = false,
    existingNames = [],
    icon,
    className = '',
    onKeyDown,
    onValidationChange,
    showErrors = true,
    prefix,
  }) => {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);
    const lastCursorPos = useRef<number>(0);

    // Auto focus
    useEffect(() => {
      if (autoFocus && inputRef.current) {
        inputRef.current.focus();
      }
    }, [autoFocus]);

    // Sanitize value based on mode
    const sanitize = useCallback(
      (val: string): string => {
        switch (mode) {
          case 'tag':
            return sanitizeTagName(val);
          case 'prefix':
            return sanitizePrefixName(val);
          default:
            return sanitizeBranchName(val);
        }
      },
      [mode]
    );

    // Validate and memoize result
    const validationResult = useMemo((): ValidationResult => {
      return validateBranchName(value, existingNames, { mode });
    }, [value, existingNames, mode]);

    // Notify parent of validation changes
    useEffect(() => {
      onValidationChange?.(validationResult);
    }, [validationResult, onValidationChange]);

    // Handle input change with sanitization
    const handleChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value;
        const cursorPos = e.target.selectionStart || 0;

        // Store cursor position before sanitization
        lastCursorPos.current = cursorPos;

        // Sanitize the value
        const sanitizedValue = sanitize(rawValue);

        // Calculate cursor offset (characters removed before cursor)
        const charsRemovedBefore =
          rawValue.substring(0, cursorPos).length -
          sanitize(rawValue.substring(0, cursorPos)).length;
        const newCursorPos = Math.max(0, cursorPos - charsRemovedBefore);

        // Update value
        onChange(sanitizedValue);

        // Restore cursor position after React updates the DOM
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          }
        });
      },
      [sanitize, onChange]
    );

    // Handle key down
    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLInputElement>) => {
        onKeyDown?.(e);
      },
      [onKeyDown]
    );

    // Default icon based on mode
    const defaultIcon = useMemo(() => {
      switch (mode) {
        case 'tag':
          return <Tag size={14} />;
        default:
          return <GitBranch size={14} />;
      }
    }, [mode]);

    // Get first error message for display
    const errorMessage = useMemo(() => {
      if (validationResult.isValid || validationResult.errors.length === 0) {
        return null;
      }
      const firstError = validationResult.errors[0];
      const errorKey = getValidationErrorKey(firstError);
      return t(errorKey, { defaultValue: firstError });
    }, [validationResult, t]);

    const containerClass = `branch-name-input-container ${disabled ? 'disabled' : ''} ${!validationResult.isValid && value ? 'invalid' : ''} ${className}`;

    return (
      <div className="branch-name-input-wrapper">
        <div className={containerClass}>
          {prefix && <span className="branch-name-prefix">{prefix}</span>}
          <span className="branch-name-icon">{icon || defaultIcon}</span>
          <input
            ref={inputRef}
            type="text"
            className="branch-name-input"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
        {showErrors && errorMessage && value && (
          <div className="branch-name-error">
            <AlertTriangle size={14} />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    );
  }
);

BranchNameInput.displayName = 'BranchNameInput';
