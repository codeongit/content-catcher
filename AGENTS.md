# AGENTS.md

## Project mission

Content Catcher is a local-first Chrome extension that extracts the main content of the active web page and exports clean Markdown.

The current product boundary is deliberately small:

- Parse one already-loaded HTTP/HTTPS page at a time.
- Preserve useful article structure, metadata, links, and images.
- Preview, copy, and download Markdown locally.
- Do not call remote services or require an API key.
- Do not bypass authentication, paywalls, browser protections, or site permissions.

AI analysis, batch crawling, history sync, PDF parsing, and image downloading are future capabilities, not part of the current runtime.

## Repository map

- `extension/`: loadable Manifest V3 extension source.
- `extension/extractor.js`: site adapters, generic content selection, cleanup, diagnostics, and Markdown conversion.
- `extension/popup.*`: extraction UI, preview, copy, download, and diagnostic export.
- `tests/fixtures/`: minimal synthetic HTML regression fixtures. Never store full copied articles here.
- `tests/extractor.test.mjs`: jsdom parser regression tests.
- `tests/static_check.py`: zero-install repository and manifest checks.
- `docs/architecture.md`: architecture and extension guidance.
- `CHANGELOG.md`: user-visible version history.
- `.github/workflows/test.yml`: required CI checks.

## Non-negotiable invariants

1. Page content remains local unless the user explicitly exports it.
2. Never put secrets, API keys, credentials, or authenticated page data in source, fixtures, logs, or diagnostics.
3. Diagnostic exports must redact article text and replace real image/link URLs while preserving the DOM structure needed to reproduce parsing problems.
4. Prefer semantic HTML and generic parsing before adding site-specific behavior.
5. Site-specific behavior belongs in `SITE_ADAPTERS`; do not scatter hostname checks through generic parsing code.
6. A site fix must not regress previously supported sites.
7. Do not commit real copyrighted article bodies as test fixtures. Reduce reported pages to synthetic, minimal reproductions.
8. Keep Chrome permissions minimal. New permissions require a documented reason and privacy review.
9. The unpacked `extension/` directory must remain usable without a build step.

## Workflow for a parsing bug

Use this sequence for missing content, excess navigation, wrong metadata, bad headings, image loss, or incorrect truncation:

1. Record the URL, expected behavior, and actual behavior.
2. Ask for the extension's redacted diagnostic JSON when DOM structure is needed.
3. Classify the problem as either generic parsing or a site adapter concern.
4. Convert the relevant diagnostic structure into a minimal synthetic fixture under `tests/fixtures/`.
5. Add a failing assertion to `tests/extractor.test.mjs` before changing parser behavior.
6. Implement the smallest safe generic or adapter-level fix.
7. Run the full test suite and static checks.
8. Update the extension version and `CHANGELOG.md` for user-visible changes.
9. Push only after all checks pass. Confirm the GitHub Actions run is green.

Do not fix a single reported page with a broad text-deletion rule unless the rule is constrained by site, location, structure, and a regression test.

## Commands

Requires Node.js 22+ for jsdom tests and Python 3 for static checks.

```bash
npm ci
npm test
npm run check:static
make package
```

Before committing, at minimum run:

```bash
npm test
npm run check:static
git diff --check
```

CI must pass the same parser tests and static checks.

## Parser design guidance

Content selection follows this order:

1. Matching site adapter with an explicit content root.
2. A sufficiently long semantic `article` or `articleBody` node.
3. Generic candidate scoring using text length, paragraph density, headings, images, link density, and positive/negative identifiers.

Cleanup should preserve meaningful headings, paragraphs, lists, quotes, tables, code, links, and images. Be conservative around short legitimate content.

When adding an adapter:

- Give it a stable `id`.
- Keep `matches`, `contentRoot`, metadata accessors, and `cleanup` small.
- Reuse generic cleanup and Markdown conversion.
- Add a fixture proving both the new behavior and the absence of page chrome.
- Avoid selectors based only on generated class names when a semantic or stable ID is available.

## Testing expectations

Every parser change needs coverage for its observable behavior. Useful assertions include:

- Correct title, author, account, date, and canonical URL.
- Required body text is present.
- Navigation, sidebar, promotion, or comments are absent.
- Heading levels are correct.
- Lazy-loaded images resolve to usable absolute URLs.
- Truncation keeps the final real paragraph and removes only trailing noise.
- Diagnostic HTML contains no original prose or real remote URLs.

Tests must be deterministic and must not fetch live websites.

## Documentation and commits

- Keep `README.md` focused on installation and user/developer entry points.
- Keep implementation rationale and maintenance flow in `docs/`.
- Record user-visible changes in `CHANGELOG.md`.
- Use focused commits such as `fix:`, `feat:`, `test:`, or `docs:`.
- Do not mix unrelated refactors with a parsing fix.
- Do not amend or rewrite published history unless the user explicitly requests it.

## Definition of done

A change is complete only when:

- The requested page behavior is covered by a synthetic regression test.
- All local tests and static checks pass.
- No new sensitive content or unnecessary Chrome permission is introduced.
- Documentation and version metadata are updated when applicable.
- The pushed GitHub Actions run succeeds.

