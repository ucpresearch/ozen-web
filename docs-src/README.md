# Documentation (docs-src/)

Quarto source files for the ozen-web documentation site.

Rendered HTML lives in `docs/`, which GitHub Pages serves at
https://ucpresearch.github.io/ozen-web/.

## Prerequisites

- [Quarto](https://quarto.org/docs/get-started/) 1.4.549+
- Playwright (for screenshots): `cd scripts/screenshots && npx playwright install chromium`

## Workflow

### 1. Edit source files

Edit `.qmd` files in this directory. Preview with live reload:

```bash
cd docs-src
quarto preview
```

### 2. Update screenshots (when UI changes)

From the project root:

```bash
npm run screenshots
```

This builds the app, captures screenshots to `docs-src/screenshots/`,
and copies them to `docs/screenshots/`.

### 3. Render documentation

```bash
cd docs-src
quarto render
```

Quarto renders to `_site/`, then the post-render hook
(`scripts/post-render.sh`) copies the output to `docs/`.

### 4. Update embedded app (when app code changes)

The `docs/live/` directory contains a built copy of ozen-web for
embedded viewer examples. A git post-commit hook updates it automatically
from `build/` if present. You can also run manually:

```bash
npm run build:docs
```

### 5. Commit and push

```bash
git add docs/ docs-src/
git commit -m "docs: ..."
git push
```

GitHub Pages deploys automatically from `docs/` on master.
