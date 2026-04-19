# 심장내과 원문 보존형 session patch packet v3

- packet id: `cardiology-verbatim-session-patch-v3`
- bundle target: `cardiology-2026-04-chief-draft-v2`
- type: `session_patch_packet`

## 우선순위

- `1-1-4`
- `1-4-2`
- `1-4-5`
- `1-5-2`
- `1-6-1`
- `1-6-2`
- `1-6-3`

## 핵심 산출물

- session patches: **17개**
- countable assignment defs: **21개**

## 세션 패치 목록

### s-2026-04-28-0840-heartsound | 심음 청진
- refs: 1-4-2, 1-1-4
- linked assignments: assign-onsite-heartsound-01
- badges: 현장승인

### s-2026-04-28-1400-htn-cpx | CPX HTN
- refs: 1-4-5, 1-1-4
- linked assignments: assign-onsite-cpx-htn-01
- badges: 현장승인

### s-2026-04-29-1000-pomr | POMR 증례발표
- refs: 1-5-2, 1-1-4
- linked assignments: assign-submit-pomr-01, assign-pomr-ecg-case
- badges: 없음

### s-2026-04-30-0800-ecg-a | A 심전도 발표
- refs: 1-6-1, 1-1-5, 4-1, 4-8, 1-1-4
- linked assignments: assign-onsite-ecg-a-01, assign-pomr-ecg-case
- badges: 현장승인

### s-2026-05-01-0800-ecg-b | B 심전도 발표
- refs: 1-7-1, 1-1-5, 4-1, 4-9, 1-1-4
- linked assignments: assign-onsite-ecg-b-01, assign-pomr-ecg-case
- badges: 현장승인

### s-2026-05-07-0800-ecg-cd | C,D 심전도 발표
- refs: 1-12-2, 1-1-5, 4-1, 4-10, 1-1-4
- linked assignments: assign-onsite-ecg-cd-01, assign-pomr-ecg-case
- badges: 현장승인

### s-2026-05-08-0800-ecg-ef | E,F 심전도 발표
- refs: 1-13-1, 1-1-5, 4-1, 4-11, 1-1-4
- linked assignments: assign-onsite-ecg-ef-01, assign-pomr-ecg-case
- badges: 현장승인

### s-2026-04-28-1000-abc-pci | ABC 심혈관조영실 참관
- refs: 1-4-3, 1-1-4, 3-1-1, 3-1-3, 3-2-2
- linked assignments: assign-onsite-pci-01, assign-onsite-pci-02, assign-onsite-pci-03
- badges: 현장승인

### s-2026-04-28-1000-def-outpatient | DEF 외래 참관(예진)
- refs: 1-4-3, 1-1-4, 3-3-1, 3-3-2, 3-4-9, 3-4-8
- linked assignments: assign-onsite-outpatient-01, assign-onsite-outpatient-02, assign-outpatient-record-01, assign-outpatient-record-02
- badges: 현장승인

### s-2026-04-30-0840-abc-outpatient | ABC 외래 참관(예진)
- refs: 1-6-2, 1-1-4, 3-3-1, 3-3-2, 3-4-1, 3-4-2, 3-4-6
- linked assignments: assign-onsite-outpatient-01, assign-onsite-outpatient-02, assign-outpatient-record-01, assign-outpatient-record-02
- badges: 현장승인

### s-2026-04-30-0840-def-pci | DEF 심혈관조영실 참관
- refs: 1-6-2, 1-1-4, 3-1-1, 3-1-3, 3-2-1
- linked assignments: assign-onsite-pci-01, assign-onsite-pci-02, assign-onsite-pci-03
- badges: 현장승인

### s-2026-04-30-1400-palpit | CPX 두근거림 / 실신
- refs: 1-6-3, 1-1-4
- linked assignments: assign-onsite-cpx-palpit-01
- badges: 현장승인

### s-2026-05-07-0900-dyspnea | CPX 호흡곤란
- refs: 1-12-3, 1-1-4
- linked assignments: assign-onsite-cpx-dyspnea-01
- badges: 현장승인

### s-2026-04-27-1600-physical | 심장 신체진찰
- refs: 1-3-6, 1-1-4
- linked assignments: assign-onsite-cardiac-exam-01
- badges: 현장승인

### s-2026-05-01-0840-osce | 제세동 / 심폐소생술 OT 및 OSCE
- refs: 1-7-2, 1-1-4
- linked assignments: assign-onsite-osce-01
- badges: 현장승인

### s-2026-05-08-1330-valvular | 심장판막질환
- refs: 1-13-2, 1-1-4
- linked assignments: assign-onsite-valvular-01
- badges: 현장승인

### overlay-2026-05-04-q-a | 가변/숨은 일정 · 심혈관질환의 개요 Q&A 과제 트리거
- refs: 1-9-4, 1-1-4
- linked assignments: assign-submit-qna-nojaehyung
- badges: 없음

## countable assignment defs (요약)

