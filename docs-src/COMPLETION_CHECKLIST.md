# Documentation Completion Checklist

Use this checklist to track progress on completing the Ozen-web documentation site.

## 🚀 Pre-Launch (Required for First Deployment)

- [ ] **Add test audio file**
  - [ ] Create or record a 5-15 second speech sample
  - [ ] Save as WAV (16-bit PCM) to `scripts/screenshots/test-audio/sample.wav`
  - [ ] Verify audio has clear vowels and consonants

- [ ] **Update placeholder URLs**
  - [ ] Find all instances: `grep -r "ucpresearch" docs/`
  - [ ] Replace with actual GitHub username
  - [ ] Files to check: `_quarto.yml`, `index.html`, `getting-started.html`, tutorial files, etc.

- [ ] **Install prerequisites**
  - [ ] Quarto 1.4.549+ installed
  - [ ] Node.js 18+ installed
  - [ ] Screenshot dependencies: `cd scripts/screenshots && npm install`

- [ ] **Test local build**
  - [ ] Run: `./scripts/docs/build-docs.sh`
  - [ ] Fix any build errors
  - [ ] Verify screenshots directory populated: `ls docs/screenshots/`

- [ ] **Test local preview**
  - [ ] Run: `./scripts/docs/serve-docs.sh`
  - [ ] Open http://localhost:8080
  - [ ] Click through all navigation links
  - [ ] Verify no broken internal links

- [ ] **Push to GitHub**
  - [ ] Create GitHub repository (if not exists)
  - [ ] Push all files
  - [ ] Enable GitHub Pages in Settings → Pages
  - [ ] Wait for deployment (~5 minutes)
  - [ ] Verify site live at `https://USERNAME.github.io/ozen-web/`

## 📄 Complete Stub Pages

### Features (7 pages)

- [ ] **features/spectrogram.html**
  - Content: Spectrogram computation, colormap, zoom enhancement
  - Sources: `CLAUDE.md`, `src/lib/components/Spectrogram.svelte`
  - Screenshots: Zoomed spectrogram, max frequency selector

- [ ] **features/waveform.html**
  - Content: Waveform display, downsampling, synchronization
  - Sources: `src/lib/components/Waveform.svelte`
  - Screenshots: Waveform visualization

- [ ] **features/annotations.html**
  - Content: TextGrid support, tier management, undo system
  - Sources: `CLAUDE.md`, `src/lib/stores/annotations.ts`
  - Screenshots: Multi-tier annotations, boundary editing

- [ ] **features/acoustic-overlays.html**
  - Content: All overlay types, interpretation guide, settings
  - Sources: `CLAUDE.md`, `src/lib/wasm/acoustic.ts`
  - Screenshots: Individual overlays, combined overlays

- [ ] **features/data-points.html**
  - Content: Adding/moving/removing points, export format
  - Sources: `src/lib/stores/dataPoints.ts`
  - Screenshots: Data points on spectrogram, TSV output

- [ ] **features/audio-playback.html**
  - Content: Playback controls, Web Audio API details
  - Sources: `src/lib/audio/player.ts`
  - Screenshots: Playback cursor, controls

- [ ] **features/mobile-viewer.html**
  - Content: Touch gestures, mobile layout, URL parameters
  - Sources: `src/routes/viewer/+page.svelte`, `src/lib/touch/gestures.ts`
  - Screenshots: Mobile interface (portrait/landscape)

### Embedding (4 pages)

- [ ] **embedding/basic-usage.html**
  - Content: Step-by-step embedding guide, directory structure
  - Sources: `README.md` (Embedding section)
  - Examples: HTML snippets, helper script usage

- [ ] **embedding/quarto-integration.html**
  - Content: Quarto-specific instructions, `embed-resources` handling
  - Sources: `README.md`, `scripts/create-iframe.*`
  - Examples: Quarto document with embedded viewer

- [ ] **embedding/url-parameters.html**
  - Content: All URL parameters, CORS setup, data URLs
  - Sources: `README.md`, `src/routes/viewer/+page.svelte`
  - Examples: Parameter combinations, server configs

- [ ] **embedding/examples.html**
  - Content: Real-world use cases with full code
  - Examples: Research paper, course material, blog post, notebook

### Reference (3 pages)

- [ ] **reference/configuration.html**
  - Content: All config.yaml options with descriptions
  - Sources: `static/config.yaml`, `src/lib/stores/config.ts`
  - Examples: Sample configs for different use cases

- [ ] **reference/backends.html**
  - Content: Backend comparison, when to use each, setup
  - Sources: `CLAUDE.md`, `src/lib/wasm/acoustic.ts`
  - Table: Feature comparison, license differences

- [ ] **reference/file-formats.html**
  - Content: TextGrid, TSV, WAV format specifications
  - Sources: `src/lib/textgrid/parser.ts`
  - Examples: File format examples, schemas

### Development (5 pages)

- [ ] **development/setup.html**
  - Content: Detailed dev environment setup, dependencies
  - Sources: `DEVELOPMENT.md`
  - Commands: Installation, build, test procedures

