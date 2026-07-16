#!/usr/bin/env python3
"""Build the frequency-ranked 2026 urology post-test COMPACT Anki deck."""

from __future__ import annotations

import html
import json
import sys
from pathlib import Path


QUIZ_DIR = Path(__file__).resolve().parent
VENDOR_DIR = QUIZ_DIR / "vendor"
sys.path.insert(0, str(VENDOR_DIR))
from anki_quiz_builder_urology import QuizBuilder, run_rails  # noqa: E402


DATA = QUIZ_DIR / "data" / "urology_posttest_compact_20260709.json"
OUT = QUIZ_DIR / "urology_posttest_anki.html"
TITLE = "비뇨의학과 포테 COMPACT Anki"
# Keep the original prefix so ratings/drawings survive this deck update.
STORAGE_PREFIX = "urology_posttest_20260703"
PAGES_12_VIDEO_IDS = (
    "URO-VIDEO-20260716-P1-01-OUTPATIENT-TESTS",
    "URO-VIDEO-20260716-P1-02-SURGICAL-POSITIONS",
    "URO-VIDEO-20260716-P1-03-RAPN",
    "URO-VIDEO-20260716-P2-04-OAB",
    "URO-VIDEO-20260716-P2-05-PSA-BIOPSY",
    "URO-VIDEO-20260716-P2-06-OBSTRUCTIVE-PYELO",
)
PAGES_45_VIDEO_IDS = (
    "URO-VIDEO-20260716-P4-09-RCC",
    "URO-VIDEO-20260716-P4-10-NMIBC",
    "URO-VIDEO-20260716-P45-11-PROSTATE-STAGE",
    "URO-VIDEO-20260716-P5-12-UROTRAUMA",
    "URO-VIDEO-20260716-P5-13-EMERGENCIES",
)
PAGE_3_VIDEO_IDS = (
    "URO-VIDEO-20260716-P3-06-DRAINAGE-METABOLIC",
    "URO-VIDEO-20260716-P3-07-STONE-CASES",
    "URO-VIDEO-20260716-P3-08-BPH",
)


def render_cards(rows: list[dict]) -> list[dict]:
    cards: list[dict] = []
    for row in rows:
        recent_yama = ""
        if row.get("recent_yama"):
            recent_yama = (
                "<span class='deck-chip recent-yama'>"
                f"{html.escape(row['recent_yama'])}</span>"
            )
        rotation_yama = ""
        if row.get("rotation_yama"):
            rotation_yama = (
                "<span class='deck-chip rotation-yama'>"
                f"{html.escape(row['rotation_yama'])}</span>"
            )
        prompt = "".join(
            f"<p class='subq'>{index}. {html.escape(text)}</p>"
            for index, text in enumerate(row["prompt"], 1)
        )
        sections = []
        for section in row["sections"]:
            items = "".join(f"<li>{html.escape(item)}</li>" for item in section["items"])
            sections.append(
                f"<h4>{html.escape(section['heading'])}</h4><ul>{items}</ul>"
            )
        correction = ""
        if row.get("correction"):
            correction = (
                "<div class='current-correction'><strong>현행 교정</strong><br>"
                f"{html.escape(row['correction'])}</div>"
            )
        front = (
            "<div class='urology-front'><div>"
            f"<span class='deck-chip tier-{row['tier'].lower()}'>{html.escape(row['tier'])}급</span>"
            f"<span class='deck-chip'>{html.escape(row['frequency'])}</span>"
            f"{recent_yama}"
            f"{rotation_yama}"
            "</div>"
            f"<h3>{row['num']}. {html.escape(row['title'])}</h3>{prompt}</div>"
        )
        answer = (
            "<section class='urology-answer'>"
            "<h3>핵심 정답</h3>"
            + "".join(sections)
            + correction
            + "<div class='lock-line'><strong>3초 잠금문장</strong><br>"
            + html.escape(row["lock"])
            + "</div></section>"
        )
        source_note = row.get(
            "source_note",
            "원문은 2026 기출 24개 조의 출제 빈도 분석을 압축한 자료입니다. "
            "‘현행 교정’ 표시는 원문 암기축과 실제 임상 원칙이 충돌할 수 있는 지점입니다.",
        )
        guide = (
            "<section class='urology-guide'><h4>출처와 공부법</h4>"
            f"<p><strong>비뇨의학과 포테 COMPACT · {html.escape(row['tier'])}급 · {html.escape(row['frequency'])}</strong></p>"
            "<p>앞면의 번호만 먼저 적고 답을 공개하세요. S급부터 회전하고, A급 다음 B급, C급 순서로 내려갑니다.</p>"
            f"<p>{html.escape(source_note)}</p>"
            "</section>"
        )
        cards.append(
            {
                "id": row["id"],
                "num": row["num"],
                "title": row["title"],
                "tier": row["tier"],
                "frequency": row["frequency"],
                "q": front,
                "a": answer,
                "g": guide,
            }
        )
    return cards


