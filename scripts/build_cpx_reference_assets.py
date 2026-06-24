#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_PDF = Path("/Users/sffs123gmail.com/.openclaw/workspace/총론_산부여성소아.pdf")
DEFAULT_CC_PDF_ROOT = Path("/Users/sffs123gmail.com/.openclaw/workspace/총론_cc")
DEFAULT_TEAM4_ROOT = Path(
    "/Users/sffs123gmail.com/Desktop/의학과 공부 파일/자료/4조 실기 연습/CPX 대본"
)
SYSTEM_PDFS = {
    "circulation": Path("/Users/sffs123gmail.com/.openclaw/workspace/총론_순환기.pdf"),
}


def team4(key: str, label: str, path: str, tokens: list[str] | None = None) -> dict:
    return {
        "key": key,
        "label": label,
        "path": path,
        "tokens": tokens or [label.replace("4조", "").strip()],
    }


REFERENCE_ITEMS = [
    {
        "docId": "1",
        "title": "01. 급성 복통",
        "hankeutTitle": "급성 복통",
        "ccPdf": "cc01.pdf",
        "team4": [team4("acute_abdominal_pain", "4조 급성복통", "21. 급성복통_4조.docx", ["급성복통", "4조"])],
    },
    {
        "docId": "2",
        "title": "02. 소화불량 만성 복통",
        "hankeutTitle": "소화불량/만성복통",
        "ccPdf": "cc02.pdf",
        "team4": [team4("dyspepsia_chronic_abdominal_pain", "4조 소화불량/만성복통", "27. 소화불량만성복통_4조.docx", ["소화불량", "만성복통"])],
    },
    {
        "docId": "3",
        "title": "03. 토혈",
        "hankeutTitle": "토혈",
        "ccPdf": "cc03.pdf",
        "team4": [team4("hematemesis", "4조 토혈", "43. 토혈_4조.docx", ["토혈", "4조"])],
    },
    {
        "docId": "4",
        "title": "04. 혈변",
        "hankeutTitle": "혈변",
        "ccPdf": "cc04.pdf",
        "team4": [team4("hematochezia", "4조 혈변", "참고 대본/1.소화기/4.혈변.docx", ["혈변"])],
    },
    {
        "docId": "5",
        "title": "05. 구토",
        "hankeutTitle": "구토",
        "ccPdf": "cc05.pdf",
        "team4": [team4("vomiting", "4조 구토", "7. 구토_4조.docx", ["구토", "4조"])],
    },
    {
        "docId": "6",
        "title": "06-1. 배변 이상(변비)",
        "hankeutTitle": "배변 이상(변비)",
        "ccPdf": "cc06.pdf",
        "team4": [team4("constipation", "4조 배변이상(변비)", "20-1. 배변이상(변비)_4조.docx", ["배변이상", "변비", "4조"])],
    },
    {
        "docId": "6-2",
        "title": "06-2. 배변 이상(설사)",
        "hankeutTitle": "배변 이상(설사)",
        "ccPdf": "cc06.pdf",
        "team4": [team4("diarrhea", "4조 배변이상(설사)", "20-2. 배변이상(설사)_4조.docx", ["배변이상", "설사", "4조"])],
    },
    {
        "docId": "7",
        "title": "07. 황달",
        "hankeutTitle": "황달",
        "ccPdf": "cc07.pdf",
        "team4": [],
    },
    {
        "docId": "8",
        "title": "08. 가슴 통증",
        "hankeutTitle": "가슴 통증",
        "ccPdf": "cc08.pdf",
        "team4": [team4("chest_pain", "4조 가슴통증", "1. 가슴통증_4조.docx", ["가슴통증", "4조"])],
    },
    {
        "docId": "9",
        "title": "09. 실신",
        "hankeutTitle": "실신",
        "ccPdf": "cc09.pdf",
        "team4": [team4("syncope", "4조 실신", "30. 실신_4조.docx", ["실신", "4조"])],
    },
    {
        "docId": "10",
        "title": "10. 두근거림",
        "hankeutTitle": "두근거림",
        "ccPdf": "cc10.pdf",
        "team4": [team4("palpitation", "4조 두근거림", "13. 두근거림_4조.docx", ["두근거림", "4조"])],
    },
    {
        "docId": "11",
        "title": "11. 고혈압",
        "hankeutTitle": "고혈압",
        "sourcePdf": "circulation",
        "pdfPages": [23, 28],
        "team4": [team4("hypertension", "4조 고혈압", "5. 고혈압_4조.docx", ["고혈압", "4조"])],
    },
    {
        "docId": "12",
        "title": "12. 이상지질혈증",
        "hankeutTitle": "이상지질혈증",
        "sourcePdf": "circulation",
        "pdfPages": [29, 34],
        "team4": [team4("dyslipidemia", "4조 이상지질혈증", "37. 이상지질혈증_4조.docx", ["이상지질혈증", "4조"])],
    },
    {
        "docId": "13",
        "title": "13. 기침",
        "hankeutTitle": "기침",
        "ccPdf": "cc13.pdf",
        "team4": [team4("cough", "4조 기침", "11. 기침_4조.docx", ["기침", "4조"])],
    },
    {
        "docId": "14",
        "title": "14. 콧물 코막힘",
        "hankeutTitle": "콧물/코막힘",
        "ccPdf": "cc14.pdf",
        "team4": [team4("rhinorrhea_nasal_obstruction", "4조 콧물/코막힘", "42. 콧물, 코막힘_4조.docx", ["콧물", "코막힘"])],
    },
    {
        "docId": "15",
        "title": "15. 객혈",
        "hankeutTitle": "객혈",
        "ccPdf": "cc15.pdf",
        "team4": [team4("hemoptysis", "4조 객혈", "3. 객혈_4조.docx", ["객혈", "4조"])],
    },
    {
        "docId": "16",
        "title": "16. 호흡곤란",
        "hankeutTitle": "호흡곤란",
        "ccPdf": "cc16.pdf",
        "team4": [team4("dyspnea", "4조 호흡곤란", "참고 대본/3.호흡기/16.호흡곤란.docx", ["호흡곤란"])],
    },
    {
        "docId": "17",
        "title": "17-1. 소변량 변화 - 다뇨증",
        "hankeutTitle": "소변량 변화 - 다뇨증",
        "ccPdf": "cc17.pdf",
        "team4": [team4("urine_volume_change", "4조 소변량변화", "26. 소변량변화_4조.docx", ["소변량변화", "4조"])],
    },
    {
        "docId": "17-2",
        "title": "17-2. 소변량 변화 - 핍뇨",
        "hankeutTitle": "소변량 변화 - 핍뇨",
        "ccPdf": "cc17.pdf",
        "team4": [team4("urine_volume_change", "4조 소변량변화", "26. 소변량변화_4조.docx", ["소변량변화", "4조"])],
    },
    {
        "docId": "18",
        "title": "18. 붉은색 소변",
        "hankeutTitle": "붉은색 소변",
        "ccPdf": "cc18.pdf",
        "team4": [team4("red_urine", "4조 붉은색 소변", "23. 붉은색 소변_4조.docx", ["붉은색", "소변", "4조"])],
    },
    {
        "docId": "19",
        "title": "19-1. 배뇨 이상/소변찔끔증 - 배뇨 이상",
        "hankeutTitle": "배뇨 이상/소변찔끔증 - 배뇨 이상",
        "ccPdf": "cc19.pdf",
        "team4": [team4("voiding_dysfunction_incontinence", "4조 배뇨이상/소변찔끔증", "19. 배뇨이상, 소변찔끔증_4조.docx", ["배뇨이상", "소변찔끔증"])],
    },
    {
        "docId": "19-2",
        "title": "19-2. 배뇨 이상/소변찔끔증 - 소변찔끔증",
        "hankeutTitle": "배뇨 이상/소변찔끔증 - 소변찔끔증",
        "ccPdf": "cc19.pdf",
        "team4": [team4("voiding_dysfunction_incontinence", "4조 배뇨이상/소변찔끔증", "19. 배뇨이상, 소변찔끔증_4조.docx", ["배뇨이상", "소변찔끔증"])],
    },
    {
        "docId": "20",
        "title": "20. 발열",
        "hankeutTitle": "발열",
        "ccPdf": "cc20.pdf",
        "team4": [team4("fever", "4조 발열", "18. 발열_4조.docx", ["발열", "4조"])],
    },
    {
        "docId": "21",
        "title": "21. 쉽게 멍이 듦",
        "hankeutTitle": "쉽게 멍이 듦",
        "ccPdf": "cc21.pdf",
        "team4": [team4("easy_bruising", "4조 쉽게 멍이 듦", "29. 쉽게 멍이 듦_4조.docx", ["쉽게", "멍", "4조"])],
    },
    {
        "docId": "22",
        "title": "22. 피로",
        "hankeutTitle": "피로",
        "ccPdf": "cc22.pdf",
        "team4": [team4("fatigue", "4조 피로", "44. 피로_4조.docx", ["피로", "4조"])],
    },
    {
        "docId": "23",
        "title": "23. 체중 감소",
        "hankeutTitle": "체중 감소",
        "ccPdf": "cc23.pdf",
        "team4": [team4("weight_loss", "4조 체중감소", "40. 체중감소_4조.docx", ["체중감소", "4조"])],
    },
    {
        "docId": "24",
        "title": "24. 체중 증가 비만",
        "hankeutTitle": "체중 증가/비만",
        "ccPdf": "cc24.pdf",
        "team4": [team4("weight_gain_obesity", "4조 체중증가/비만", "41. 체중증가,비만_4조.docx", ["체중증가", "비만"])],
    },
    {
        "docId": "25",
        "title": "25. 관절 통증 부기",
        "hankeutTitle": "관절 통증/부기",
        "ccPdf": "cc25.pdf",
        "team4": [team4("joint_pain_swelling", "4조 관절통증", "6. 관절통증.docx", ["관절통증"])],
    },
    {
        "docId": "26",
        "title": "26. 목 허리 통증",
        "hankeutTitle": "목/허리 통증",
        "ccPdf": "cc26.pdf",
        "team4": [team4("neck_back_pain", "4조 목통증/허리통증", "16. 목통증,허리통증_4조.docx", ["목통증", "허리통증"])],
    },
    {
        "docId": "27",
        "title": "27. 피부 발진",
        "hankeutTitle": "피부 발진",
        "ccPdf": "cc27.pdf",
        "team4": [team4("skin_rash", "4조 피부 발진", "45. 피부 발진_4조.docx", ["피부", "발진", "4조"])],
    },
    {
        "docId": "28",
        "title": "28. 기분 저하 우울",
        "hankeutTitle": "기분 저하/우울",
        "ccPdf": "cc28.pdf",
        "team4": [team4("depressed_mood", "4조 기분 변화", "9. 기분 변화_4조.docx", ["기분", "변화", "4조"])],
    },
    {
        "docId": "29",
        "title": "29. 불안",
        "hankeutTitle": "불안",
        "ccPdf": "cc29.pdf",
        "team4": [team4("anxiety", "4조 불안", "22. 불안_4조.docx", ["불안", "4조"])],
    },
    {
        "docId": "30",
        "title": "30. 수면 장애",
        "hankeutTitle": "수면 장애",
        "ccPdf": "cc30.pdf",
        "team4": [team4("sleep_disorder", "4조 수면장애", "28. 수면장애_4조.docx", ["수면장애", "4조"])],
    },
    {
        "docId": "31",
        "title": "31. 기억력 저하 치매",
        "hankeutTitle": "기억력 저하/치매",
        "ccPdf": "cc31.pdf",
        "team4": [team4("memory_loss", "4조 기억력저하", "10. 기억력저하_4조.docx", ["기억력저하", "4조"])],
    },
    {
        "docId": "32",
        "title": "32. 어지럼증",
        "hankeutTitle": "어지럼증",
        "ccPdf": "cc32.pdf",
        "team4": [team4("dizziness", "4조 어지럼", "31. 어지럼_4조.docx", ["어지럼", "4조"])],
    },
    {
        "docId": "33",
        "title": "33. 두통",
        "hankeutTitle": "두통",
        "ccPdf": "cc33.pdf",
        "team4": [team4("headache", "4조 두통", "14. 두통_4조.docx", ["두통", "4조"])],
    },
    {
        "docId": "34",
        "title": "34. 경련",
        "hankeutTitle": "경련",
        "ccPdf": "cc34.pdf",
        "team4": [team4("seizure", "4조 경련", "4. 경련_4조.docx", ["경련", "4조"])],
    },
    {
        "docId": "35",
        "title": "35. 사지 무력 저림",
        "hankeutTitle": "사지 무력/저림",
        "ccPdf": "cc35.pdf",
        "team4": [team4("weakness_sensory_change", "4조 근력/감각이상", "8. 근력_감각이상_4조.docx", ["근력", "감각이상"])],
    },
    {
        "docId": "36",
        "title": "36. 의식 변화",
        "hankeutTitle": "의식 변화",
        "ccPdf": "cc36.pdf",
        "team4": [team4("altered_mental_status", "4조 의식장애", "36. 의식장애_4조.docx", ["의식장애", "4조"])],
    },
    {
        "docId": "37",
        "title": "37. 떨림",
        "hankeutTitle": "떨림/운동이상",
        "ccPdf": "cc37.pdf",
        "team4": [team4("tremor_movement_disorder", "4조 떨림/운동이상", "15. 떨림,운동이상.docx", ["떨림", "운동이상"])],
    },
    {
        "docId": "38",
        "title": "38. 유방 통증 멍울",
        "hankeutTitle": "유방통/유방덩이",
        "ccPdf": "cc38.pdf",
        "team4": [
            team4("breast_pain_mass", "4조 유방통/유방덩이", "34. 유방통,유방덩이_4조.docx", ["유방통", "유방덩이", "4조"])
        ],
    },
    {
        "docId": "39",
        "title": "39. 질분비물 질출혈",
        "hankeutTitle": "질분비물/질출혈",
        "ccPdf": "cc39.pdf",
        "team4": [
            team4("vaginal_discharge_bleeding", "4조 질분비물/질출혈", "39. 질분비물_질출혈.docx", ["질분비물", "질출혈"])
        ],
    },
    {
        "docId": "40",
        "title": "40. 월경 이상 월경통",
        "hankeutTitle": "월경 이상/월경통",
        "ccPdf": "cc40.pdf",
        "team4": [
            team4("amenorrhea", "4조 무월경/월경이상", "33-1. 월경이상(무월경)_4조.docx", ["월경이상", "무월경", "4조"]),
            team4("dysmenorrhea", "4조 월경통", "33-2. 월경통_4조.docx", ["월경통", "4조"]),
        ],
    },
    {
        "docId": "41",
        "title": "41. 산전 진찰",
        "hankeutTitle": "산전 진찰",
        "ccPdf": "cc41.pdf",
        "team4": [
            team4("prenatal_care", "4조 산전진찰", "24. 산전진찰_4조.docx", ["산전진찰", "4조"])
        ],
    },
    {
        "docId": "42",
        "title": "42. 성장 발달",
        "hankeutTitle": "성장/발달지연",
        "ccPdf": "cc42.pdf",
        "team4": [
            team4("growth_development_delay", "4조 성장/발달지연", "25. 성장,발달지연_4조.docx", ["성장", "발달지연", "4조"])
        ],
    },
    {
        "docId": "43",
        "title": "43. 예방접종",
        "hankeutTitle": "예방접종",
        "ccPdf": "cc43.pdf",
        "team4": [
            team4("immunization", "4조 예방접종", "32. 예방접종_4조.docx", ["예방접종", "4조"])
        ],
    },
    {
        "docId": "44",
        "title": "44. 음주 금연 상담",
        "hankeutTitle": "음주/금연 상담",
        "ccPdf": "cc44.pdf",
        "team4": [
            team4("alcohol_smoking_counseling", "4조 음주/금연 상담", "35. 음주 상담, 금연 상담_4조.docx", ["음주", "금연", "상담"])
        ],
    },
    {
        "docId": "45",
        "title": "45. 약물 오남용",
        "hankeutTitle": "약물 오남용",
        "ccPdf": "cc45.pdf",
        "team4": [
            team4("substance_abuse", "4조 물질오남용", "17. 물질오남용_4조.docx", ["물질오남용", "4조"])
        ],
    },
    {
        "docId": "46",
        "title": "46. 나쁜 소식 전달",
        "hankeutTitle": "나쁜 소식 전달",
        "ccPdf": "cc46.pdf",
        "team4": [
            team4("breaking_bad_news", "4조 나쁜 소식 전하기", "12. 나쁜 소식 전하기_4조.docx", ["나쁜", "소식", "전하기"])
        ],
    },
    {
        "docId": "47",
        "title": "47. 가정폭력 성폭력",
        "hankeutTitle": "가정폭력/성폭력",
        "ccPdf": "cc47.pdf",
        "team4": [
            team4("domestic_violence", "4조 가정폭력", "2-1. 가정폭력_4조.docx", ["가정폭력", "4조"]),
            team4("sexual_violence", "4조 성폭력", "2-2. 성폭력_4조.docx", ["성폭력", "4조"]),
        ],
    },
    {
        "docId": "48",
        "title": "48. 자살 사고 시도",
        "hankeutTitle": "자살 사고/시도",
        "ccPdf": "cc48.pdf",
        "team4": [
            team4("suicide", "4조 자살", "38. 자살_4조.docx", ["자살", "4조"])
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


def pdf_page_count(path: Path) -> int | None:
    try:
        result = run(["pdfinfo", str(path)])
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    for line in result.stdout.splitlines():
        if line.startswith("Pages:"):
            try:
                return int(line.split(":", 1)[1].strip())
            except ValueError:
                return None
    return None


def resolve_hankeut_source_pdf(default_source_pdf: Path, cc_pdf_root: Path, item: dict) -> Path:
    if item.get("ccPdf"):
        return cc_pdf_root / item["ccPdf"]
    source_pdf = item.get("sourcePdf")
    if source_pdf:
        return SYSTEM_PDFS.get(source_pdf, Path(source_pdf))
    return default_source_pdf


def render_hankeut_pdf_excerpt(source_pdf: Path, cc_pdf_root: Path, item: dict, output_root: Path) -> dict:
    doc_id = item["docId"]
    out_dir = output_root / "hankeut" / doc_id
    clean_dir(out_dir)
    source = resolve_hankeut_source_pdf(source_pdf, cc_pdf_root, item)
    if not source.exists():
        raise FileNotFoundError(source)
    pdf_path = out_dir / "excerpt.pdf"
    page_range = None
    if item.get("pdfPages"):
        start, end = item["pdfPages"]
        scratch = out_dir / "_pages"
        clean_dir(scratch)
        pattern = scratch / "page-%03d.pdf"
        run(["pdfseparate", "-f", str(start), "-l", str(end), str(source), str(pattern)])
        parts = []
        for pdf_page in range(start, end + 1):
            part = scratch / f"page-{pdf_page:03d}.pdf"
            if not part.exists():
                raise FileNotFoundError(f"Split PDF page missing: {part}")
            parts.append(part)
        run(["pdfunite", *(str(part) for part in parts), str(pdf_path)])
        shutil.rmtree(scratch)
        page_range = f"{start}-{end}"
    else:
        shutil.copy2(source, pdf_path)
        if item.get("ccPdf"):
            page_range = item["ccPdf"].removesuffix(".pdf").upper()

    page_count = pdf_page_count(pdf_path)

    result = {
        "title": item["hankeutTitle"],
        "source": str(source),
        "sourceFileTitle": source.name,
        "renderMode": "pdf-excerpt",
        "pdfPageRange": page_range,
        "pdf": rel(pdf_path),
        "pageCount": page_count,
    }
    if item.get("bookPages"):
        result["bookPageRange"] = f"{item['bookPages'][0]}-{item['bookPages'][1]}"
    return result


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
        html = render_quicklook_html(source_docx, out_dir)
        rendered.append(
            {
                "key": spec["key"],
                "label": spec["label"],
                "source": str(source_docx),
                "sourceFileTitle": source_docx.name,
                "renderMode": "quicklook-html",
                "html": rel(html),
            }
        )
    return rendered


def build(args: argparse.Namespace) -> dict:
    source_pdf = args.source_pdf.expanduser().resolve()
    cc_pdf_root = args.cc_pdf_root.expanduser().resolve()
    team4_root = args.team4_root.expanduser().resolve()
    output_root = args.output_root.expanduser().resolve()
    manifest_path = args.manifest.expanduser().resolve()

    needs_default_source_pdf = any(not item.get("ccPdf") and not item.get("sourcePdf") for item in REFERENCE_ITEMS)
    if needs_default_source_pdf and not source_pdf.exists():
        raise FileNotFoundError(source_pdf)
    if not cc_pdf_root.exists():
        raise FileNotFoundError(cc_pdf_root)
    if not team4_root.exists():
        raise FileNotFoundError(team4_root)

    clean_dir(output_root)
    items = {}
    for item in REFERENCE_ITEMS:
        hankeut = None if args.skip_hankeut else render_hankeut_pdf_excerpt(source_pdf, cc_pdf_root, item, output_root)
        team4 = [] if args.skip_team4 else render_team4_sources(team4_root, item, output_root)
        items[item["docId"]] = {
            "docId": item["docId"],
            "title": item["title"],
            "hankeut": hankeut,
            "team4": team4,
        }

    manifest = {
        "version": "cpx-reference-assets.v2.all-cc-source-preserved",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "notes": {
            "hankeut": "한끝 PDF는 CC별 PDF 발췌본을 iframe PDF 뷰어로 표시해 원본 모양을 보존한다.",
            "team4": "4조 Word 파일은 Quick Look HTML을 사용해 표, 색, 첨부 이미지를 보존한다. Word PDF export는 안정성 확인 전까지 보조 경로로 둔다.",
            "scope": "공통/합본 대본은 제외하고 CC별 개별 자료만 연결한다.",
        },
        "items": items,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Build CC-specific reference assets for the CPX editor.")
    parser.add_argument("--source-pdf", type=Path, default=DEFAULT_SOURCE_PDF)
    parser.add_argument("--cc-pdf-root", type=Path, default=DEFAULT_CC_PDF_ROOT)
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
