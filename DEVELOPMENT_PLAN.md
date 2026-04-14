# Forky - Plan de Desarrollo

## Descripción del Proyecto
Forky es un cliente Git multiplataforma desarrollado con Tauri 2.0 (Rust + React/TypeScript), inspirado en Fork (https://git-fork.com/).

## Arquitectura

```
forky/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/         # Componentes UI
│   ├── hooks/              # Custom React hooks
│   ├── types/              # Definiciones TypeScript
│   └── styles/             # Estilos CSS
├── src-tauri/              # Backend (Rust)
│   └── src/
│       ├── git/            # Módulos de interacción con Git
│       ├── lib.rs          # Punto de entrada de la librería
│       └── main.rs         # Punto de entrada de la aplicación
```

---

## Fases de Desarrollo

### Fase 1: Fundamentos (MVP)
**Objetivo:** Aplicación funcional básica que pueda abrir repositorios y mostrar información.

#### 1.1 Gestión de Repositorios
- [x] Abrir repositorio existente
- [ ] Clonar repositorio (HTTPS/SSH)
- [ ] Inicializar nuevo repositorio
- [ ] Lista de repositorios recientes
- [ ] Gestión de múltiples repositorios (pestañas)

#### 1.2 Visualización de Historial
- [x] Lista de commits básica
- [ ] Gráfico de ramas (branch graph) visual
- [ ] Filtrado de commits por autor/fecha/mensaje
- [ ] Búsqueda en historial
- [ ] Paginación/scroll infinito de commits

#### 1.3 Información de Commits
- [x] Mostrar mensaje, autor, fecha, SHA
- [ ] Ver archivos modificados en un commit
- [ ] Ver diff de un commit específico
- [ ] Copiar SHA al portapapeles

#### 1.4 Estado del Repositorio
- [x] Mostrar archivos modificados (working copy)
- [x] Distinguir entre staged/unstaged
- [ ] Mostrar archivos untracked
- [ ] Iconos de estado (A/M/D/R/?)

---

### Fase 2: Operaciones Git Básicas
**Objetivo:** Permitir operaciones comunes de Git desde la interfaz.

#### 2.1 Staging Area
- [ ] Stage archivos individuales
- [ ] Unstage archivos
- [ ] Stage todos los cambios
- [ ] Descartar cambios (revert)
- [ ] Stage parcial (hunks/líneas)

#### 2.2 Commits
- [ ] Crear commits con mensaje
- [ ] Commit con mensaje multilínea
- [ ] Amend último commit
- [ ] Plantillas de mensaje de commit

#### 2.3 Branches
- [x] Listar branches locales y remotas
- [ ] Crear nueva branch
- [ ] Checkout a branch
- [ ] Eliminar branch
- [ ] Renombrar branch
- [ ] Merge branches
- [ ] Rebase interactivo básico

#### 2.4 Remotes
- [x] Listar remotes
- [ ] Fetch desde remotes
- [ ] Pull (con opciones: merge/rebase)
- [ ] Push
- [ ] Configurar upstream
- [ ] Añadir/eliminar remotes

---

### Fase 3: Diff y Merge
**Objetivo:** Visualización avanzada de cambios y resolución de conflictos.

#### 3.1 Vista de Diff
- [ ] Diff side-by-side
- [ ] Diff inline (unified)
- [ ] Syntax highlighting por lenguaje
- [ ] Navegación entre hunks
- [ ] Números de línea
- [ ] Expandir/colapsar contexto

#### 3.2 Resolución de Conflictos
- [ ] Detectar conflictos de merge
- [ ] Editor de conflictos (3-way merge)
- [ ] Aceptar cambios (ours/theirs/both)
- [ ] Marcar como resuelto

#### 3.3 Blame
- [ ] Vista de blame por archivo
- [ ] Navegación a commit desde blame
- [ ] Colores por autor/antigüedad

---

### Fase 4: Características Avanzadas
**Objetivo:** Funcionalidades que mejoran la productividad.

#### 4.1 Stash
- [x] Listar stashes (estructura básica)
- [ ] Crear stash
- [ ] Aplicar/pop stash
- [ ] Eliminar stash
- [ ] Ver contenido del stash

#### 4.2 Tags
- [x] Listar tags
- [ ] Crear tag (ligero y anotado)
- [ ] Eliminar tag
- [ ] Push tags
- [ ] Checkout a tag

#### 4.3 Submodules
- [ ] Listar submodules
- [ ] Inicializar submodules
- [ ] Actualizar submodules
- [ ] Añadir/eliminar submodules

#### 4.4 Cherry-pick y Revert
- [ ] Cherry-pick commits
- [ ] Revert commits
- [ ] Cherry-pick rango de commits

---

### Fase 5: UX y Productividad
**Objetivo:** Mejorar la experiencia de usuario.

#### 5.1 Interfaz
- [ ] Tema oscuro/claro
- [ ] Paneles redimensionables
- [ ] Atajos de teclado configurables
- [ ] Menú contextual (click derecho)
- [ ] Drag & drop para operaciones

#### 5.2 Búsqueda
- [ ] Búsqueda global (commits, archivos, contenido)
- [ ] Filtros avanzados
- [ ] Historial de búsquedas

#### 5.3 Integración
- [ ] Abrir en editor externo
- [ ] Abrir en terminal
- [ ] Integración con GitHub/GitLab/Bitbucket
- [ ] Ver PRs/MRs

#### 5.4 Configuración
- [ ] Configuración de Git (user.name, user.email)
- [ ] Gestión de SSH keys
- [ ] Configuración de la aplicación
- [ ] Persistencia de preferencias

---

### Fase 6: Optimización y Pulido
**Objetivo:** Rendimiento y estabilidad.

#### 6.1 Rendimiento
- [ ] Lazy loading de commits
- [ ] Caché de datos del repositorio
- [ ] Virtualización de listas largas
- [ ] Operaciones Git en background threads

#### 6.2 Estabilidad
- [ ] Manejo de errores robusto
- [ ] Mensajes de error claros
- [ ] Logging para debugging
- [ ] Tests unitarios y de integración

#### 6.3 Multiplataforma
- [ ] Soporte completo Linux
- [ ] Soporte Windows
- [ ] Soporte macOS
- [ ] Instaladores/paquetes nativos

---

## Stack Tecnológico

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **CSS Modules** - Styling

### Backend
- **Rust** - Lenguaje principal
- **Tauri 2.0** - Framework de aplicación
- **git2** - Bindings de libgit2
- **serde** - Serialización

### Herramientas
- **npm** - Package manager
- **Cargo** - Rust package manager

---

## Características de Fork (Referencia)

Basado en la captura de pantalla analizada:

1. **Barra lateral izquierda:**
   - Repositorios abiertos
   - Local Changes
   - Branches (expandible)
   - Remotes (expandible)
   - Tags
   - Stashes
   - Submodules

2. **Panel central superior:**
   - Historial de commits con gráfico de ramas
   - Columnas: Graph, Description, Author, Date, SHA
   - Selección de commits

3. **Panel central inferior:**
   - Lista de archivos modificados
   - Vista de diff
   - Staged/Unstaged sections

4. **Barra de herramientas:**
   - Fetch, Pull, Push
   - Stash, Pop
   - Branch, Merge
   - Terminal, Settings

---

## Próximos Pasos Inmediatos

1. **Mejorar el gráfico de ramas** - Implementar visualización real del DAG
2. **Implementar diff viewer** - Mostrar cambios reales de archivos
3. **Añadir operaciones de staging** - Stage/unstage archivos
4. **Crear funcionalidad de commit** - Permitir crear commits desde la UI
5. **Implementar fetch/pull/push** - Operaciones básicas con remotes

---

## Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Desarrollo (frontend + backend)
npm run tauri dev

# Build de producción
npm run tauri build

# Solo frontend
npm run dev

# Verificar código Rust
cd src-tauri && cargo check
```
