#!/usr/bin/env python3
"""Regenerate the deployed urology post-test Anki deck from its JSON source."""

from __future__ import annotations

import json
import sys
from pathlib import Path

QUIZ_DIR = Path(__file__).resolve().parent
VENDOR_DIR = QUIZ_DIR / "vendor"
sys.path.insert(0, str(VENDOR_DIR))
from anki_quiz_builder_urology import QuizBuilder  # noqa: E402


DATA = QUIZ_DIR / "data" / "urology_posttest_20260703_cards.json"
OUT = QUIZ_DIR / "urology_posttest_anki.html"
TITLE = "비뇨의학과 포테 최신 기출 Anki"
STORAGE_PREFIX = "urology_posttest_20260703"

DECK_HEAD = """
<link rel="icon" href="data:,">
<style id="urology-posttest-theme">
.urology-front h3{margin:10px 0 12px;color:#cdd6f4;font-size:1.18rem}
.urology-front p{margin:7px 0;line-height:1.65}.urology-front .subq{padding-left:8px;border-left:3px solid #89b4fa}
.deck-chip{display:inline-block;padding:3px 8px;margin-right:4px;border-radius:999px;background:#313244;color:#89b4fa;font-size:.76rem;font-weight:700}
.urology-answer h3{color:#1e66f5;margin-bottom:12px}.urology-answer p,.urology-answer li{line-height:1.6}
.urology-answer ul{padding-left:22px;margin:8px 0}.lock-line{margin-top:16px;padding:13px 15px;border-left:5px solid #df8e1d;background:#fff4d6;border-radius:8px;color:#5c3a00}
.urology-guide{padding:4px}.urology-guide h4{color:#89b4fa}.urology-guide p{line-height:1.55;margin:8px 0}
@media(max-width:640px){.urology-front h3{font-size:1.06rem}.urology-answer{font-size:.95rem}}
</style>
""".strip()


def main() -> None:
    cards = json.loads(DATA.read_text(encoding="utf-8"))
    if len(cards) != 15:
        raise ValueError(f"expected 15 cards, got {len(cards)}")
    builder = QuizBuilder(
        cards=cards,
        title=TITLE,
        subtitle="2026-07-03 최신 5조 · 15개 채점번호 · 서술형 백지회상",
        storage_prefix=STORAGE_PREFIX,
        enable_self_answer=True,
        randomize_review=False,
        enable_rail=True,
        rail_mode="basic",
        rail_strict=True,
    )
    document = builder.build().replace("</head>", DECK_HEAD + "\n</head>", 1)
    document = "\n".join(line.rstrip() for line in document.splitlines()) + "\n"
    OUT.write_text(document, encoding="utf-8")
    print(f"generated {OUT} ({len(cards)} cards)")


if __name__ == "__main__":
    main()
