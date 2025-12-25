# Forky

A cross-platform Git client inspired by [Fork](https://git-fork.com/).

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

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

- Open and manage multiple Git repositories in tabs
- View commit history with branch visualization
- Stage/unstage files with diff preview
- Commit changes
- Push, pull, and fetch operations
- Branch management
- Dark theme
- Auto-refresh when files change (using native file system events)

### Planned Features

- Stash support
- Interactive rebase
- Cherry-pick
- Submodule support
- Custom themes
- And more...

## Installation

### Pre-built Binaries

Pre-built binaries will be available in the [Releases](../../releases) section once we set up the official repository.

| Platform | Format |
|----------|--------|
| Windows | `.msi`, `.exe` |
| macOS Intel | `.dmg` (x64) |
| macOS Apple Silicon | `.dmg` (aarch64) |
| Linux (Debian/Ubuntu) | `.deb` |
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
git clone https://github.com/YOUR_USERNAME/forky.git
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

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Fork](https://git-fork.com/) - The inspiration for this project. If you're on macOS or Windows and want a polished, stable Git client, go use Fork. It's excellent.
- [Tauri](https://tauri.app/) - For making cross-platform desktop apps with web technologies actually good.
- [libgit2](https://libgit2.org/) - For the Git implementation that powers this app.

---


**Note:** This is a personal project built for my own use. It works for me, but your mileage may vary. Bug reports and contributions are welcome, but please don't expect enterprise-level support.
