#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import subprocess
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_PDF = Path("/Users/sffs123gmail.com/.openclaw/workspace/총론_산부여성소아.pdf")
DEFAULT_TEAM4_ROOT = Path(
    "/Users/sffs123gmail.com/Desktop/의학과 공부 파일/자료/4조 실기 연습/CPX 대본"
)

REFERENCE_ITEMS = [
    {
        "docId": "38",
        "title": "38. 유방 통증 멍울",
        "hankeutTitle": "유방통/유방덩이",
        "pdfPages": [2, 11],
        "bookPages": [378, 387],
        "team4": [
            {
                "key": "breast_pain_mass",
                "label": "4조 유방통/유방덩이",
                "path": "34. 유방통,유방덩이_4조.docx",
                "tokens": ["유방통", "유방덩이", "4조"],
            }
        ],
    },
    {
        "docId": "39",
        "title": "39. 질분비물 질출혈",
        "hankeutTitle": "질분비물/질출혈",
        "pdfPages": [12, 23],
        "bookPages": [388, 399],
        "team4": [
            {
                "key": "vaginal_discharge_bleeding",
                "label": "4조 질분비물/질출혈",
                "path": "39. 질분비물_질출혈.docx",
                "tokens": ["질분비물", "질출혈"],
            }
        ],
    },
    {
        "docId": "40",
        "title": "40. 월경 이상 월경통",
        "hankeutTitle": "월경 이상/월경통",
        "pdfPages": [24, 33],
        "bookPages": [400, 409],
        "team4": [
            {
                "key": "amenorrhea",
                "label": "4조 무월경/월경이상",
                "path": "33-1. 월경이상(무월경)_4조.docx",
                "tokens": ["월경이상", "무월경", "4조"],
            },
            {
                "key": "dysmenorrhea",
                "label": "4조 월경통",
                "path": "33-2. 월경통_4조.docx",
                "tokens": ["월경통", "4조"],
            },
        ],
    },
    {
        "docId": "41",
        "title": "41. 산전 진찰",
        "hankeutTitle": "산전 진찰",
        "pdfPages": [34, 42],
        "bookPages": [410, 418],
        "team4": [
            {
                "key": "prenatal_care",
                "label": "4조 산전진찰",
                "path": "24. 산전진찰_4조.docx",
                "tokens": ["산전진찰", "4조"],
            }
        ],
    },
    {
        "docId": "42",
        "title": "42. 성장 발달",
        "hankeutTitle": "성장/발달지연",
        "pdfPages": [43, 56],
        "bookPages": [419, 432],
        "team4": [
            {
                "key": "growth_development_delay",
                "label": "4조 성장/발달지연",
                "path": "25. 성장,발달지연_4조.docx",
                "tokens": ["성장", "발달지연", "4조"],
            }
        ],
    },
    {
        "docId": "43",
        "title": "43. 예방접종",
        "hankeutTitle": "예방접종",
        "pdfPages": [57, 64],
        "bookPages": [433, 440],
        "team4": [
            {
                "key": "immunization",
                "label": "4조 예방접종",
                "path": "32. 예방접종_4조.docx",
                "tokens": ["예방접종", "4조"],
            }
        ],
    },
]


def normalize(value: str) -> str:
    return unicodedata.normalize("NFC", value).replace(" ", "").replace("_", "").lower()


def rel(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def image_size(path: Path) -> dict[str, int] | None:
    try:
        result = run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)])
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    width = height = None
    for line in result.stdout.splitlines():
        if "pixelWidth:" in line:
            width = int(line.rsplit(":", 1)[1].strip())
        elif "pixelHeight:" in line:
            height = int(line.rsplit(":", 1)[1].strip())
    if width and height:
        return {"width": width, "height": height}
    return None


def clean_hankeut_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x0c", "\n\n")
    cleaned = []
    for line in text.splitlines():
        stripped = line.strip()
        stripped = stripped.replace("白", "").strip()
        if not stripped:
            cleaned.append("")
            continue
        anchored = False
        for anchor in ("질분비물검사를", "산전 진찰은", "보통키가", "예방접종수첩"):
            if anchor in stripped:
                stripped = stripped[stripped.index(anchor):]
                anchored = True
                break
        if stripped in {"-", "’", "L", "습"}:
            continue
        if not anchored and re.search(r"(코엔트|팹먄|펜란|l장/발달지연|de\|ay)", stripped):
            continue
        if any(token in stripped for token in ("虹", "＼", "円", "땝", "l정")):
            continue
        if re.fullmatch(r"\d+\s+한 권으로 끝내는 CPX 총론", stripped):
            continue
        if re.fullmatch(r"산부/여성/소아.*\d+", stripped):
            continue
        cleaned.append(stripped)
    text = "\n".join(cleaned)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text