def add_theme(document: str) -> str:
    theme = r"""
<link rel="icon" href="data:,">
<style id="urology-posttest-theme">
.urology-front h3{margin:10px 0 12px;color:#cdd6f4;font-size:1.18rem}
.urology-front p{margin:7px 0;line-height:1.65}.urology-front .subq{padding-left:8px;border-left:3px solid #89b4fa}
.deck-chip{display:inline-block;padding:3px 8px;margin-right:5px;border-radius:999px;background:#313244;color:#89b4fa;font-size:.76rem;font-weight:800}
.deck-chip.tier-s{background:#f38ba8;color:#11111b}.deck-chip.tier-a{background:#fab387;color:#11111b}.deck-chip.tier-b{background:#f9e2af;color:#11111b}.deck-chip.tier-c{background:#a6e3a1;color:#11111b}
.deck-chip.recent-yama{background:#cba6f7;color:#11111b;box-shadow:0 0 0 1px rgba(203,166,247,.35)}
.deck-chip.rotation-yama{background:#89dceb;color:#11111b;box-shadow:0 0 0 1px rgba(137,220,235,.35)}
.urology-answer h3{color:#1e66f5;margin-bottom:12px}.urology-answer h4{color:#5c6ac4;margin:14px 0 5px}.urology-answer p,.urology-answer li{line-height:1.58}
.urology-answer ul{padding-left:22px;margin:5px 0}.lock-line{margin-top:16px;padding:13px 15px;border-left:5px solid #df8e1d;background:#fff4d6;border-radius:8px;color:#5c3a00}
.current-correction{margin-top:14px;padding:12px 14px;border-left:5px solid #d20f39;background:#ffe8ec;border-radius:8px;color:#5c1725;line-height:1.55}
.urology-guide{padding:4px}.urology-guide h4{color:#89b4fa}.urology-guide p{line-height:1.55;margin:8px 0}
.page3-video-btn{background:linear-gradient(135deg,#f9e2af,#fab387)!important;color:#11111b!important;font-weight:900!important}
.latest-video-btn{background:linear-gradient(135deg,#cba6f7,#89b4fa)!important;color:#11111b!important;font-weight:900!important}
.pages12-video-btn{background:linear-gradient(135deg,#89dceb,#a6e3a1)!important;color:#11111b!important;font-weight:900!important}
.all-video-random-btn{background:linear-gradient(135deg,#a6e3a1,#89dceb,#cba6f7)!important;color:#11111b!important;font-weight:950!important;box-shadow:0 0 0 2px rgba(166,227,161,.28)!important}
.latest-video-sidebar{margin-bottom:8px!important}
@media(max-width:640px){.urology-front h3{font-size:1.06rem}.urology-answer{font-size:.95rem}}
</style>
""".strip()
    return document.replace("</head>", theme + "\n</head>", 1)


