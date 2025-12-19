import { FC, useEffect, useCallback, ReactElement } from 'react';
import './Alert.css';

export type AlertType = 'error' | 'success' | 'warning' | 'info';

export interface AlertData {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  duration?: number; // ms, 0 = persistent
}

interface AlertProps {
  alert: AlertData;
  onDismiss: (id: string) => void;
}

const icons: Record<AlertType, ReactElement> = {
  error: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

export const Alert: FC<AlertProps> = ({ alert, onDismiss }) => {
  const handleDismiss = useCallback(() => {
    onDismiss(alert.id);
  }, [alert.id, onDismiss]);

  useEffect(() => {
    if (alert.duration && alert.duration > 0) {
      const timer = setTimeout(handleDismiss, alert.duration);
      return () => clearTimeout(timer);
    }
  }, [alert.duration, handleDismiss]);

  return (
    <div className={`alert alert-${alert.type}`}>
      <div className="alert-icon">{icons[alert.type]}</div>
      <div className="alert-content">
        <div className="alert-title">{alert.title}</div>
        <div className="alert-message">{alert.message}</div>
      </div>
      <button className="alert-close" onClick={handleDismiss}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
};

interface AlertContainerProps {
  alerts: AlertData[];
  onDismiss: (id: string) => void;
}

export const AlertContainer: FC<AlertContainerProps> = ({ alerts, onDismiss }) => {
  if (alerts.length === 0) return null;

  return (
    <div className="alert-container">
      {alerts.map((alert) => (
        <Alert key={alert.id} alert={alert} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
