# Syncing Build to Documentation

The documentation site includes embedded live viewer examples that load from `docs/live/`. This directory should contain a copy of the built ozen-web app.

## Why?

The embedded examples in the documentation (especially in `embedding/` section) demonstrate the viewer with live, working examples. These need the actual built app.

## Methods

### 1. Manual: npm Script (Simple)

Run when needed:

```bash
npm run build:docs
```

This builds the app and copies `build/` → `docs/live/`.

Then commit:
```bash
git add docs/live
git commit -m "Update live viewer"
```

### 2. Automatic: Git Hook (Local Development)

Install the post-commit hook to automatically sync on every commit:

```bash
# From repository root
ln -sf ../../scripts/hooks/post-commit .git/hooks/post-commit
chmod +x .git/hooks/post-commit
```

**Behavior:**
- After each commit, if `build/` exists, it's automatically copied to `docs/live/`
- The commit is amended to include the updated `docs/live/`

**Disable temporarily:**
```bash
git commit --no-verify -m "message"
```

**Uninstall:**
```bash
rm .git/hooks/post-commit
```

See `scripts/hooks/README.md` for details.

### 3. Automatic: GitHub Actions (Production)

The `deploy-docs.yml` workflow automatically:

1. Builds the ozen-web app
2. Copies `build/` → `docs/live/`
3. Captures screenshots
4. Renders Quarto documentation
5. Deploys to GitHub Pages

**Triggers:**
- Push to master/main with changes to:
  - `docs/**` (documentation content)
  - `src/**` (app source code)
  - `static/**` (static assets)
  - Config files (package.json, svelte.config.js, vite.config.ts)
- Manual trigger via GitHub Actions UI

This ensures the documentation site always includes the latest build.

## Recommended Workflow

**For active development:**

```bash
# 1. Install git hook for convenience
ln -sf ../../scripts/hooks/post-commit .git/hooks/post-commit
chmod +x .git/hooks/post-commit

# 2. Build the app
npm run build

# 3. Commit changes (hook auto-updates docs/live/)
git add src/
git commit -m "Add new feature"

# 4. Push to trigger docs deployment
git push
```

**For one-off updates:**

```bash
# Build and copy manually
npm run build:docs

# Commit
git add docs/live
git commit -m "Update live viewer"
git push
```

## File Size Considerations

The `docs/live/` directory contains a full build (~2-5 MB). This is acceptable for git, but if size becomes an issue, consider:

1. **Git LFS** for the live directory
2. **Separate branch** for documentation builds
3. **CDN hosting** of the viewer (reference external URL instead)

For now, committing `docs/live/` directly is the simplest approach.

## Verifying Embedded Examples

After updating `docs/live/`, verify the embedded examples work:

```bash
cd docs
quarto preview
```

Navigate to any embedding example page (e.g., `embedding/examples.html`) and verify the iframes load correctly.

## See Also

- `scripts/hooks/README.md` - Git hooks documentation
- `.github/workflows/deploy-docs.yml` - Deployment workflow
- `embedding/` documentation - Pages using embedded viewer
