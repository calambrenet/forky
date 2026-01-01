import type { FC, ReactElement } from 'react';
import { useEffect, useCallback } from 'react';
import { XCircle, CheckCircle, AlertTriangle, Info, X } from 'lucide-react';
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
  error: <XCircle size={20} />,
  success: <CheckCircle size={20} />,
  warning: <AlertTriangle size={20} />,
  info: <Info size={20} />,
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
        <X size={16} />
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
