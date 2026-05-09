#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKET_DIR = ROOT / 'data' / 'clerkships' / 'packets' / 'pediatrics'
SOURCE_DB = PACKET_DIR / '2026-05-10_division_b_source_db_v1.json'
CLEAN_SLOTS = PACKET_DIR / '2026-05-10_division_b_clean_slots_v2.json'
OUT = PACKET_DIR / '2026-05-10_week1_b_sentence_analysis_v1.json'

SESSION_TO_SLOT = {
    'peds-w1-mon-pretest-ot': 'b_mon_0820_pretest_then_ot',
    'peds-w1-mon-hemonc-am': 'b_mon_am_hemonc_meeting_round',
    'peds-w1-mon-hemonc-briefing': 'b_mon_pm_hemonc_briefing',
    'peds-w1-tue-nicu-ot': 'b_tue_am_nicu_ot',
    'peds-w1-tue-nicu-outpatient': 'b_tue_pm_kang_outpatient_nicu',
    'peds-w1-wed-conference-csec-nicu': 'b_wed_0820_conference_then_nicu',
    'peds-w1-wed-nbs-pomr': 'b_wed_pm_nbs_pomr',
    'peds-w1-thu-infection-outpatient': 'b_thu_0820_conference_then_infection',
    'peds-w1-thu-hemonc-pomr': 'b_thu_pm_hemonc_outpatient_pomr',
    'peds-w1-fri-common-portfolio': 'b_fri_common_floating',
}