def add_latest_video_shortcut(document: str) -> str:
    hero_marker = '<button class="review-hero-btn" id="btnReviewHero"'
    hero_buttons = (
        '<button class="review-hero-btn all-video-random-btn" id="btnAllVideoRandomHero" '
        'onclick="startAllVideoPagesRandomReview()">🔀 1~5p 통합 랜덤 14문항</button>\n        '
        '<button class="review-hero-btn page3-video-btn" id="btnPage3VideoHero" '
        'onclick="startPage3VideoReview()">📄 3p 신규 3문항</button>\n        '
        '<button class="review-hero-btn latest-video-btn" id="btnLatestVideoHero" '
        'onclick="startLatestVideoReview()">📄 4·5p 신규 5문항</button>\n        '
        '<button class="review-hero-btn pages12-video-btn" id="btnPages12VideoHero" '
        'onclick="startPages12VideoReview()">📄 1·2p 신규 6문항</button>\n        '
    )
    if hero_marker not in document:
        raise ValueError("review hero marker missing")
    document = document.replace(hero_marker, hero_buttons + hero_marker, 1)

    sidebar_marker = '<div class="sb-quiz-btns">'
    sidebar_buttons = (
        '\n            <button class="btn-review all-video-random-btn latest-video-sidebar" '
        'id="btnAllVideoRandomSidebar" onclick="startAllVideoPagesRandomReview()">🔀 1~5p 통합 랜덤 14문항</button>'
        '\n            <button class="btn-review page3-video-btn latest-video-sidebar" '
        'id="btnPage3VideoSidebar" onclick="startPage3VideoReview()">📄 3p 신규 3문항</button>'
        '\n            <button class="btn-review latest-video-btn latest-video-sidebar" '
        'id="btnLatestVideoSidebar" onclick="startLatestVideoReview()">📄 4·5p 신규 5문항</button>'
        '\n            <button class="btn-review pages12-video-btn latest-video-sidebar" '
        'id="btnPages12VideoSidebar" onclick="startPages12VideoReview()">📄 1·2p 신규 6문항</button>'
    )
    if sidebar_marker not in document:
        raise ValueError("sidebar quiz button marker missing")
    document = document.replace(sidebar_marker, sidebar_marker + sidebar_buttons, 1)

    latest_js = (
        "\nconst PAGES_12_VIDEO_IDS = "
        + json.dumps(PAGES_12_VIDEO_IDS, ensure_ascii=False)
        + ";\nconst PAGES_45_VIDEO_IDS = "
        + json.dumps(PAGES_45_VIDEO_IDS, ensure_ascii=False)
        + ";\nconst PAGE_3_VIDEO_IDS = "
        + json.dumps(PAGE_3_VIDEO_IDS, ensure_ascii=False)
        + ";\nconst VIDEO_PAGES_1_TO_5_IDS = [\n"
        + "    ...PAGES_12_VIDEO_IDS,\n"
        + "    ...PAGE_3_VIDEO_IDS,\n"
        + "    ...PAGES_45_VIDEO_IDS,\n"
        + "];\nfunction startAllVideoPagesRandomReview() {\n"
        + "    startQuizWith(shuffledCopy(VIDEO_PAGES_1_TO_5_IDS));\n}\n"
        + "function startLatestVideoReview() {\n"
        + "    startQuizWith([...PAGES_45_VIDEO_IDS]);\n}\n"
        + "function startPages12VideoReview() {\n"
        + "    startQuizWith([...PAGES_12_VIDEO_IDS]);\n}\n"
        + "function startPage3VideoReview() {\n"
        + "    startQuizWith([...PAGE_3_VIDEO_IDS]);\n}\n"
    )
    script_end = document.rfind("</script>")
    if script_end < 0:
        raise ValueError("script closing tag missing")
    return document[:script_end] + latest_js + document[script_end:]


def main() -> None:
    rows = json.loads(DATA.read_text(encoding="utf-8"))
    if len(rows) != 40:
        raise ValueError(f"expected 26 existing topics plus 14 video-recall topics, got {len(rows)}")
    if [row["num"] for row in rows] != list(range(1, 41)):
        raise ValueError("topic numbers must be exactly 1..40")
    cards = render_cards(rows)
    report = run_rails(cards, mode="basic", strict=True)
    report.print_report()
    if report.has_errors:
        raise SystemExit("independent rail failed")
    builder = QuizBuilder(
        cards=cards,
        title=TITLE,
        subtitle="기존 COMPACT 26문항 + 7/16 영상복기 1·2페이지 6문항 + 3페이지 신규 3문항 + 4·5페이지 신규 5문항 · S/A/B/C 야마 빈도순 · 서술형 백지회상",
        storage_prefix=STORAGE_PREFIX,
        enable_self_answer=True,
        randomize_review=False,
        enable_rail=True,
        rail_mode="basic",
        rail_strict=True,
    )
    document = add_latest_video_shortcut(add_theme(builder.build()))
    OUT.write_text("\n".join(line.rstrip() for line in document.splitlines()) + "\n", encoding="utf-8")
    print(f"generated {OUT} ({len(cards)} cards, storage={STORAGE_PREFIX})")


if __name__ == "__main__":
    main()
