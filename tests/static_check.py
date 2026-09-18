import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extension"


def main():
    manifest = json.loads((EXTENSION / "manifest.json").read_text())
    package = json.loads((ROOT / "package.json").read_text())
    assert manifest["manifest_version"] == 3
    assert manifest["version"] == package["version"]
    assert manifest["action"]["default_popup"] == "popup.html"
    assert set(manifest["permissions"]) == {"activeTab", "scripting", "downloads"}

    required = [
        "popup.html",
        "popup.css",
        "popup.js",
        "extractor.js",
        "analysis-prompt.js",
        "evidence-index.js",
        "analysis-settings.js",
        "archive-prompt.js",
    ]
    for filename in required:
        path = EXTENSION / filename
        assert path.is_file(), f"Missing {filename}"
        assert path.stat().st_size > 0, f"Empty {filename}"

    html = (EXTENSION / "popup.html").read_text()
    assert '<script type="module" src="popup.js"></script>' in html
    assert 'href="popup.css"' in html
    assert 'id="copyForAi"' in html
    assert 'id="copyArchivePrompt"' in html
    assert 'id="archiveOutputRoot"' in html
    assert 'id="readiness"' in html
    assert html.index('class="actions"') < html.index('class="tabs"')

    popup = (EXTENSION / "popup.js").read_text()
    assert "chrome.scripting.executeScript" in popup
    assert "chrome.downloads.download" in popup
    assert 'files: ["extractor.js"]' in popup
    assert "copyForAi" in popup
    assert "copyArchivePrompt" in popup
    assert "renderReadiness" in popup
    assert 'from "./analysis-prompt.js"' in popup
    assert 'from "./archive-prompt.js"' in popup

    analysis_prompt = (EXTENSION / "analysis-prompt.js").read_text()
    for marker in [
        'ANALYSIS_PROMPT_VERSION = "evidence-v4"',
        "buildModelInput",
        "<capture_context>",
        "<evidence_index>",
        "buildEvidenceIndex",
        "cleanupStages",
        "<captured_content>",
        "imagePixelsTranscribed",
        "externalLinksVerified",
    ]:
        assert marker in analysis_prompt, f"Missing analysis prompt capability: {marker}"

    analysis_settings = (EXTENSION / "analysis-settings.js").read_text()
    assert "archiveOutputRoot" in analysis_settings

    archive_prompt = (EXTENSION / "archive-prompt.js").read_text()
    for marker in [
        'ARCHIVE_PROMPT_VERSION = "archive-v2"',
        "buildArchivePrompt",
        "archiveOutputRoot",
    ]:
        assert marker in archive_prompt, f"Missing archive prompt capability: {marker}"

    extractor = (EXTENSION / "extractor.js").read_text()
    for marker in [
        "#js_content",
        "findContentRoot",
        "toMarkdown",
        "data-src",
        "trimTrailingPromotion",
        "promoteVisualHeadings",
        "account:",
        "SITE_ADAPTERS",
        "diagnosticSnapshot",
        "schemaVersion: 3",
        "lengthPreservingPlaceholder",
        "selection:",
        "assessAnalysisReadiness",
    ]:
        assert marker in extractor, f"Missing extractor capability: {marker}"

    for path in [
        ROOT / "AGENTS.md",
        ROOT / "CONTRIBUTING.md",
        ROOT / "package.json",
        ROOT / ".github/workflows/test.yml",
        ROOT / "docs/maintenance-playbook.md",
        ROOT / "docs/decisions/README.md",
        ROOT / "docs/decisions/0001-local-first-mvp.md",
        ROOT / "docs/decisions/0002-generic-parser-with-site-adapters.md",
        ROOT / "docs/decisions/0003-markdown-first-export.md",
        ROOT / "docs/decisions/0004-redacted-diagnostics-and-synthetic-fixtures.md",
        ROOT / "docs/decisions/0005-regression-first-maintenance.md",
        ROOT / "docs/decisions/0006-semantic-selection-and-conservative-cleanup.md",
        ROOT / "docs/decisions/0007-advisory-analysis-readiness.md",
        ROOT / "docs/decisions/0008-evidence-grounded-model-handoff.md",
        ROOT / "docs/decisions/0009-conversational-feedback.md",
        ROOT / "docs/decisions/0010-on-demand-obsidian-archive.md",
        ROOT / "tests/extractor.test.mjs",
        ROOT / "tests/analysis-prompt.test.mjs",
        ROOT / "tests/evidence-index.test.mjs",
        ROOT / "docs/decisions/0011-evidence-index-and-analysis-contract.md",
        ROOT / "docs/decisions/0012-decision-oriented-plain-language-analysis.md",
        ROOT / "docs/decisions/0013-readable-archive-source.md",
        ROOT / "tests/analysis-settings.test.mjs",
        ROOT / "tests/archive-prompt.test.mjs",
        ROOT / "tests/popup.test.mjs",
        ROOT / "tests/fixtures/wechat-article.html",
        ROOT / "tests/fixtures/generic-article.html",
        ROOT / "tests/fixtures/short-article.html",
        ROOT / "tests/fixtures/body-fallback.html",
        ROOT / "tests/fixtures/large-cleanup.html",
        ROOT / "tests/fixtures/code-preservation.html",
        ROOT / "tests/fixtures/nested-code.html",
        ROOT / "tests/fixtures/heading-boundaries.html",
        ROOT / "tests/fixtures/cleanup-stages.html",
    ]:
        assert path.is_file(), f"Missing regression asset: {path.relative_to(ROOT)}"

    print("All static checks passed.")


if __name__ == "__main__":
    main()
