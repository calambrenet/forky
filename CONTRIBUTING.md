# Contributing to Forky

Thank you for your interest in contributing to Forky. This guide will help you get started.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and collaborative environment. Be kind to other contributors.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](../../issues)
2. Create a new issue with:
   - Descriptive title
   - Steps to reproduce the problem
   - Expected vs actual behavior
   - Operating system and version
   - Screenshots if applicable

### Suggesting Improvements

1. Open an issue describing the improvement
2. Explain the use case and why it would be useful
3. If possible, describe how you would implement it

### Contributing Code

#### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) or npm
- Tauri dependencies for your operating system:
  - **Linux:** `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev`
  - **macOS:** Xcode Command Line Tools
  - **Windows:** Visual Studio Build Tools, WebView2

#### Setting Up the Environment

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/forky.git
cd forky

# Install dependencies
npm install

# Verify everything works
npm run tauri dev
```

#### Workflow

1. **Fork** the repository
2. **Create a branch** from `master`:
   ```bash
   git checkout -b feature/my-new-feature
   # or
   git checkout -b fix/bug-i-am-fixing
   ```
3. **Make your changes** following project conventions
4. **Verify the code**:
   ```bash
   # Frontend
   npm run lint
   npm run type-check

   # Backend
   cd src-tauri
   cargo fmt --check
   cargo clippy
   cargo test
   ```
5. **Commit** with descriptive messages:
   ```bash
   git commit -m "[TYPE] Brief description"
   ```
   Types: `FEATURE`, `FIX`, `REFACTOR`, `DOCS`, `TEST`, `CHORE`

6. **Push** to your fork:
   ```bash
   git push origin feature/my-new-feature
   ```
7. Open a **Pull Request** to `master`

#### Code Conventions

##### Rust
- Format with `cargo fmt`
- No warnings from `cargo clippy`
- snake_case for functions and variables
- PascalCase for structs and enums
- Document public functions with `///`

##### TypeScript/React
- Format with Prettier (configured in the project)
- PascalCase for components
- camelCase for functions and variables
- Explicit types, avoid `any`

##### CSS
- Use existing CSS variables in `src/styles/global.css`
- BEM or descriptive class names
- One CSS file per component

##### Commits
- Prefix with type in brackets: `[FEATURE]`, `[FIX]`, etc.
- First line maximum 72 characters
- Detailed description if necessary

### Pull Requests

- Describe what your PR does and why
- Reference related issues (#123)
- Include screenshots for UI changes
- Make sure all checks pass
- One PR = one feature or fix

## Project Structure

```
forky/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/              # Custom hooks
│   ├── types/              # TypeScript definitions
│   └── styles/             # Global styles
├── src-tauri/              # Rust backend
│   └── src/
│       └── git/            # Git logic
└── .github/workflows/      # CI/CD
```

See [CLAUDE.md](CLAUDE.md) for more technical details.

## Review Process

1. A maintainer will review your PR
2. They may request changes or clarifications
3. Once approved, it will be merged to `master`
4. Your contribution will appear in the next release

## First Contribution

Look for issues labeled with:
- `good first issue` - Ideal for getting started
- `help wanted` - Need community help

## Questions

If you have questions, open an issue or ask in the comments of an existing PR.

---

Thank you for contributing to Forky.
