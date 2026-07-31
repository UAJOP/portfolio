from __future__ import annotations

import re
from pathlib import Path

PLACEHOLDER_IMAGE = (
    "data:image/gif;base64,"
    "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
)


def write_if_changed(path: Path, updated: str) -> bool:
    original = path.read_text(encoding="utf-8")
    if original == updated:
        print(f"unchanged: {path}")
        return False
    path.write_text(updated, encoding="utf-8")
    print(f"updated:   {path}")
    return True


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        print(f"already fixed: {label}")
        return text
    raise RuntimeError(f"Could not find expected source for: {label}")


def patch_index() -> None:
    path = Path("index.html")
    text = path.read_text(encoding="utf-8")
    text = text.replace(
        "https://github.com/UAJOP/Wheather-App",
        "https://github.com/UAJOP/Weather-App",
    )
    write_if_changed(path, text)


def patch_works() -> None:
    path = Path("works.html")
    text = path.read_text(encoding="utf-8")
    text = replace_required(
        text,
        '</section>\n<section class="section-shell cta-panel reveal">',
        '</section>\n</section>\n<section class="section-shell cta-panel reveal">',
        "close the outer works catalog section",
    )
    write_if_changed(path, text)


def patch_ai_flow_page() -> None:
    path = Path("ai-flow-puzzle.html")
    text = path.read_text(encoding="utf-8")
    text = text.replace(
        '<aside class="ai-puzzle-panel reveal">',
        '<aside aria-label="Workflow scenarios and templates" class="ai-puzzle-panel reveal">',
        1,
    )
    text = text.replace(
        '<aside class="ai-puzzle-panel ai-puzzle-side reveal delay-2">',
        '<aside aria-label="Workflow objectives and inspector" class="ai-puzzle-panel ai-puzzle-side reveal delay-2">',
        1,
    )
    text = text.replace("Inspector & config", "Inspector &amp; config")
    write_if_changed(path, text)


def add_modal_inert_and_image_placeholders() -> None:
    dynamic_image_attributes = {
        "data-case-modal-image",
        "data-modal-img",
        "data-joyday-preview-img",
    }
    modal_attributes = {
        "data-case-modal",
        "data-modal",
        "data-joyday-modal",
    }

    tag_pattern = re.compile(r"<(?:div|section|img)\b[^>]*>", re.IGNORECASE)
    attribute_pattern = re.compile(r"\s([:\w-]+)(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+))?")

    for path in sorted(Path(".").glob("*.html")):
        original = path.read_text(encoding="utf-8")

        def patch_tag(match: re.Match[str]) -> str:
            tag = match.group(0)
            attributes = {name.lower() for name in attribute_pattern.findall(tag)}

            if tag.lower().startswith("<img") and attributes & dynamic_image_attributes:
                if "src" not in attributes:
                    tag = tag[:-1] + f' src="{PLACEHOLDER_IMAGE}">'
                else:
                    tag = re.sub(
                        r'\bsrc\s*=\s*(["\'])\s*\1',
                        f'src="{PLACEHOLDER_IMAGE}"',
                        tag,
                    )

            if attributes & modal_attributes and 'aria-hidden="true"' in tag:
                if "inert" not in attributes:
                    tag = tag[:-1] + " inert>"

            return tag

        updated = tag_pattern.sub(patch_tag, original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            print(f"updated:   {path} (modal semantics)")


def patch_script_js() -> None:
    path = Path("script.js")
    text = path.read_text(encoding="utf-8")
    text = replace_required(
        text,
        "let lastModalTrigger = null;\n",
        "let lastModalTrigger = null;\nif (modal) modal.inert = true;\n",
        "initialize certificate modal inert state",
    )
    text = replace_required(
        text,
        '  modal.setAttribute("aria-hidden", "true");\n  document.body.classList.remove("modal-open");\n  modalImg.src = "";',
        '  modal.setAttribute("aria-hidden", "true");\n  modal.inert = true;\n  document.body.classList.remove("modal-open");\n  modalImg.removeAttribute("src");',
        "close certificate modal safely",
    )
    text = replace_required(
        text,
        '      modal.classList.add("is-open");\n      modal.setAttribute("aria-hidden", "false");\n      document.body.classList.add("modal-open");',
        '      modal.classList.add("is-open");\n      modal.inert = false;\n      modal.setAttribute("aria-hidden", "false");\n      document.body.classList.add("modal-open");',
        "open certificate modal accessibly",
    )
    write_if_changed(path, text)


def patch_case_study_js() -> None:
    path = Path("case-study.js")
    text = path.read_text(encoding="utf-8")
    text = replace_required(
        text,
        "  let modalTrigger = null;\n",
        "  let modalTrigger = null;\n  if (modal) modal.inert = true;\n",
        "initialize case-study modal inert state",
    )
    text = replace_required(
        text,
        '    modal.setAttribute("aria-hidden", "true");\n    document.body.classList.remove("case-modal-open");',
        '    modal.setAttribute("aria-hidden", "true");\n    modal.inert = true;\n    document.body.classList.remove("case-modal-open");',
        "close case-study modal accessibly",
    )
    text = replace_required(
        text,
        '      modalImage.src = button.dataset.caseGallery;',
        '      modalImage.src = button.dataset.caseGallery;',
        "keep case-study image assignment",
    )
    text = replace_required(
        text,
        '      modal.classList.add("is-open");\n      modal.setAttribute("aria-hidden", "false");',
        '      modal.classList.add("is-open");\n      modal.inert = false;\n      modal.setAttribute("aria-hidden", "false");',
        "open case-study modal accessibly",
    )
    text = text.replace('      modalImage.src = "";', '      modalImage.removeAttribute("src");')
    write_if_changed(path, text)


def patch_joyday_js() -> None:
    path = Path("joyday-paint.js")
    text = path.read_text(encoding="utf-8")
    text = replace_required(
        text,
        "  const exportButtons = document.querySelectorAll(\"[data-joyday-export-mode]\");\n",
        "  const exportButtons = document.querySelectorAll(\"[data-joyday-export-mode]\");\n  if (modal) modal.inert = true;\n",
        "initialize Joyday modal inert state",
    )
    text = replace_required(
        text,
        '    modal.hidden = false;\n    modal.setAttribute("aria-hidden", "false");',
        '    modal.hidden = false;\n    modal.inert = false;\n    modal.setAttribute("aria-hidden", "false");',
        "open Joyday modal accessibly",
    )
    text = replace_required(
        text,
        '    modal.hidden = true;\n    modal.setAttribute("aria-hidden", "true");',
        '    modal.hidden = true;\n    modal.setAttribute("aria-hidden", "true");\n    modal.inert = true;',
        "close Joyday modal accessibly",
    )
    write_if_changed(path, text)


def main() -> None:
    patch_index()
    patch_works()
    patch_ai_flow_page()
    add_modal_inert_and_image_placeholders()
    patch_script_js()
    patch_case_study_js()
    patch_joyday_js()
    print("Preflight cleanup applied successfully.")


if __name__ == "__main__":
    main()