- `assign-onsite-heartsound-01` | 현장승인 · 심음청진 | onsite_approval | refs: 1-1-4, 1-4-2
- `assign-onsite-cpx-htn-01` | 현장승인 · CPX 고혈압 | onsite_approval | refs: 1-1-4, 1-4-5
- `assign-submit-pomr-01` | 제출 · POMR 발표 | deliverable | refs: 1-1-4, 1-5-2
- `assign-onsite-ecg-a-01` | 현장승인 · 심전도 발표 A | onsite_approval | refs: 1-1-4, 1-6-1, 1-1-5, 4-1, 4-8
- `assign-onsite-ecg-b-01` | 현장승인 · 심전도 발표 B | onsite_approval | refs: 1-1-4, 1-7-1, 1-1-5, 4-1, 4-9
- `assign-onsite-ecg-cd-01` | 현장승인 · 심전도 발표 C,D | onsite_approval | refs: 1-1-4, 1-12-2, 1-1-5, 4-1, 4-10
- `assign-onsite-ecg-ef-01` | 현장승인 · 심전도 발표 E,F | onsite_approval | refs: 1-1-4, 1-13-1, 1-1-5, 4-1, 4-11
- `assign-onsite-pci-01` | 현장승인 · 심혈관조영실 PCI 1/3 | onsite_approval | refs: 1-1-4, 1-4-3, 1-6-2, 3-1-1, 3-1-3
- `assign-onsite-pci-02` | 현장승인 · 심혈관조영실 PCI 2/3 | onsite_approval | refs: 1-1-4, 1-4-3, 1-6-2, 3-1-1, 3-1-3
- `assign-onsite-pci-03` | 현장승인 · 심혈관조영실 PCI 3/3 | onsite_approval | refs: 1-1-4, 1-4-3, 1-6-2, 3-1-1, 3-1-3
- `assign-onsite-cpx-palpit-01` | 현장승인 · CPX 두근거림/실신 | onsite_approval | refs: 1-1-4, 1-6-3
- `assign-onsite-cardiac-exam-01` | 현장승인 · 심장진찰 | onsite_approval | refs: 1-1-4, 1-3-6
- `assign-onsite-osce-01` | 현장승인 · 임상술기(OSCE) | onsite_approval | refs: 1-1-4, 1-7-2
- `assign-onsite-outpatient-01` | 현장승인 · 외래 참관 1/2 | onsite_approval | refs: 1-1-4, 1-4-3, 1-6-2, 3-3-1, 3-3-2
- `assign-onsite-outpatient-02` | 현장승인 · 외래 참관 2/2 | onsite_approval | refs: 1-1-4, 1-4-3, 1-6-2, 3-3-1, 3-3-2
- `assign-outpatient-record-01` | 제출 · 외래 예진기록지 1/2 | deliverable | refs: 1-1-4, 3-3-2
- `assign-outpatient-record-02` | 제출 · 외래 예진기록지 2/2 | deliverable | refs: 1-1-4, 3-3-2
- `assign-onsite-cpx-dyspnea-01` | 현장승인 · CPX 호흡곤란 | onsite_approval | refs: 1-1-4, 1-12-3
- `assign-onsite-valvular-01` | 현장승인 · 심장판막질환 | onsite_approval | refs: 1-1-4, 1-13-2
- `assign-submit-pretest-free-record` | 제출 · Pretest 자유기록 | deliverable | refs: 1-1-4, 1-3-5
- `assign-submit-qna-nojaehyung` | 제출 · 심혈관질환 Q&A | deliverable | refs: 1-1-4, 1-9-4

## split rules

- `assign-uportfolio-onsite` -> assign-onsite-heartsound-01, assign-onsite-cpx-htn-01, assign-onsite-ecg-a-01, assign-onsite-ecg-b-01, assign-onsite-ecg-cd-01, assign-onsite-ecg-ef-01, assign-onsite-pci-01, assign-onsite-pci-02, assign-onsite-pci-03, assign-onsite-cpx-palpit-01, assign-onsite-cardiac-exam-01, assign-onsite-osce-01, assign-onsite-outpatient-01, assign-onsite-outpatient-02, assign-onsite-cpx-dyspnea-01, assign-onsite-valvular-01
  - 유폴 현장승인을 한 덩어리로 두면 카드/종합에서 개별 count가 안 보임
- `assign-outpatient-records` -> assign-onsite-outpatient-01, assign-onsite-outpatient-02, assign-outpatient-record-01, assign-outpatient-record-02
  - 외래 예진기록지와 외래 현장승인을 분리해야 준비/제출/승인 단계가 세션에 맞게 보임
- `assign-pomr-ecg-case` -> assign-submit-pomr-01, assign-onsite-ecg-a-01, assign-onsite-ecg-b-01, assign-onsite-ecg-cd-01, assign-onsite-ecg-ef-01
  - POMR 제출과 심전도 발표 현장승인을 분리해야 session별 연결이 선명해짐

JSON: `/Users/sffs123gmail.com/.openclaw/workspace/kmle-planner/data/clerkships/packets/cardiology/2026-04-19_verbatim_session_patch_packet_v3.json`