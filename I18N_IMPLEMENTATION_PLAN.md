# Plan de Internacionalización (i18n) - Forky

**Fecha:** 2025-12-20
**Estado:** Planificado
**Idiomas:** Español (es), English (en), Français (fr), Italiano (it)

---

## Decisiones de Diseño

| Aspecto | Decisión |
|---------|----------|
| Mensajes de error Git | Se muestran tal cual (sin traducir) |
| Formato de fechas | Adaptado al locale del usuario |
| Estructura de archivos | Un JSON por idioma (Opción A) |
| Términos Git (merge, rebase, etc.) | Se mantienen en inglés |
| Idioma por defecto | Inglés (fallback) |
| Detección | Automática desde el sistema |

---

## Arquitectura

```
src/
├── i18n/
│   ├── index.ts              # Configuración de i18next
│   ├── locales/
│   │   ├── en.json           # English (default/fallback)
│   │   ├── es.json           # Español
│   │   ├── fr.json           # Français
│   │   └── it.json           # Italiano
│   └── useLocale.ts          # Hook para formateo de fechas
```

---

## Dependencias

```bash
npm install i18next react-i18next i18next-browser-languagedetector
```

**Tauri (ya instalado):** `@tauri-apps/plugin-os` para detección del locale del sistema

---

## Fases de Implementación

### Fase 1: Setup Base (Infraestructura)
- [ ] Instalar dependencias npm
- [ ] Crear carpeta `src/i18n/`
- [ ] Crear `src/i18n/index.ts` con configuración de i18next
- [ ] Crear `src/i18n/useLocale.ts` para formateo de fechas
- [ ] Integrar I18nextProvider en `main.tsx`

### Fase 2: Archivos de Traducción
- [ ] Crear `src/i18n/locales/en.json` (base)
- [ ] Crear `src/i18n/locales/es.json`
- [ ] Crear `src/i18n/locales/fr.json`
- [ ] Crear `src/i18n/locales/it.json`

### Fase 3: Migrar Componentes
- [ ] Toolbar.tsx
- [ ] Sidebar.tsx
- [ ] LocalChangesView.tsx
- [ ] AllCommitsView.tsx
- [ ] CommitPanel.tsx
- [ ] Modales (Fetch, Pull, Push, Credential, SSH)
- [ ] AddRemoteModal.tsx
- [ ] GitActivityLog.tsx
- [ ] AlertContainer.tsx
- [ ] Welcome screen (App.tsx)

### Fase 4: Formateo de Fechas
- [ ] Crear utilidad de formateo con Intl.DateTimeFormat
- [ ] Aplicar en CommitGraph (fechas de commits)
- [ ] Aplicar en GitActivityLog (timestamps)

### Fase 5: Detección del Sistema
- [ ] Usar tauri-plugin-os para obtener locale
- [ ] Mapear locales del sistema a idiomas soportados
- [ ] Configurar fallback a inglés

---

## Estructura del JSON de Traducciones