SESSION_OVERRIDES = {
    'peds-w1-mon-pretest-ot': {
        '핵심 정리': [
            '프테/OT 직후 B분과 혈종으로 넘어가는 연결부다. 핵심은 시험 직후 바로 사라지지 않고 병원학교/스테이션 진행 여부를 직접 확인하는 것.',
            '최신 인계상 OT가 9:20까지 늦어져도 병원학교 회의가 아직 남아 있거나 밖에서 기다리라는 지시가 있을 수 있다.',
            '프테는 점수 축이고, OT 이후 혈종 케이스 배정은 월 오후 환자상태보고와 목요일 POMR로 이어진다.',
        ],
        '확인 필요': ['OT 종료 직후: 병원학교 회의 진행 여부, 임연정 교수님/스테이션 이동 위치, 월 오후 보고 시간.'],
    },
    'peds-w1-mon-hemonc-am': {
        '핵심 정리': [
            '월 오전 혈종은 단순 참관이 아니라 월 오후 환자상태보고와 목요일 약식 POMR의 재료를 받는 시간이다.',
            '동선은 병원학교 다학제회의 → 스테이션/병동 EMR 설명 → 회진 → 의국 EMR 강의/케이스 배정으로 변동 가능하다.',
            '교수님 설명은 약어와 치료 단계가 많으므로 녹음/필기 우선. 특히 배정 환자의 진단명, 현재 치료단계, 특이 처방을 잡아야 한다.',
        ],
        '확인 필요': ['다학제회의 유무', '소아 혈종 스테이션/병원학교 시작 위치', '오후 환자상태보고 시간과 장소', '목요일 POMR 피드백 여부.'],
    },
    'peds-w1-mon-hemonc-briefing': {
        '핵심 정리': [
            '브리핑은 PI 발표가 아니라 전공의가 교수님께 노티하듯 현재 상태를 짧게 전달하는 형식이다.',
            'A4 반쪽 이내, 현재 치료/입원 중 변화, 중요한 동반증상·과거력·가족력·검사만 남기는 것이 안전하다.',
            '조원끼리 질문을 요구받을 수 있으므로 서로 대본을 미리 공유하고 질문 1개씩 준비한다. 교수님께 드릴 질문도 1개 준비한다.',
            '질문이 깊어지면 즉석 과제가 생길 수 있으므로 최신 guideline/논문 기반 질문은 좋지만 제출 부담 가능성도 같이 고려한다.',
        ],
        '확인 필요': ['보고 시간: 14:00/15:30/16:00 등 변동', '장소: 의국 또는 외래 7번방', '추가 조사 과제 발생 여부.'],
    },
    'peds-w1-tue-nicu-ot': {
        '핵심 정리': [
            '화 오전 NICU는 신생아 분과 과제 4종이 한 번에 생성되는 시간이다: 자필 자기소개서, 자습레포트, NBS, 신생아 POMR.',
            '입장 루틴은 신발/크록스 → 사물함 → 일회용 가운 → 손씻기 → 명부 → PK 책상이다. 크록스와 노트북/충전기를 챙긴다.',
            'OT 중 EMR 환자 설명, POMR 환아 배정, 레포트 주제 뽑기, 질문이 동시에 나올 수 있다. 과제 제출 메뉴까지 확인해야 한다.',
            '교수님 질문은 신생아소생술 초기평가, ETT 위치, UAC/UVC, 만삭아/저체중아 기준, RDS CXR 등으로 연결된다.',
        ],
        '확인 필요': ['신지혜 교수님 OT 시작 시간', 'POMR 환아 배정 여부', '자기소개서 제출 타이밍', 'NBS/NICU 과제 제출 메뉴.'],
    },
    'peds-w1-tue-nicu-outpatient': {
        '핵심 정리': [
            '화 오후는 강미현 교수님 외래를 2명씩 교대하고, 나머지는 NICU 대기를 유지하는 구조다.',
            '핵심 리스크는 NICU를 4명이 동시에 비우는 것. 신지혜 교수님이 이 부분을 민감하게 볼 수 있다는 인계가 반복된다.',
            '외래에서는 질문이 많지 않지만 끝날 때 “궁금한 것”을 물을 수 있으므로 1~2개 가벼운 질문을 준비한다.',
            '외래 후 NICU 대기 중 처치/회진/심초음파 등을 볼 수 있으므로 방해 안 되는 선에서 적극 관찰한다.',
        ],
        '확인 필요': ['강미현 교수님 외래 시작 시간', '2명씩 교대 순서', '장미영 교수님 회진 유무', '퇴근 가능 시점.'],
    },
    'peds-w1-wed-conference-csec-nicu': {
        '핵심 정리': [
            '수 오전은 집담회 후 C-sec 참관 여부가 핵심 변동점이다. 수술이 있으면 바로 수술실, 없으면 NICU 대기/자습.',
            'C-sec 참관은 scrub이 아니라 멀리서 초기 처치를 보는 방식. 헤어캡/수술마스크/신발커버/출입카드가 필요하다.',
            '아기 나오면 Apgar/초기 처치 관찰 후 인큐베이터 이동에 맞춰 NICU로 따라간다.',
            'NBS는 먼저 해버리기보다 교수님 타이밍을 확인하는 쪽이 안전하다. 이미 했더라도 다시 하라고 하면 다시 하는 것이 낫다.',
        ],
        '확인 필요': ['C-sec 시간/수술실 위치', '출입카드', '자기소개서 제출 타이밍', 'NBS 시행 지시 여부.'],
    },
    'peds-w1-wed-nbs-pomr': {
        '핵심 정리': [
            '수 오후는 NBS, POMR 환아 진찰, NICU 자유 관찰을 마무리하는 시간이다.',
            'NBS는 교수님 지시가 오면 수행하고, 한 명이 기록하고 나머지가 손씻고 직접 진찰하는 방식이 실전성이 좋다는 인계가 있다.',
            'POMR 아기는 직접 진찰해야 하며 교수님이 왜 진찰 안 하냐고 보는 경우가 있다. 로그 서명도 가능하면 미리 확보한다.',
            '장미영 교수님 회진이 있으면 RDS/TTN/PPHN/surfactant/RDS CXR 등 입원 환자 기반 질문이 나올 수 있다.',
        ],
        '확인 필요': ['NBS 시행 대상/시간', 'POMR 환아 진찰 가능 범위', '진료환자로그 서명', '장미영 교수님 회진 유무.'],
    },
    'peds-w1-thu-infection-outpatient': {
        '핵심 정리': [
            '목 오전 감염은 실제 외래 환자가 적으면 발열 소아 모의 CPX/mini-CEX 수업으로 진행된다.',
            '장소는 공식표 3번방과 최신 인계 5번방이 충돌하므로 집담회 직후 교수님께 직접 확인해야 한다.',
            '교수님은 보호자 역할을 하며 병력청취 → SOAP/Problem list → Assessment → Plan 흐름을 중시한다.',
            '어린 영아 발열은 출생 주수, 몸무게, 분만 방법, 경련 여부를 묻는 것이 중요하다.',
            '초진 환자가 있으면 예진을 시키려는 뉘앙스가 있으므로 예진기록지 준비는 해두는 편이 좋다.',
        ],
        '확인 필요': ['외래 방 번호', '실제 환자/모의 CPX 여부', '감염 자유기록/발열 과제 제출 여부.'],
    },
    'peds-w1-thu-hemonc-pomr': {
        '핵심 정리': [
            '목 오후 혈종은 1주차 B분과 최고강도 slot이다. 외래 후 POMR 피드백 또는 노티 구두 발표가 이어진다.',
            'POMR은 종이/iPad 모두 가능하지만 교수님이 읽거나, 학생이 5~6문장 노티로 말하거나, 둘 다 하는 변동이 있다.',
            '날짜는 연도까지 명확히, 수치는 정확한 숫자로, 성장 백분위수 포함, Problem list와 Assessment 분리를 지켜야 한다.',
            '줄임말 의학용어는 풀어서 말하고, 현재 시점 기준으로 레지던트 노티처럼 짧고 깔끔하게 말한다.',
            '조원 질문을 요구받으므로 서로 POMR/대본을 미리 읽고 질문을 준비한다. 특이 진단명/치료 단계는 반드시 확인한다.',
        ],
        '확인 필요': ['2시 외래 장소/7번방 위치', 'POMR 출력 필요 여부', '구두 노티 여부', '피드백 후 U-Folio 제출 메뉴.'],
    },
    'peds-w1-fri-common-portfolio': {
        '핵심 정리': [
            '금요일은 고정 강의보다 제출/대기/변동 대응 day다. 공식상 신생아소생술/아나필락시스/보충학습이 얽히며 실제로는 대체·취소가 잦다.',
            '주간 포트폴리오와 B분과 과제 제출 누락을 막는 것이 가장 중요하다. 금요일 17시를 hard deadline으로 둔다.',
            '일정이 없어도 교수님이 갑자기 부를 수 있으므로 멀리 가지 말라는 인계가 있다.',
            '아나필락시스/네뷸라이저/흡입제/에피네프린 실습 내용은 A분과 호흡기 자유기록에도 재사용 가능하다.',
        ],
        '확인 필요': ['당일 공통강의 유무', '신생아소생술/아나필락시스 진행 여부', 'B분과 과제별 제출 완료 상태', '주간 포트폴리오 17:00.'],
    },
}


