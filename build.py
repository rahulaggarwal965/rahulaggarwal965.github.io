#!/usr/bin/env python3
"""Build the static site: render posts/about.md → HTML, copy static assets to _site/."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

import markdown

IFRAME_NEEDS_SCROLLING = re.compile(r"<iframe(?![^>]*\bscrolling=)", flags=re.IGNORECASE)

ROOT = Path(__file__).parent
OUT = ROOT / "_site"
TEMPLATE_PATH = ROOT / "templates" / "base.html"

SITE_TITLE = "Rahul Aggarwal"
INDEX_HEADING = "Rahul Aggarwal"

MD = markdown.Markdown(
    extensions=[
        "fenced_code",
        "tables",
        "footnotes",
        "attr_list",
        "md_in_html",
        "pymdownx.arithmatex",
    ],
    extension_configs={
        "pymdownx.arithmatex": {"generic": True},
    },
    output_format="html5",
)


def parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 4)
    if end == -1:
        return {}, text
    meta: dict = {}
    for line in text[4:end].splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, text[end + 5 :]


BACK_LINK = '<footer class="page-footer"><a href="/">← back</a></footer>'


def render(title: str, body: str) -> str:
    template = TEMPLATE_PATH.read_text()
    return template.replace("{{title}}", title).replace("{{body}}", body)


def md_to_html(md_path: Path) -> tuple[dict, str]:
    meta, body = parse_frontmatter(md_path.read_text())
    MD.reset()
    html = MD.convert(body)
    html = IFRAME_NEEDS_SCROLLING.sub('<iframe scrolling="no"', html)
    return meta, html


def build_post(post_dir: Path) -> dict:
    slug = post_dir.name
    meta, html = md_to_html(post_dir / "index.md")
    title = meta.get("title", slug)
    date_str = meta.get("date", "")
    header = f'<header class="post-header"><h1>{title}</h1>'
    if date_str:
        header += f"<time>{date_str}</time>"
    header += "</header>\n"
    out_dir = OUT / "posts" / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    for item in post_dir.iterdir():
        if item.name == "index.md" or item.name.startswith("."):
            continue
        dst = out_dir / item.name
        if item.is_dir():
            shutil.copytree(item, dst, dirs_exist_ok=True)
        else:
            shutil.copy2(item, dst)
    body = header + f'<article class="post">\n{html}\n</article>\n{BACK_LINK}'
    (out_dir / "index.html").write_text(render(f"{title} — {SITE_TITLE}", body))
    return {"slug": slug, "title": title, "date": date_str}


def build_about() -> None:
    src = ROOT / "about.md"
    if not src.exists():
        return
    meta, html = md_to_html(src)
    title = meta.get("title", "About")
    (OUT / "about.html").write_text(render(f"{title} — {SITE_TITLE}", html + "\n" + BACK_LINK))


def build_index(posts: list[dict]) -> None:
    posts_sorted = sorted(posts, key=lambda p: p["date"], reverse=True)
    items = "\n".join(
        f'<li><time>{p["date"]}</time><a href="/posts/{p["slug"]}/">{p["title"]}</a></li>'
        for p in posts_sorted
    )
    body = (
        f"<h1>{INDEX_HEADING}</h1>\n"
        '<p class="site-sublink"><a href="/about.html">about</a></p>\n'
        "<h2>Posts</h2>\n"
        f'<ul class="post-list">\n{items}\n</ul>\n'
    )
    (OUT / "index.html").write_text(render(SITE_TITLE, body))


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    for name in ("style.css", "images"):
        src = ROOT / name
        if not src.exists():
            continue
        dst = OUT / name
        if src.is_dir():
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)
    posts_dir = ROOT / "posts"
    posts: list[dict] = []
    if posts_dir.exists():
        for d in sorted(posts_dir.iterdir()):
            if not d.is_dir() or d.name.startswith(("_", ".")):
                continue
            if (d / "index.md").exists():
                posts.append(build_post(d))
    build_index(posts)
    build_about()
    print(f"Built {len(posts)} post(s) → {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
