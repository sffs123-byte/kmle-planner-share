#!/usr/bin/env python3
"""Generate the OB/GYN post-test deck with the reusable Anki quiz builder."""

from __future__ import annotations

import html
import json
import re
from pathlib import Path

from anki_quiz_builder import QuizBuilder


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "obgyn_posttest_2026_cards.json"
OUT_PATH = ROOT / "obgyn_posttest_anki.html"


def answer_to_html(text: str) -> str:
    escaped = html.escape(text.strip())
    return (
        '<pre class="source-answer" '
        'style="white-space:pre-wrap;line-height:1.72;font-family:inherit;'
        'font-size:15px;margin:0;">'
        f"{escaped}</pre>"
    )


def guide_html(card: dict) -> str:
    tags = " ".join(card.get("tags", [])) or "태그 없음"
    return f"""
<div style="line-height:1.75">
  <h4>카드 정보</h4>
  <p><b>태그:</b> {html.escape(tags)}</p>
  <h4>알렌 기준 보정 작업</h4>
  <p>정답 영역의 ✏️ 버튼으로 원문 답안을 수정하고 저장하면 브라우저에 유지됩니다.
  나중에 확정본은 이 JSON/생성 스크립트에도 반영해 소스 기준 답안으로 올립니다.</p>
</div>
""".strip()


def load_cards() -> list[dict]:
    raw_cards = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    cards = []
    for item in raw_cards:
        num = item["number"]
        question = re.sub(r"^\d+\.\s*", "", item["question"]).strip()
        cards.append(
            {
                "id": f"obgyn_post_{num:02d}",
                "num": num,
                "q": html.escape(question),
                "a": answer_to_html(item["answerOriginal"]),
                "g": guide_html(item),
            }
        )
    return cards


def main() -> None:
    cards = load_cards()
    builder = QuizBuilder(
        cards=cards,
        title="산부인과 Post-test 49문항",
        storage_prefix="obgyn_posttest_2026",
        enable_self_answer=True,
        randomize_review=True,
    )
    builder.write(str(OUT_PATH))


if __name__ == "__main__":
    main()
