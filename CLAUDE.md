# CLAUDE.md - Guía para Claude Code

## Descripción del Proyecto

**Forky** es un cliente Git multiplataforma desarrollado con Tauri 2.0, inspirado en [Fork](https://git-fork.com/). Utiliza Rust para el backend y React + TypeScript para el frontend.

## Stack Tecnológico

- **Backend:** Rust + Tauri 2.0 + git2 (libgit2 bindings)
- **Frontend:** React 19 + TypeScript + Vite
- **Estilos:** CSS vanilla con variables CSS (tema oscuro)

## Estructura del Proyecto

```
forky/
├── src/                          # Frontend (React + TypeScript)
│   ├── components/               # Componentes UI
│   │   ├── toolbar/              # Barra de herramientas superior
│   │   ├── sidebar/              # Panel lateral izquierdo
│   │   ├── commit-history/       # Lista de commits
│   │   ├── diff-view/            # Vista de diferencias
│   │   └── repository/           # Componentes de repositorio
│   ├── hooks/                    # Custom React hooks
│   ├── types/                    # Definiciones TypeScript
│   │   └── git.ts                # Tipos para entidades Git
│   ├── styles/                   # Estilos globales
│   │   └── global.css            # Variables CSS y estilos base
│   ├── App.tsx                   # Componente raíz
│   ├── App.css                   # Estilos del layout principal
│   └── main.tsx                  # Punto de entrada React
├── src-tauri/                    # Backend (Rust)
│   ├── src/
│   │   ├── git/                  # Módulos de Git
│   │   │   ├── mod.rs            # Módulo principal
│   │   │   ├── repository.rs     # Funciones de repositorio
│   │   │   └── commands.rs       # Comandos Tauri (IPC)
│   │   ├── lib.rs                # Configuración de Tauri
│   │   └── main.rs               # Punto de entrada
│   ├── Cargo.toml                # Dependencias Rust
│   └── tauri.conf.json           # Configuración de Tauri
├── package.json                  # Dependencias npm
├── DEVELOPMENT_PLAN.md           # Plan de desarrollo por fases
└── CLAUDE.md                     # Este archivo
```

## Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Desarrollo (abre la app con hot-reload)
npm run tauri dev

# Build de producción
npm run tauri build

# Solo frontend (sin Tauri)
npm run dev

# Verificar código Rust
cd src-tauri && cargo check

# Formatear código Rust
cd src-tauri && cargo fmt

# Lint Rust
cd src-tauri && cargo clippy
```

## Convenciones de Código

### Rust (Backend)

- Usar `snake_case` para funciones y variables
- Usar `PascalCase` para structs y enums
- Los comandos Tauri van en `src/git/commands.rs`
- Las funciones de lógica Git van en `src/git/repository.rs`
- Todos los structs que cruzan la frontera Rust/JS deben derivar `Serialize` y `Deserialize`
- Manejar errores con `Result<T, String>` para comandos Tauri

```rust
#[tauri::command]
pub fn my_command(param: String, state: State<AppState>) -> Result<MyType, String> {
    // Implementación
}
```

### TypeScript (Frontend)

- Usar `camelCase` para variables y funciones
- Usar `PascalCase` para componentes y tipos
- Cada componente en su propia carpeta con su CSS
- Los tipos de Git están en `src/types/git.ts`
- Usar `invoke` de `@tauri-apps/api/core` para llamar comandos Rust

```typescript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke<ReturnType>('command_name', { param: value });
```

### CSS

- Usar variables CSS definidas en `src/styles/global.css`
- Seguir el esquema de colores del tema oscuro
- Variables principales:
  - `--bg-primary`, `--bg-secondary`, `--bg-tertiary`
  - `--text-primary`, `--text-secondary`, `--text-highlight`
  - `--accent-blue`, `--accent-green`, `--accent-red`
  - `--border-color`

## Flujo de Datos

1. **Usuario interactúa** con componente React
2. **Componente llama** `invoke('comando', { params })`
3. **Tauri enruta** al comando Rust correspondiente
4. **Comando Rust** usa `git2` para operaciones Git
5. **Resultado serializado** vuelve a React
6. **Componente actualiza** estado y UI

## Comandos Tauri Disponibles

| Comando | Parámetros | Retorno | Descripción |
|---------|------------|---------|-------------|
| `open_repository` | `path: String` | `RepositoryInfo` | Abre un repositorio Git |
| `get_branches` | - | `Vec<BranchInfo>` | Lista branches locales y remotas |
| `get_commits` | `limit: Option<usize>` | `Vec<CommitInfo>` | Obtiene historial de commits |
| `get_file_status` | - | `Vec<FileStatus>` | Estado de archivos (working copy) |
| `get_tags` | - | `Vec<String>` | Lista de tags |
| `get_remotes` | - | `Vec<String>` | Lista de remotes |
| `get_repository_info` | - | `RepositoryInfo` | Info del repo actual |

## Estado de la Aplicación

El estado del repositorio actual se mantiene en `AppState` (Rust):

```rust
pub struct AppState {
    pub current_repo_path: Mutex<Option<String>>,
}
```

En React, el estado se maneja con `useState` en `App.tsx`.

## Añadir Nueva Funcionalidad

### 1. Nuevo comando Git (Backend)

```rust
// En src/git/repository.rs - añadir función
pub fn nueva_funcion(repo: &Repository) -> Result<TipoRetorno, String> {
    // Implementación con git2
}

// En src/git/commands.rs - añadir comando Tauri
#[tauri::command]
pub fn nuevo_comando(state: State<AppState>) -> Result<TipoRetorno, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::nueva_funcion(&repo)
}

// En src/lib.rs - registrar comando
.invoke_handler(tauri::generate_handler![
    // ... otros comandos
    commands::nuevo_comando,
])
```

### 2. Nuevo tipo de datos

```rust
// En src/git/repository.rs
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NuevoTipo {
    pub campo: String,
}
```

```typescript
// En src/types/git.ts
export interface NuevoTipo {
  campo: string;
}
```

### 3. Nuevo componente UI

```
src/components/nuevo-componente/
├── NuevoComponente.tsx
└── NuevoComponente.css
```

## Dependencias Principales

### Rust (Cargo.toml)
- `tauri` - Framework de aplicación
- `git2` - Bindings de libgit2
- `serde` / `serde_json` - Serialización
- `chrono` - Manejo de fechas
- `tauri-plugin-dialog` - Diálogos nativos
- `tauri-plugin-fs` - Acceso al sistema de archivos

### JavaScript (package.json)
- `react` / `react-dom` - UI framework
- `@tauri-apps/api` - API de Tauri
- `@tauri-apps/plugin-dialog` - Plugin de diálogos
- `typescript` - Type checking
- `vite` - Bundler

## Notas Importantes

1. **Seguridad:** Los comandos Tauri están sandboxed. Usar plugins oficiales para acceso a FS/diálogos.

2. **Rendimiento:** Para operaciones Git pesadas, considerar ejecutarlas en threads separados.

3. **Errores:** Siempre manejar errores de `git2` y convertirlos a `String` para el frontend.

4. **Estado:** El repositorio actual se guarda en `AppState`. Verificar siempre que haya un repo abierto antes de operar.

5. **UI:** Seguir el diseño de Fork como referencia. Mantener consistencia visual.

## Referencias

- [Tauri 2.0 Docs](https://tauri.app/start/)
- [git2-rs Documentation](https://docs.rs/git2/latest/git2/)
- [Fork Git Client](https://git-fork.com/) - Referencia de diseño
- [React Documentation](https://react.dev/)