def write_hankeut_html(path: Path, title: str, text: str) -> None:
    body = html.escape(text)
    path.write_text(
        f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>
<style>
:root{{color-scheme:light}}
html,body{{margin:0;background:#fff;color:#172033;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}
body{{padding:20px}}
.hankeut-doc{{display:grid;gap:12px}}
.hankeut-title{{font-size:17px;font-weight:950;line-height:1.25;margin:0;color:#172033}}
.hankeut-note{{font-size:12px;font-weight:850;color:#66758f;border-bottom:1px solid #e1e8f2;padding-bottom:10px}}
.hankeut-text{{margin:0;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere;font-family:inherit;font-size:15px;line-height:1.7;color:#26354d}}
@media(max-width:520px){{body{{padding:14px}}.hankeut-text{{font-size:13px}}}}
</style>
</head>
<body>
<article class="hankeut-doc">
<h1 class="hankeut-title">{html.escape(title)}</h1>
<div class="hankeut-note">한끝 PDF 텍스트 발췌 · 이미지 제외</div>
<pre class="hankeut-text">{body}</pre>
</article>
</body>
</html>
""",
        encoding="utf-8",
    )


def render_hankeut_text(source_pdf: Path, item: dict, output_root: Path) -> dict:
    doc_id = item["docId"]
    out_dir = output_root / "hankeut" / doc_id
    clean_dir(out_dir)
    start, end = item["pdfPages"]
    result = run(["pdftotext", "-raw", "-enc", "UTF-8", "-f", str(start), "-l", str(end), str(source_pdf), "-"])
    extracted = clean_hankeut_text(result.stdout)
    html_path = out_dir / "content.html"
    write_hankeut_html(html_path, item["hankeutTitle"], extracted)

    return {
        "title": item["hankeutTitle"],
        "source": str(source_pdf),
        "renderMode": "text-html",
        "pdfPageRange": f"{start}-{end}",
        "bookPageRange": f"{item['bookPages'][0]}-{item['bookPages'][1]}",
        "html": rel(html_path),
        "textStats": {
            "characters": len(extracted),
        },
    }


def find_team4_docx(team4_root: Path, spec: dict) -> Path | None:
    if spec.get("path"):
        candidate = team4_root / spec["path"]
        if candidate.exists():
            return candidate
    wanted = [normalize(token) for token in spec["tokens"]]
    candidates = sorted(team4_root.rglob("*.docx"))
    for path in candidates:
        name = normalize(path.name)
        if all(token in name for token in wanted):
            return path
    return None


def render_quicklook_html(source_docx: Path, output_dir: Path) -> Path:
    clean_dir(output_dir)
    scratch = output_dir / "_ql"
    clean_dir(scratch)
    run(["qlmanage", "-o", str(scratch), "-p", str(source_docx)])
    previews = sorted(scratch.glob("*.qlpreview"))
    if not previews:
        raise RuntimeError(f"Quick Look preview was not created for {source_docx}")
    preview_dir = previews[0]
    for child in preview_dir.iterdir():
        if child.name == "PreviewProperties.plist":
            continue
        shutil.copy2(child, output_dir / child.name)
    shutil.rmtree(scratch)
    html = output_dir / "Preview.html"
    if not html.exists():
        raise RuntimeError(f"Quick Look preview HTML missing for {source_docx}")
    inject_quicklook_fit(html)
    return html


def inject_quicklook_fit(html: Path) -> None:
    text = html.read_text(encoding="utf-8")
    if "cpx-ql-fit" in text:
        return
    fit = """<style id="cpx-ql-fit">html{background:#fff}body{margin:0!important;overflow-x:auto;transform-origin:0 0}.cpx-ql-fit-note{display:none}</style><script id="cpx-ql-fit-script">(()=>{function fit(){const meta=document.querySelector('meta[name="viewport"]')?.content||'';const m=meta.match(/width\\s*=\\s*(\\d+)/i);const base=m?Number(m[1]):Math.max(900,document.body?.scrollWidth||1224);const scale=Math.min(1,Math.max(.42,(window.innerWidth-8)/base));if(document.body){document.body.style.zoom=String(scale);document.body.classList.add('cpx-ql-fitted')}}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fit,{once:true});else fit();window.addEventListener('resize',fit,{passive:true})})();</script>"""
    if "</head>" not in text:
        raise RuntimeError(f"Preview HTML has no head close tag: {html}")
    html.write_text(text.replace("</head>", fit + "</head>", 1), encoding="utf-8")


def inject_pandoc_reference_fit(html_path: Path) -> None:
    text = html_path.read_text(encoding="utf-8")
    if "cpx-pandoc-reference-fit" in text:
        return
    fit = """<style id="cpx-pandoc-reference-fit">
html,body{margin:0!important;background:#fff!important;color:#172033!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
body{max-width:none!important;padding:16px!important;font-size:14px!important;line-height:1.48!important}
p{margin:.38em 0!important}
table{width:100%!important;display:table!important;border-collapse:collapse!important;margin:12px 0!important;font-size:13px!important;table-layout:auto!important}
thead,tbody{border:0!important}
th,td{border:1px solid #d7dfec!important;padding:5px 7px!important;vertical-align:top!important}
th{background:#eef5ff!important;font-weight:900!important}
ol,ul{padding-left:1.25em!important;margin:.35em 0!important}
li>p{margin:.15em 0!important}
img{max-width:100%!important;height:auto!important}
h1,h2,h3,h4{line-height:1.25!important;margin:.8em 0 .4em!important}
</style>"""
    if "</head>" not in text:
        raise RuntimeError(f"Pandoc HTML has no head close tag: {html_path}")
    html_path.write_text(text.replace("</head>", fit + "</head>", 1), encoding="utf-8")


def render_docx_html(source_docx: Path, output_dir: Path) -> Path:
    clean_dir(output_dir)
    html_path = output_dir / "content.html"
    run(
        [
            "pandoc",
            str(source_docx),
            "-f",
            "docx",
            "-t",
            "html5",
            "--standalone",
            f"--extract-media={output_dir}",
            "-o",
            str(html_path),
        ]
    )
    inject_pandoc_reference_fit(html_path)
    return html_path


def render_team4_sources(team4_root: Path, item: dict, output_root: Path) -> list[dict]:
    rendered = []
    for spec in item["team4"]:
        source_docx = find_team4_docx(team4_root, spec)
        if not source_docx:
            rendered.append(
                {
                    "key": spec["key"],
                    "label": spec["label"],
                    "missing": True,
                    "tokens": spec["tokens"],
                }
            )
            continue
        out_dir = output_root / "team4" / item["docId"] / spec["key"]
        if shutil.which("pandoc"):
            html = render_docx_html(source_docx, out_dir)
            render_mode = "docx-html"
        else:
            html = render_quicklook_html(source_docx, out_dir)
            render_mode = "quicklook-html"
        rendered.append(
            {
                "key": spec["key"],
                "label": spec["label"],
                "source": str(source_docx),
                "renderMode": render_mode,
                "html": rel(html),
            }
        )
    return rendered


def build(args: argparse.Namespace) -> dict:
    source_pdf = args.source_pdf.expanduser().resolve()
    team4_root = args.team4_root.expanduser().resolve()
    output_root = args.output_root.expanduser().resolve()
    manifest_path = args.manifest.expanduser().resolve()

    if not source_pdf.exists():
        raise FileNotFoundError(source_pdf)
    if not team4_root.exists():
        raise FileNotFoundError(team4_root)

    clean_dir(output_root)
    items = {}
    for item in REFERENCE_ITEMS:
        hankeut = None if args.skip_hankeut else render_hankeut_text(source_pdf, item, output_root)
        team4 = [] if args.skip_team4 else render_team4_sources(team4_root, item, output_root)
        items[item["docId"]] = {
            "docId": item["docId"],
            "title": item["title"],
            "hankeut": hankeut,
            "team4": team4,
        }

    manifest = {
        "version": "cpx-reference-assets.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "notes": {
            "hankeut": "한끝 PDF는 이미지 페이지 스택이 아니라 CC별 연속 텍스트 HTML로 렌더링한다.",
            "team4": "4조 Word 파일은 pandoc HTML을 우선 사용하고, pandoc이 없을 때만 Quick Look HTML로 대체한다.",
        },
        "items": items,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Build CC-specific reference assets for the CPX editor.")
    parser.add_argument("--source-pdf", type=Path, default=DEFAULT_SOURCE_PDF)
    parser.add_argument("--team4-root", type=Path, default=DEFAULT_TEAM4_ROOT)
    parser.add_argument("--output-root", type=Path, default=REPO_ROOT / "assets" / "cpx-references")
    parser.add_argument("--manifest", type=Path, default=REPO_ROOT / "data" / "cpx-reference-manifest.json")
    parser.add_argument("--dpi", type=int, default=140)
    parser.add_argument("--quality", type=int, default=82)
    parser.add_argument("--skip-hankeut", action="store_true")
    parser.add_argument("--skip-team4", action="store_true")
    args = parser.parse_args()
    manifest = build(args)
    print(json.dumps({"ok": True, "items": list(manifest["items"].keys()), "manifest": str(args.manifest)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
