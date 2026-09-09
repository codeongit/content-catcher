import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extension"


def main():
    manifest = json.loads((EXTENSION / "manifest.json").read_text())
    assert manifest["manifest_version"] == 3
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

    popup = (EXTENSION / "popup.js").read_text()
    assert "chrome.scripting.executeScript" in popup
    assert "chrome.downloads.download" in popup
    assert 'files: ["extractor.js"]' in popup

    extractor = (EXTENSION / "extractor.js").read_text()
    for marker in [
        "#js_content",
        "findContentRoot",
        "toMarkdown",
        "data-src",
        "trimTrailingPromotion",
        "promoteVisualHeadings",
        "account:",
    ]:
        assert marker in extractor, f"Missing extractor capability: {marker}"

    print("All static checks passed.")


if __name__ == "__main__":
    main()
