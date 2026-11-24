import type { FC } from 'react';
import { Check } from 'lucide-react';
import './Form.css';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  variant?: 'default' | 'warning';
}

export const Checkbox: FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  variant = 'default',
}) => {
  return (
    <label
      className={`checkbox-container ${disabled ? 'disabled' : ''} ${variant === 'warning' ? 'warning' : ''}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="checkbox-input"
      />
      <span className={`checkbox-box ${checked ? 'checked' : ''}`}>
        {checked && <Check size={10} />}
      </span>
      <span className="checkbox-label">{label}</span>
    </label>
  );
};