def normalize_text(text: str) -> str:
    text = re.sub(r'^#+\s*\[[^\]]+\]\s*', '', text.strip())
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def split_source_sentences(raw: str) -> list[str]:
    raw = raw.replace('\r', '\n')
    raw = raw.replace('<br>', '\n')
    raw = raw.replace(' / ', '\n')
    chunks = []
    for line in raw.splitlines():
        line = normalize_text(line)
        if not line or line in {'| --- |', '---'}:
            continue
        line = re.sub(r'^[-•]\s*', '', line).strip()
        if not line or line.startswith('[2025') or line.startswith('[2026') or line.startswith('------------------------------------------------------------------------------------------------'):
            chunks.append(line) if line.startswith('[202') else None
            continue
        # Keep table rows as one sentence because splitting pipes destroys meaning.
        if line.startswith('|'):
            chunks.append(line.strip())
            continue
        parts = re.split(r'(?<=[.!?。])\s+|(?<=다\.)\s+|(?<=음\.)\s+', line)
        for part in parts:
            part = normalize_text(part)
            if part:
                chunks.append(part)
    # de-duplicate exact repeated fragments while preserving order per block
    seen = set(); out=[]
    for c in chunks:
        key=c
        if key in seen:
            continue
        seen.add(key); out.append(c)
    return out


