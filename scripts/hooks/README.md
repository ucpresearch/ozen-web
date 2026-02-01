# Git Hooks for ozen-web

This directory contains optional git hooks to automate common tasks.

## Available Hooks

### post-commit

Automatically copies `build/` to `docs/live/` after each commit (if `build/` exists).

This ensures the embedded viewer examples in documentation always use the latest build.

## Installation

### Option 1: Symlink (recommended)

```bash
# From repository root
ln -sf ../../scripts/hooks/post-commit .git/hooks/post-commit
chmod +x .git/hooks/post-commit
```

### Option 2: Copy

```bash
# From repository root
cp scripts/hooks/post-commit .git/hooks/post-commit
chmod +x .git/hooks/post-commit
```

## Behavior

**With hook installed:**

1. You run `npm run build`
2. You commit changes: `git commit -m "Fix bug"`
3. Hook automatically:
   - Copies `build/` → `docs/live/`
   - Amends the commit to include updated `docs/live/`

**Without hook:**

Manually run when needed:
```bash
npm run build:docs
```

## Disable Hook Temporarily

```bash
# Disable for one commit
git commit --no-verify -m "message"

# Disable permanently
rm .git/hooks/post-commit
```

## Alternative: npm Script Only

If you don't want automatic updates, just use the npm script:

```bash
# Build app and copy to docs/live/
npm run build:docs

# Then commit manually
git add docs/live
git commit -m "Update live viewer"
```