```json
{
  "app": {
    "name": "Forky",
    "tagline": "Free fast and friendly Git client",
    "loading": "Loading...",
    "restoringRepos": "Restoring repositories..."
  },
  "common": {
    "cancel": "Cancel",
    "submit": "Submit",
    "save": "Save",
    "close": "Close",
    "add": "Add",
    "remove": "Remove",
    "edit": "Edit",
    "delete": "Delete",
    "yes": "Yes",
    "no": "No",
    "ok": "OK",
    "error": "Error",
    "success": "Success",
    "loading": "Loading..."
  },
  "toolbar": {
    "open": "Open",
    "fetch": "Fetch",
    "pull": "Pull",
    "push": "Push",
    "stash": "Stash",
    "branch": "Branch",
    "merge": "Merge",
    "openRepository": "Open Repository"
  },
  "menu": {
    "repository": "Repository",
    "openRepository": "Open Repository...",
    "cloneRepository": "Clone Repository...",
    "openInTerminal": "Open in Terminal",
    "theme": "Theme",
    "themeSystem": "System",
    "themeLight": "Light",
    "themeDark": "Dark",
    "settings": "Settings",
    "keyboardShortcuts": "Keyboard Shortcuts",
    "help": "Help",
    "about": "About Forky",
    "exit": "Exit"
  },
  "sidebar": {
    "localChanges": "Local Changes",
    "allCommits": "All Commits",
    "branches": "Branches",
    "remotes": "Remotes",
    "tags": "Tags",
    "stashes": "Stashes",
    "submodules": "Submodules",
    "noStashes": "No stashes",
    "noSubmodules": "No submodules"
  },
  "localChanges": {
    "staged": "Staged",
    "unstaged": "Unstaged",
    "noStagedChanges": "No staged changes",
    "noUnstagedChanges": "No unstaged changes",
    "stageAll": "Stage all",
    "unstageAll": "Unstage all",
    "stage": "Stage",
    "unstage": "Unstage",
    "discard": "Discard changes",
    "commitMessage": "Commit message",
    "commitMessagePlaceholder": "Enter commit message...",
    "commit": "Commit",
    "amendLastCommit": "Amend last commit",
    "noChanges": "No local changes",
    "selectFileToViewDiff": "Select a file to view diff"
  },
  "commits": {
    "selectCommitToViewDetails": "Select a commit to view details",
    "files": "Files",
    "noFilesChanged": "No files changed"
  },
  "modals": {
    "fetch": {
      "title": "Fetch",
      "description": "Fetch changes from remote repository",
      "remote": "Remote",
      "fetchAllRemotes": "Fetch all remotes"
    },
    "pull": {
      "title": "Pull",
      "description": "Pull remote changes and merge them into your local branch",
      "remote": "Remote",
      "branch": "Branch",
      "into": "Into",
      "rebaseInsteadOfMerge": "Rebase instead of merge",
      "stashAndReapply": "Stash and reapply local changes"
    },
    "push": {
      "title": "Push",
      "description": "Push your local changes to remote repository",
      "branch": "Branch",
      "to": "To",
      "pushAllTags": "Push all tags",
      "forcePush": "Force push"
    },
    "credential": {
      "usernameRequired": "Username Required",
      "passwordRequired": "Password Required",
      "passphraseRequired": "SSH Passphrase Required",
      "authRequired": "Authentication Required",
      "authRequiredFor": "Authentication required for {{host}}",
      "enterCredentials": "Please enter your credentials",
      "enterUsername": "Enter username",
      "enterPassword": "Enter password or access token",
      "enterPassphrase": "Enter SSH key passphrase",
      "tokenHint": "For GitHub/GitLab, use a Personal Access Token instead of your password.",
      "authenticating": "Authenticating..."
    },
    "sshVerification": {
      "title": "SSH Host Verification",
      "cantEstablish": "The authenticity of host '{{host}}' can't be established.",
      "fingerprint": "{{keyType}} key fingerprint:",
      "confirmConnect": "Are you sure you want to continue connecting? This will add the host to your known hosts file.",
      "noCancel": "No, Cancel",
      "yesTrust": "Yes, Trust This Host",
      "adding": "Adding..."
    },
    "addRemote": {
      "title": "Add Remote",
      "description": "Add a new remote repository",
      "name": "Name",
      "namePlaceholder": "e.g., upstream",
      "url": "URL",
      "urlPlaceholder": "e.g., https://github.com/user/repo.git",
      "testConnection": "Test Connection",
      "testing": "Testing...",
      "connectionSuccess": "Connection successful!",
      "add": "Add Remote",
      "adding": "Adding..."
    }
  },
  "activityLog": {
    "title": "Git Activity Log",
    "noActivity": "No activity yet",
    "success": "Success",
    "failed": "Failed",
    "clearLog": "Clear Log"
  },
  "alerts": {
    "fetchFailed": "Fetch Failed",
    "pullFailed": "Pull Failed",
    "pushFailed": "Push Failed",
    "commitFailed": "Commit Failed",
    "addRemoteFailed": "Add Remote Failed",
    "sshHostVerificationFailed": "SSH Host Verification Failed",
    "authenticationFailed": "Authentication Failed",
    "remoteAccessFailed": "Remote Access Failed",
    "connectionRefused": "Connection Refused",
    "connectionTimeout": "Connection Timeout",
    "hostNotFound": "Host Not Found"
  },
  "welcome": {
    "title": "Forky",
    "subtitle": "Free fast and friendly Git client",
    "openRepository": "Open Repository"
  },
  "fileStatus": {
    "added": "Added",
    "modified": "Modified",
    "deleted": "Deleted",
    "renamed": "Renamed",
    "copied": "Copied",
    "untracked": "Untracked",
    "ignored": "Ignored",
    "conflicted": "Conflicted",
    "unknown": "Unknown"
  },
  "contextMenu": {
    "addNewRemote": "Add New Remote...",
    "sortRemotes": "Sort Remotes",
    "alphabetically": "Alphabetically",
    "alphabeticallyMasterTop": "Alphabetically, master on top",
    "alphabeticallyBackward": "Alphabetically backward",
    "alphabeticallyBackwardMasterTop": "Alphabetically backward, master on top"
  }
}
```

