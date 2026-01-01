import { useTranslation } from 'react-i18next';
import { useCallback, useMemo } from 'react';

export function useLocale() {
  const { i18n } = useTranslation();

  const formatDate = useCallback(
    (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
      const d = new Date(date);
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
        ...options,
      }).format(d);
    },
    [i18n.language]
  );

  const formatDateShort = useCallback(
    (date: Date | string | number) => {
      const d = new Date(date);
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'short',
      }).format(d);
    },
    [i18n.language]
  );

  const formatTime = useCallback(
    (date: Date | string | number) => {
      const d = new Date(date);
      return new Intl.DateTimeFormat(i18n.language, {
        timeStyle: 'short',
      }).format(d);
    },
    [i18n.language]
  );

  const formatRelativeTime = useCallback(
    (date: Date | string | number) => {
      const d = new Date(date);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);
      const diffMonths = Math.floor(diffDays / 30);
      const diffYears = Math.floor(diffDays / 365);

      const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });

      if (diffSeconds < 60) {
        return rtf.format(-diffSeconds, 'second');
      } else if (diffMinutes < 60) {
        return rtf.format(-diffMinutes, 'minute');
      } else if (diffHours < 24) {
        return rtf.format(-diffHours, 'hour');
      } else if (diffDays < 30) {
        return rtf.format(-diffDays, 'day');
      } else if (diffMonths < 12) {
        return rtf.format(-diffMonths, 'month');
      }
      return rtf.format(-diffYears, 'year');
    },
    [i18n.language]
  );

  const language = useMemo(() => i18n.language, [i18n.language]);

  return {
    formatDate,
    formatDateShort,
    formatTime,
    formatRelativeTime,
    language,
    changeLanguage: i18n.changeLanguage.bind(i18n),
  };
}
