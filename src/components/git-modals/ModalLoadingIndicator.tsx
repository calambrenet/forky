import type { FC } from 'react';
import { memo } from 'react';

interface ModalLoadingIndicatorProps {
  isLoading: boolean;
  loadingText: string;
}

export const ModalLoadingIndicator: FC<ModalLoadingIndicatorProps> = memo(
  ({ isLoading, loadingText }) => {
    if (!isLoading) return null;

    return (
      <div className="modal-loading-indicator">
        <div className="modal-loading-spinner" />
        <span className="modal-loading-text">{loadingText}</span>
      </div>
    );
  }
);

ModalLoadingIndicator.displayName = 'ModalLoadingIndicator';
