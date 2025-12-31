import type { FC, ReactNode } from 'react';
import { useEffect, useRef, useCallback } from 'react';
import './Modal.css';

interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  children: ReactNode;
}

interface ModalHeaderProps {
  icon?: ReactNode;
  title: string;
  description?: string;
}

interface ModalBodyProps {
  children: ReactNode;
  className?: string;
}

interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

interface ModalRowProps {
  label: string;
  children: ReactNode;
}

export const Modal: FC<ModalProps> = ({ isOpen, onClose, children }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    },
    [onClose]
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current && onClose) {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="modal-dialog" ref={dialogRef}>
        {children}
      </div>
    </div>
  );
};

export const ModalHeader: FC<ModalHeaderProps> = ({ icon, title, description }) => {
  return (
    <div className="modal-header">
      {icon && <div className="modal-icon">{icon}</div>}
      <div className="modal-header-text">
        <h2 className="modal-title">{title}</h2>
        {description && <p className="modal-description">{description}</p>}
      </div>
    </div>
  );
};

export const ModalBody: FC<ModalBodyProps> = ({ children, className }) => {
  return <div className={`modal-body ${className || ''}`}>{children}</div>;
};

export const ModalFooter: FC<ModalFooterProps> = ({ children, className }) => {
  return <div className={`modal-footer ${className || ''}`}>{children}</div>;
};

export const ModalRow: FC<ModalRowProps> = ({ label, children }) => {
  return (
    <div className="modal-row">
      <label className="modal-row-label">{label}:</label>
      <div className="modal-row-content">{children}</div>
    </div>
  );
};
