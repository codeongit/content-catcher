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

    required = ["popup.html", "popup.css", "popup.js", "extractor.js"]
    for filename in required:
        path = EXTENSION / filename
        assert path.is_file(), f"Missing {filename}"
        assert path.stat().st_size > 0, f"Empty {filename}"

    html = (EXTENSION / "popup.html").read_text()
    assert 'src="popup.js"' in html
    assert 'href="popup.css"' in html
    assert 'id="copyForAi"' in html
    assert 'id="readiness"' in html
    assert html.index('class="actions"') < html.index('class="tabs"')

    popup = (EXTENSION / "popup.js").read_text()
    assert "chrome.scripting.executeScript" in popup
    assert "chrome.downloads.download" in popup
    assert 'files: ["extractor.js"]' in popup
    assert "copyForAi" in popup
    assert "renderReadiness" in popup

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
        "schemaVersion: 2",
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
        ROOT / "tests/extractor.test.mjs",
        ROOT / "tests/fixtures/wechat-article.html",
        ROOT / "tests/fixtures/generic-article.html",
        ROOT / "tests/fixtures/short-article.html",
        ROOT / "tests/fixtures/body-fallback.html",
        ROOT / "tests/fixtures/large-cleanup.html",
    ]:
        assert path.is_file(), f"Missing regression asset: {path.relative_to(ROOT)}"

    print("All static checks passed.")


if __name__ == "__main__":
    main()
