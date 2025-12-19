import { FC } from 'react';
import './Form.css';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export const Checkbox: FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
}) => {
  return (
    <label className={`checkbox-container ${disabled ? 'disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="checkbox-input"
      />
      <span className={`checkbox-box ${checked ? 'checked' : ''}`}>
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M8.854 2.646a.5.5 0 010 .708l-4.5 4.5a.5.5 0 01-.708 0l-2-2a.5.5 0 11.708-.708L4 6.793l4.146-4.147a.5.5 0 01.708 0z"/>
          </svg>
        )}
      </span>
      <span className="checkbox-label">{label}</span>
    </label>
  );
};
