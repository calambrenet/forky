# Forky

A cross-platform Git client inspired by [Fork](https://git-fork.com/).

![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fcalambrenet%2Fforky%2Fmain%2Fpackage.json&query=%24.version&label=version&color=blue)
![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)
![Status](https://img.shields.io/badge/status-alpha-orange)

> **Warning**
> This software is in **alpha stage**. It is not recommended for use in production environments or critical projects. Expect bugs, incomplete features, and breaking changes between versions. Use at your own risk.

## About

**Forky** is a shameless clone of [Fork](https://git-fork.com/) because I (Calambrenet) wanted a graphical Git manager that worked on Linux and looked like Fork. So I built Forky.

This project is created with no pretensions of ever being stable, but I'm using it daily for my work and I'm gradually implementing features and fixing bugs as I go.

Built with:
- **Backend:** Rust + Tauri 2.0 + git2 (libgit2 bindings)
- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** CSS with CSS variables (dark theme)

## Screenshots

*Coming soon*

## Features

### Repository Management
- [x] Open and manage multiple Git repositories in tabs
- [x] Auto-restore previously opened repositories on startup
- [x] Real-time file watching with pending changes indicator
- [x] Open repository in terminal

### Commit History
- [x] View commit history with branch graph visualization
- [x] Navigate to specific commits
- [x] View commit details (author, date, message, files changed)
- [x] Diff viewer with syntax highlighting

### Working Copy
- [x] Stage/unstage individual files
- [x] Stage/unstage all files
- [x] View diff for staged and unstaged changes
- [x] Commit changes with message
- [x] Amend last commit
- [ ] Discard changes
- [ ] Partial staging (hunks)

### Remote Operations
- [x] Fetch (single remote or all remotes)
- [x] Pull (with rebase and autostash options)
- [x] Push (with force-with-lease and push tags options)
- [x] Add new remote
- [x] SSH host verification
- [x] Credential management (username/password, SSH passphrase)
- [ ] Clone repository

### Branch Operations
- [x] View local and remote branches in tree structure
- [x] Checkout branch (double-click or context menu)
- [x] Create new branch (from any branch)
- [x] Rename branch (local and remote)
- [x] Delete branch (with force delete option, local and remote)
- [x] Track remote branch (create local from remote)
- [x] Copy branch name to clipboard
- [ ] Fast-forward branch

### Tag Operations
- [x] View tags in tree structure
- [x] Create tag (lightweight or annotated)
- [x] Push tags to remotes
- [x] Navigate to tag commit
- [ ] Delete tag

### Stash Operations
- [x] View stash list (sidebar and dropdown)
- [x] Create stash (with optional message and stage new files option)
- [x] Save snapshot (stash but keep changes in working directory)
- [x] Apply stash (apply changes, keep stash)
- [x] Pop stash (apply changes, remove stash)
- [x] Drop stash (remove without applying)

### Git Flow
- [ ] Initialize Git Flow
- [ ] Start/finish feature
- [ ] Start/finish release
- [ ] Start/finish hotfix

### Pull Requests
- [ ] View pull requests from GitHub/GitLab/Bitbucket
- [ ] Create pull request
- [ ] Review pull request

### Merge, Rebase & Conflicts
- [ ] Merge branch into current
- [ ] Rebase current branch on another
- [ ] Interactive rebase
- [ ] Conflict resolution window
- [ ] Visual merge tool integration
- [ ] Abort merge/rebase

### Settings & Configuration
- [ ] Settings/preferences window
- [ ] Configure keyboard shortcuts
- [ ] Configure external diff/merge tools
- [ ] Configure Git identity (name, email)

### Other Features
- [x] Multi-language support (English, Spanish, French, Italian)
- [x] Dark theme
- [x] Activity log for Git operations
- [x] Keyboard shortcuts (⌘B for new branch, ⌘T for new tag)
- [x] Filter branches/tags in sidebar
- [x] Sort remote branches
- [ ] Light theme
- [ ] Custom themes
- [ ] Submodule support
- [ ] Cherry-pick
- [ ] Blame view
- [ ] File history

## Installation

### Pre-built Binaries

Download the latest version from the [Releases](https://github.com/calambrenet/forky/releases) page.

| Platform | Format |
|----------|--------|
| Windows | `.msi`, `.exe` |
| macOS Apple Silicon | `.dmg` |
| Linux (Debian/Ubuntu) | `.deb` |
| Linux (Fedora/openSUSE) | `.rpm` |
| Linux (Universal) | `.AppImage` |

### Building from Source

#### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) (v18 or later)
- npm or pnpm

#### Platform-specific Dependencies

**Linux (Debian/Ubuntu):**
```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

**macOS:**
```bash
xcode-select --install
```

**Windows:**
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed on Windows 10/11)

#### Build Steps

```bash
# Clone the repository
git clone https://github.com/calambrenet/forky.git
cd forky

# Install frontend dependencies
npm install

# Run in development mode (with hot-reload)
npm run tauri dev

# Build for production
npm run tauri build
```

The built application will be in `src-tauri/target/release/bundle/`.

## Development

```bash
# Run the app in development mode
npm run tauri dev

# Run only the frontend (without Tauri)
npm run dev

# Check Rust code
cd src-tauri && cargo check

# Format Rust code
cd src-tauri && cargo fmt

# Lint Rust code
cd src-tauri && cargo clippy
```

### Version Management

The app version is centralized in `package.json`. The `tauri.conf.json` references this file, so you only need to update the version in one place.

To bump the version:

```bash
# Patch release (0.1.0 -> 0.1.1)
npm version patch

# Minor release (0.1.0 -> 0.2.0)
npm version minor

# Major release (0.1.0 -> 1.0.0)
npm version major
```

To access the version from the frontend:

```typescript
import { getVersion } from '@tauri-apps/api/app';

const version = await getVersion(); // "0.1.0"
```

## Contributing

Contributions are welcome! Since we don't have an official repository or website yet, here's how you can help:

1. **Fork** the repository
2. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes** following the project conventions
4. **Test** your changes thoroughly
5. **Commit** with a descriptive message:
   ```bash
   git commit -m "[FEATURE] Add amazing feature"
   ```
6. **Push** to your fork and open a **Pull Request**

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

### Code Style

- **Rust:** Format with `cargo fmt`, lint with `cargo clippy`
- **TypeScript:** Use TypeScript strict mode, avoid `any`
- **Commits:** Use prefixes like `[FEATURE]`, `[FIX]`, `[REFACTOR]`, `[DOCS]`

## Project Structure

```
forky/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/         # UI components
│   ├── hooks/              # Custom React hooks
│   ├── stores/             # Zustand state stores
│   ├── types/              # TypeScript definitions
│   └── styles/             # Global styles
├── src-tauri/              # Backend (Rust)
│   └── src/
│       ├── git/            # Git operations (using git2)
│       ├── watcher/        # File system watcher
│       └── system/         # System utilities
└── .github/workflows/      # CI/CD pipelines
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | [Tauri 2.0](https://tauri.app/) |
| Frontend | [React 19](https://react.dev/) |
| Language (Frontend) | [TypeScript](https://www.typescriptlang.org/) |
| Language (Backend) | [Rust](https://www.rust-lang.org/) |
| Git Operations | [git2](https://docs.rs/git2/) (libgit2 bindings) |
| Bundler | [Vite](https://vitejs.dev/) |
| State Management | [Zustand](https://zustand-demo.pmnd.rs/) |

## License

This project is licensed under the **GNU General Public License v3.0**.

See the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Fork](https://git-fork.com/) - The inspiration for this project. If you're on macOS or Windows and want a polished, stable Git client, go use Fork. It's excellent.
- [Tauri](https://tauri.app/) - For making cross-platform desktop apps with web technologies actually good.
- [libgit2](https://libgit2.org/) - For the Git implementation that powers this app.

## Author

**José Luis Castro (@calambrenet)**

[![Website](https://img.shields.io/badge/Website-jluiscastro.com-blue?style=flat-square&logo=google-chrome&logoColor=white)](https://jluiscastro.com)
[![Twitter](https://img.shields.io/badge/Twitter-@calambrenet-1DA1F2?style=flat-square&logo=x&logoColor=white)](https://x.com/calambrenet)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-jluiscastro-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/jluiscastro/)

---

**Note:** This is a personal project built for my own use. It works for me, but your mileage may vary. Bug reports and contributions are welcome, but please don't expect enterprise-level support.