def interpret(text: str, slot_id: str) -> str:
    t = text.lower()
    if '프테' in text or 'pretest' in t:
        return '시험 직후 일정 전환 정보다. 프테 종료 후 바로 분과 이동/OT/병원학교 확인으로 이어진다.'
    if 'ot' in t or '오티' in text:
        return '초기 안내에서 과제·동선·제출 메뉴가 결정될 수 있으므로 시간/장소/과제를 즉시 메모해야 한다.'
    if '병원학교' in text or '다학제' in text:
        return '혈종 병동 환자 흐름을 미리 보는 참관이다. 끝났다고 단정하지 말고 진행 여부를 직접 확인한다.'
    if '슬리퍼' in text or '크록스' in text or '신발' in text or '가운' in text or '명부' in text or '사물함' in text:
        return '입장/감염관리 동선이다. 개인 크록스, 가운, 명부, 손씻기 같은 실무 준비물로 반영한다.'
    if '녹음' in text or '필기' in text:
        return '나중에 환자상태보고/POMR을 살리는 핵심 정보다. 가능한 범위에서 녹음/필기 우선.'
    if 'emr' in t or '차트' in text:
        return '배정 환자와 병동 환자 이해를 위한 source다. 진단명, 치료단계, 처방, 검사 수치를 구조화해서 기록한다.'
    if '회진' in text:
        return '현장 태도와 환자 파악 평가에 연결된다. 짐은 방해되지 않게 두고 가까이 따라가며 핵심 변화만 잡는다.'
    if '케이스 배정' in text or '환자 케이스' in text or 'pomr 환자' in text or 'pommr' in t:
        return '이 환자가 환자상태보고/POMR/예진기록지의 중심 재료가 된다. 담당 환자 정보를 즉시 고정한다.'
    if '환자상태' in text or '보고' in text or '브리핑' in text or '노티' in text:
        return '발표/평가 연결 지점이다. 현재 시점 기준, 짧은 노티형, 중요한 치료·변화 중심으로 준비한다.'
    if '질문' in text:
        return '교수님/조원 질문 대비 포인트다. 질문 1개를 미리 만들고, 대답 못해도 태도/참여가 중요하다.'
    if '과제' in text or '유폴리오' in text or '업로드' in text or '제출' in text or '자유기록' in text or '예진기록지' in text:
        return '제출 리스크다. 메뉴명, 담당 교수님, 마감, 첨부 형식을 체크리스트에 넣어 누락을 막는다.'
    if 'nbs' in t or 'new ballard' in t:
        return '신생아 과제/술기 경험이다. 교수님 지시 타이밍을 우선하고, 기록자와 진찰자를 나눠 수행한다.'
    if 'c-sec' in t or 'c/s' in t or '수술실' in text or '수술복' in text or '아프가' in text or 'apgar' in t:
        return 'C-sec 참관 동선이다. 출입카드/수술복/헤어캡/마스크/신발커버를 준비하고 초기 처치 관찰 후 NICU로 따라간다.'
    if '외래' in text:
        return '외래 참관/예진 후보 정보다. 방 번호와 시작 시간을 당일 확인하고, 2명 교대/질문 준비/예진 가능성을 반영한다.'
    if '발열' in text or 'cpx' in t or 'mini cex' in t or 'assessment' in t or 'plan' in t or 'soap' in t:
        return '감염 외래의 핵심 학습축이다. CPX식 병력청취와 SOAP→Assessment→Plan 흐름으로 정리한다.'
    if '장미영' in text or 'rds' in t or 'ttn' in t or 'pphn' in t or 'surfactant' in t:
        return '장미영 교수님/NICU 질문 대비다. 입원 환자 기반 질문이므로 EMR과 RDS·TTN·PPHN·surfactant를 짧게 준비한다.'
    if '퇴근' in text or '대기' in text or '자습' in text or '멀리' in text:
        return '시간 운용 정보다. 비는 시간처럼 보여도 호출 가능성이 있어 과제 처리와 대기를 병행한다.'
    if '날짜' in text or '수치' in text or '성장' in text or 'problem list' in t or 'assessment' in t or '줄임말' in text:
        return 'POMR/노티 품질 기준이다. 날짜·수치·성장백분위·Problem list/Assessment 분리를 정확히 지킨다.'
    if '아나필락시스' in text or '에피네프린' in text or '네블라이' in text or '흡입제' in text:
        return '공통교육/호흡기 자유기록 재료다. 실습 내용과 소감을 포트폴리오/자유기록에 재사용한다.'
    return '후기성/변동성 정보다. 카드에는 과하게 노출하지 않되, 상세에서 현장 판단 근거로 보존한다.'


