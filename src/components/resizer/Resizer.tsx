import type { FC } from 'react';
import './Resizer.css';

interface ResizerProps {
  direction: 'horizontal' | 'vertical';
  onMouseDown: () => void;
  isResizing?: boolean;
}

export const Resizer: FC<ResizerProps> = ({ direction, onMouseDown, isResizing }) => {
  return (
    <div
      className={`resizer resizer-${direction} ${isResizing ? 'resizing' : ''}`}
      onMouseDown={(e) => {
        e.preventDefault();
        onMouseDown();
      }}
    >
      <div className="resizer-handle" />
    </div>
  );
};
