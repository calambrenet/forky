# Open Source Guide for Forky

This guide explains how to publish and maintain Forky as an open source project.

## Summary of Created Files

| File | Purpose |
|------|---------|
| `LICENSE` | Apache 2.0 License |
| `CONTRIBUTING.md` | Guide for contributors |
| `.github/workflows/ci.yml` | Automated tests on each PR |
| `.github/workflows/release.yml` | Multi-platform builds on each release |

---

## 1. License: Apache 2.0

### Why Apache 2.0

- **Permissive:** Anyone can use, modify, and distribute the code
- **Patent protection:** Includes explicit patent license grant
- **Compatible:** Works with MIT, BSD, and other permissive licenses
- **Used by:** Rust, Android, Kubernetes, many Apache Foundation projects

### What it Allows

- Commercial use
- Modification
- Distribution
- Private use
- Sublicensing

### What it Requires

- Include a copy of the license in distributions
- State changes made to modified files
- Preserve copyright notices

---

## 2. Publishing on GitHub

### Step 1: Create Repository

1. Go to https://github.com/new
2. Name: `forky`
3. Description: "Cross-platform Git client inspired by Fork"
4. **Public** (for open source)
5. Do not initialize with README (you already have files)

### Step 2: Upload the Code

```bash
cd /home/calambrenet/RustWorkspace/forky

# Initialize git if it doesn't exist
git init

# Add remote
git remote add origin https://github.com/YOUR_USERNAME/forky.git

# Upload everything
git add .
git commit -m "[CHORE] Initial open source release"
git push -u origin master
```

### Step 3: Configure Repository

On GitHub, go to repository **Settings**:

#### General
- Add topics: `git`, `tauri`, `rust`, `react`, `desktop-app`

#### Features
- Issues: Enabled
- Projects: Optional
- Wiki: Optional

#### Branches
- Protect `master`:
  - Require pull request reviews before merging
  - Require status checks to pass (CI)

---

## 3. Release System

### Creating a Release

When you want to publish a new version:

```bash
# Update version in files
# - package.json: "version": "1.0.0"
# - src-tauri/Cargo.toml: version = "1.0.0"
# - src-tauri/tauri.conf.json: "version": "1.0.0"

# Commit the changes
git add .
git commit -m "[RELEASE] v1.0.0"
git push

# Create tag
git tag v1.0.0
git push origin v1.0.0
```

### What Happens Automatically

1. GitHub Actions detects the `v*` tag
2. Runs parallel builds:
   - **Linux:** Ubuntu 22.04 → `.deb`, `.AppImage`
   - **Windows:** → `.msi`, `.exe`
   - **macOS Intel:** → `.dmg` (x64)
   - **macOS Apple Silicon:** → `.dmg` (aarch64)
3. Creates a draft Release with all binaries
4. You review and publish the release

### Publishing the Release

1. Go to **Releases** on GitHub
2. You'll see a draft with attached binaries
3. Edit the description if needed
4. Click **Publish release**

---

## 4. Managing Contributions

### Pull Request Flow

```
Contributor fork → feature branch → PR → Review → Merge
```

1. Contributor forks the repo
2. Creates a branch with their changes
3. Opens a Pull Request
4. CI runs tests automatically
5. You review and approve (or request changes)
6. Merge to master

### Maintaining Control

As maintainer, you have the final say:

- **Only you** can merge to master (if you protect the branch)
- **Only you** can publish releases
- You can close PRs that don't fit the project vision
- You can request changes before accepting

### Recommended Labels

Create these labels on GitHub to organize issues:

| Label | Color | Description |
|-------|-------|-------------|
| `bug` | #d73a4a | Something isn't working |
| `enhancement` | #a2eeef | New feature |
| `good first issue` | #7057ff | Good for newcomers |
| `help wanted` | #008672 | Extra attention is needed |
| `documentation` | #0075ca | Improvements or additions to docs |
| `duplicate` | #cfd3d7 | This issue already exists |
| `wontfix` | #ffffff | This will not be worked on |

---

## 5. Optional Additional Files

### README.md (recommended to update)

Add at the top:

```markdown
# Forky

Cross-platform Git client inspired by [Fork](https://git-fork.com/).

[![CI](https://github.com/YOUR_USERNAME/forky/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/forky/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

## Downloads

Download the latest version for your operating system from [Releases](../../releases).

| System | File |
|--------|------|
| Windows | `.msi` or `.exe` |
| macOS Intel | `x64.dmg` |
| macOS Apple Silicon | `aarch64.dmg` |
| Linux (Debian/Ubuntu) | `.deb` |
| Linux (Universal) | `.AppImage` |
```

### .github/ISSUE_TEMPLATE/bug_report.md

```yaml
---
name: Bug Report
about: Report a problem
title: '[BUG] '
labels: bug
---

**Describe the bug**
A clear description of the problem.

**Steps to reproduce**
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What should happen.

**Screenshots**
If applicable.

**System:**
 - OS: [e.g. Windows 11, macOS 14, Ubuntu 22.04]
 - Forky version: [e.g. 1.0.0]
```

### .github/ISSUE_TEMPLATE/feature_request.md

```yaml
---
name: Feature Request
about: Suggest an improvement
title: '[FEATURE] '
labels: enhancement
---

**What problem does this solve?**
Description of the use case.

**Proposed solution**
How you'd like it to work.

**Alternatives considered**
Other options you've thought about.
```

---

## 6. Publishing Checklist

- [ ] Review that there are no secrets/API keys in the code
- [ ] Verify that `.gitignore` excludes sensitive files
- [ ] Update version in `package.json`, `Cargo.toml`, `tauri.conf.json`
- [ ] Create repository on GitHub (public)
- [ ] Push the code
- [ ] Verify that CI passes
- [ ] Create first release with tag `v0.1.0` or similar
- [ ] Verify that binaries are generated correctly
- [ ] Publish the release
- [ ] Share the link

---

## 7. Quick Commands

```bash
# Check status
git status

# Upload changes
git add . && git commit -m "[TYPE] message" && git push

# Create release
git tag v1.0.0 && git push origin v1.0.0

# View tags
git tag -l

# Delete tag (if you make a mistake)
git tag -d v1.0.0
git push origin :refs/tags/v1.0.0
```

---

## 8. Resources

- [GitHub Open Source Guide](https://opensource.guide/)
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [Tauri GitHub Actions](https://tauri.app/distribute/github-actions/)
- [Semantic Versioning](https://semver.org/)

---

Your project is ready to be open source!