def main() -> None:
    source_db = json.loads(SOURCE_DB.read_text())
    clean = json.loads(CLEAN_SLOTS.read_text())
    blocks = {b['id']: b for b in source_db['raw_blocks']}
    slots = {s['slot_id']: s for s in clean['clean_slots']}
    sessions = {}
    for session_id, slot_id in SESSION_TO_SLOT.items():
        slot = slots[slot_id]
        analysis_lines = []
        source_lines = []
        coverage = []
        for ref in slot.get('raw_refs_keep_collapsed', []):
            block = blocks.get(ref)
            if not block:
                analysis_lines.append(f'#### {ref} — MISSING SOURCE')
                continue
            heading = block.get('heading') or ref
            raw = block.get('text') or block.get('raw') or ''
            sentences = split_source_sentences(raw)
            coverage.append({'ref': ref, 'heading': heading, 'sentence_count': len(sentences)})
            analysis_lines.append(f'#### {ref} · {heading}')
            for idx, sent in enumerate(sentences, start=1):
                analysis_lines.append(f'- 원문 {idx}: {sent}')
                analysis_lines.append(f'  - 분석: {interpret(sent, slot_id)}')
            source_lines.append(f'#### {ref} · {heading}')
            for sent in sentences:
                source_lines.append(f'- {sent}')
        sections = {
            '핵심 정리': SESSION_OVERRIDES.get(session_id, {}).get('핵심 정리', []),
            '빠지면 손해나는 운영 디테일': slot.get('handoff_clean_notes', []),
            '인계 문장 단위 분석': analysis_lines,
            '원문 보존 / 출처': source_lines,
            '확인 필요': SESSION_OVERRIDES.get(session_id, {}).get('확인 필요', []),
        }
        sessions[session_id] = {
            'slot_id': slot_id,
            'slot_title': slot['title'],
            'raw_refs': slot.get('raw_refs_keep_collapsed', []),
            'coverage': coverage,
            'sections': {k: v for k, v in sections.items() if v},
        }
    payload = {
        'meta': {
            'title': '소아청소년과 1주차 B분과 문장 단위 인계 분석 v1',
            'generated_at': '2026-05-10T08:00:00+09:00',
            'source_db': str(SOURCE_DB.relative_to(ROOT)),
            'clean_slots': str(CLEAN_SLOTS.relative_to(ROOT)),
            'policy': 'card는 clean slot, detail은 raw ref 문장별 원문→분석을 보존한다.',
        },
        'sessions': sessions,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'out': str(OUT.relative_to(ROOT)), 'sessions': len(sessions), 'analysis_lines': sum(len(s['sections'].get('인계 문장 단위 분석', [])) for s in sessions.values())}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