---

## Configuración de i18next

```typescript
// src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  it: { translation: it },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'es', 'fr', 'it'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
```

---

## Hook para Formateo de Fechas

```typescript
// src/i18n/useLocale.ts
import { useTranslation } from 'react-i18next';

export function useLocale() {
  const { i18n } = useTranslation();

  const formatDate = (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
    const d = new Date(date);
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...options,
    }).format(d);
  };

  const formatRelativeTime = (date: Date | string | number) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        return rtf.format(-diffMinutes, 'minute');
      }
      return rtf.format(-diffHours, 'hour');
    } else if (diffDays < 30) {
      return rtf.format(-diffDays, 'day');
    } else if (diffDays < 365) {
      return rtf.format(-Math.floor(diffDays / 30), 'month');
    }
    return rtf.format(-Math.floor(diffDays / 365), 'year');
  };

  return { formatDate, formatRelativeTime, language: i18n.language };
}
```

---

## Ejemplo de Uso en Componentes

```tsx
// Antes
<button title="Open Repository">
  <span className="btn-label">Open</span>
</button>

// Después
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();

<button title={t('menu.openRepository')}>
  <span className="btn-label">{t('toolbar.open')}</span>
</button>
```

---

## Mapeo de Locales del Sistema

| Locale Sistema | Idioma App |
|----------------|------------|
| es, es-ES, es-MX, es-* | es |
| en, en-US, en-GB, en-* | en |
| fr, fr-FR, fr-CA, fr-* | fr |
| it, it-IT, it-* | it |
| Otros | en (fallback) |

---

## Estimación de Trabajo

| Fase | Tiempo Estimado |
|------|-----------------|
| Fase 1: Setup | 15 min |
| Fase 2: Traducciones | 30 min |
| Fase 3: Migrar componentes | 45 min |
| Fase 4: Formateo fechas | 15 min |
| Fase 5: Detección sistema | 10 min |
| **Total** | **~2 horas** |

---

## Notas Importantes

1. **Términos Git sin traducir:** merge, rebase, stash, commit, push, pull, fetch, branch, tag, remote, HEAD, checkout, cherry-pick, etc.

2. **Interpolación:** Para mensajes dinámicos usar `{{variable}}`:
   ```json
   "authRequiredFor": "Authentication required for {{host}}"
   ```
   ```tsx
   t('modals.credential.authRequiredFor', { host: 'github.com' })
   ```

3. **Plurales:** i18next soporta pluralización automática:
   ```json
   "filesChanged": "{{count}} file changed",
   "filesChanged_plural": "{{count}} files changed"
   ```

4. **Hot reload:** Los cambios en traducciones requieren reiniciar la app en desarrollo.
