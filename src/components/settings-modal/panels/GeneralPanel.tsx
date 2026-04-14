import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

export const GeneralPanel: FC = () => {
  const { t } = useTranslation();

  return (
    <div className="settings-panel">
      <div className="settings-panel-placeholder">
        {t('settings.general.placeholder')}
      </div>
    </div>
  );
};
