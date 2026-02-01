# GitHub Pages Setup

This documentation site is configured to deploy to GitHub Pages serving from the `/docs` folder.

## Configuration

Documentation source files (`.qmd`) are in `docs-src/`, and Quarto renders HTML output to `docs/`:

```yaml
# docs-src/_quarto.yml
project:
  type: website
  output-dir: ../docs  # Output to docs/ directory
```

This keeps source separate from generated files, and allows GitHub Pages to serve from `/docs`.

## GitHub Pages Settings

After pushing to GitHub, configure GitHub Pages:

1. Go to repository **Settings** → **Pages**
2. Under **Source**, select: **Deploy from a branch**
3. Under **Branch**, select:
   - Branch: `master` (or `main`)
   - Folder: `/docs`
4. Click **Save**

GitHub will automatically deploy from the `/docs` folder whenever you push HTML changes.

## Workflow

### Automatic Deployment (via GitHub Actions)

The `.github/workflows/deploy-docs.yml` workflow automatically:

1. Builds the ozen-web app
2. Copies `build/` → `docs/live/` (for embedded examples)
3. Captures screenshots with Playwright
4. Renders Quarto documentation to `docs/`
5. Commits generated HTML files back to the repository
6. GitHub Pages automatically deploys the updated `/docs` folder

**Triggers:**
- Push to master/main with changes to documentation or app source
- Manual trigger via GitHub Actions UI

### Manual Deployment (local)

You can also render and commit locally:

```bash
# Render documentation from source
cd docs-src
quarto render

# Commit generated HTML
git add ../docs/*.html ../docs/**/*.html ../docs/site_libs/
git commit -m "Update documentation"
git push
```

GitHub Pages will pick up the changes automatically.

## File Structure

Documentation source and output are separated:

```
ozen-web/
├── docs-src/                    # Source files (committed)
│   ├── _quarto.yml              # Quarto configuration
│   ├── index.qmd                # Landing page source
│   ├── getting-started.qmd
│   ├── tutorial/*.qmd
│   ├── features/*.qmd
│   ├── embedding/*.qmd
│   ├── reference/*.qmd
│   ├── development/*.qmd
│   ├── assets/                  # CSS, images (source)
│   └── screenshots/             # Screenshot placeholders
│
└── docs/                        # Generated HTML (committed, served by GitHub Pages)
    ├── index.html
    ├── getting-started.html
    ├── tutorial/*.html
    ├── features/*.html
    ├── embedding/*.html
    ├── reference/*.html
    ├── development/*.html
    ├── site_libs/               # Bootstrap, jQuery, etc.
    ├── assets/                  # CSS, images (copied from source)
    ├── screenshots/             # Generated screenshots
    └── live/                    # Built ozen-web app (for embedding examples)
```

This keeps source (`.qmd`) separate from generated (`.html`) files.

## Why This Approach?

**Previous approach (GitHub Actions artifact deployment):**
- ✅ Cleaner repository (no committed HTML)
- ❌ More complex setup
- ❌ Requires GitHub Actions permissions

**Current approach (serve from /docs):**
- ✅ Simpler setup
- ✅ Works with standard GitHub Pages options
- ✅ Easier to debug (HTML files visible in repo)
- ❌ Commits HTML files to repository

For a documentation site, committing HTML is acceptable and simplifies deployment.

## Verification

After pushing, verify deployment:

1. Check GitHub Actions run completed successfully
2. Visit: `https://ucpresearch.github.io/ozen-web/`
3. Verify all pages load correctly
4. Check embedded viewer examples work

## Troubleshooting

**404 errors on GitHub Pages:**
- Verify `/docs` folder is committed
- Check GitHub Pages settings point to `/docs`
- Ensure `index.html` exists in `docs/`

**Missing CSS/JS:**
- Ensure `site_libs/` directory is committed
- Check that `.gitignore` doesn't exclude `site_libs/`

**Embedded viewer not loading:**
- Verify `docs/live/` directory exists and is committed
- Check that the build was copied: `npm run build:docs`

## See Also

- `BUILD_SYNC.md` - Syncing build to docs/live
- `.github/workflows/deploy-docs.yml` - Deployment workflow
- `_quarto.yml` - Quarto configuration
