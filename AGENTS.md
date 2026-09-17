# AGENTS.md

## Mission

Content Catcher is a local-first Chrome extension that extracts the main content of the active HTTP/HTTPS page and exports clean Markdown.

Current scope: one loaded page at a time, local parsing, Markdown/plain-text preview, copy/download, and redacted diagnostics. AI analysis, batch crawling, history sync, PDF parsing, paywall bypass, and image downloading are out of scope unless a later approved decision changes that boundary.

## Read before changing code

Use these documents as the source of truth:

1. [README.md](README.md) — product usage and developer entry points.
2. [docs/architecture.md](docs/architecture.md) — current parser architecture.
3. [docs/decisions/README.md](docs/decisions/README.md) — accepted architectural and product decisions.
4. [docs/maintenance-playbook.md](docs/maintenance-playbook.md) — issue triage, fixture creation, regression, and release flow.
5. [CONTRIBUTING.md](CONTRIBUTING.md) — coding, testing, documentation, commit, and PR requirements.

## Non-negotiable boundaries

- Keep page content local unless the user explicitly exports it.
- Never commit secrets, credentials, authenticated data, or full copied articles.
- Diagnostics must redact prose and real URLs while preserving reproducible DOM structure.
- Put site-specific behavior in `SITE_ADAPTERS`; keep generic parsing shared.
- Every parser fix requires a minimal synthetic fixture and regression assertion.
- Keep Chrome permissions minimal and keep `extension/` loadable without a build step.
- Do not bypass authentication, paywalls, browser protections, or site permissions.

## Required verification

```bash
npm ci
npm test
npm run check:static
git diff --check
```

For a distributable package, also run `make package`. A pushed change is complete only after GitHub Actions succeeds.

## Browser testing ownership

Real-browser testing is owned by human maintainers, including extension loading/reloading, live-page extraction, popup layout, clipboard, and downloads. Agents perform offline regression tests, static checks, and packaging as needed, then provide a concise manual checklist. Do not initiate real-browser testing unless the user explicitly reassigns it. Pending human verification is a handoff item, not an agent browser-tool blocker; report it as pending until a human supplies results, and never equate jsdom or static checks with a real-browser pass.

## Archived article acceptance

When reviewing saved article notes, follow “收藏成品验收” in [the maintenance playbook](docs/maintenance-playbook.md#收藏成品验收). Judge whether the notes serve reliable storage and later reference before listing improvements. State a pass when there are no blocking issues within the reviewed scope; minor formatting, repetition, and nonessential metadata uncertainty are not automatic failures. Do not turn individual review suggestions into new default prompt rules.