- [ ] **development/architecture.html**
  - Content: System design, component architecture
  - Sources: `CLAUDE.md`, `DEVELOPMENT.md`
  - Diagrams: Use Mermaid for architecture diagrams

- [ ] **development/stores.html**
  - Content: Svelte stores pattern, state management
  - Sources: `CLAUDE.md`, `src/lib/stores/*.ts`
  - Code: Store implementation examples

- [ ] **development/wasm-integration.html**
  - Content: WASM backend abstraction, adding new backends
  - Sources: `CLAUDE.md`, `src/lib/wasm/acoustic.ts`
  - Code: WASM usage patterns, memory management

- [ ] **development/contributing.html**
  - Content: Contribution guidelines, code style, PR process
  - Sources: Standard contributing guide template
  - Checklist: PR checklist, testing requirements

## 🖼️ Enhance Screenshots

- [ ] **Add missing screenshots** (not in initial 15)
  - [ ] File drop zone (highlighted when dragging)
  - [ ] Backend selector dropdown
  - [ ] Settings drawer (mobile)
  - [ ] Context menus (right-click)
  - [ ] TextGrid export dialog
  - [ ] TSV export result (spreadsheet view)
  - [ ] Values panel (close-up)
  - [ ] Boundary snapping visualization
  - [ ] Annotation editing (text input active)

- [ ] **Improve screenshot quality**
  - [ ] Use real speech audio (not synthesized tones)
  - [ ] Show meaningful labels ("hello", "world" not "a", "b")
  - [ ] Capture at different zoom levels
  - [ ] Include UI context (not just cropped regions)

## 📚 Add Example Files

- [ ] **docs/examples/demo-audio.wav**
  - Short (10-15 sec) speech sample
  - Clear vowels for formant demonstration
  - Varied intonation for pitch tracking

- [ ] **docs/examples/demo-textgrid.TextGrid**
  - Matching annotation for demo audio
  - Multiple tiers (words, phones)
  - Example labels

- [ ] **docs/examples/demo-data.tsv**
  - Sample data points export
  - Shows typical analysis output
  - Includes annotation labels

## 🔍 Quality Assurance

- [ ] **Verify all links**
  - [ ] Internal page links work
  - [ ] Screenshots display correctly
  - [ ] External links open (GitHub, resources)
  - [ ] Navigation breadcrumbs correct

- [ ] **Test on mobile**
  - [ ] Site responsive on phone
  - [ ] Navigation works (hamburger menu)
  - [ ] Images scale properly
  - [ ] No horizontal scroll

- [ ] **Test code examples**
  - [ ] All code snippets are valid
  - [ ] Bash commands work as written
  - [ ] Python/R examples are correct
  - [ ] File paths are accurate

- [ ] **Check consistency**
  - [ ] Terminology consistent across pages
  - [ ] Screenshot captions match content
  - [ ] Cross-references up to date
  - [ ] Keyboard shortcuts match implementation

## 🚀 Deployment & Maintenance

- [ ] **GitHub Actions verification**
  - [ ] deploy-docs.yml runs successfully
  - [ ] Screenshots generate in CI
  - [ ] Site deploys to GitHub Pages
  - [ ] No workflow errors

- [ ] **Weekly screenshot updates**
  - [ ] update-screenshots.yml scheduled correctly
  - [ ] Commits trigger re-deployment
  - [ ] Screenshots stay current with app changes

- [ ] **Set up custom domain** (optional)
  - [ ] Configure CNAME in repository settings
  - [ ] Update URLs in `_quarto.yml`
  - [ ] Test custom domain works

## 📊 Progress Tracking

Update this table as you complete sections:

| Section | Pages | Complete | Percentage |
|---------|-------|----------|------------|
| Pre-Launch | - | 0/6 | 0% |
| Features | 7 | 1/7 | 14% |
| Embedding | 4 | 1/4 | 25% |
| Reference | 3 | 1/3 | 33% |
| Development | 5 | 0/5 | 0% |
| Screenshots | 15+ | 0/15 | 0% |
| Examples | 3 | 0/3 | 0% |
| QA | - | 0/4 | 0% |
| **TOTAL** | **41+** | **3/47** | **~6%** |

## 🎯 Milestones

### Milestone 1: Deployable (MVP)
- [ ] Pre-launch checklist complete
- [ ] Site builds and deploys
- [ ] At least tutorial is complete
- **Target: 1-2 hours**

### Milestone 2: Feature Complete
- [ ] All stub pages have content
- [ ] All screenshots captured
- [ ] Examples added
- **Target: 20-30 hours**

### Milestone 3: Production Ready
- [ ] All QA checks pass
- [ ] Custom domain configured (optional)
- [ ] Documentation mentioned in main README
- [ ] Announced to users
- **Target: 30-40 hours total**

## 💡 Tips

- **Work incrementally**: Complete one page at a time, test, commit
- **Reuse content**: Extract from existing markdown files (README, DEVELOPMENT, CLAUDE)
- **Use templates**: Copy structure from completed pages
- **Test frequently**: Run `quarto preview` to see changes immediately
- **Ask for help**: Open issues on GitHub if stuck

---

**Start date:** ____________
**Target completion:** ____________
**Last updated:** ____________
