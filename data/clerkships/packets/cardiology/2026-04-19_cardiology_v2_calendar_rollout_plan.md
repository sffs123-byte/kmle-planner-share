# Cardiology v2 → 실습 캘린더 반영 계획 (2026-04-19)

## 목적
`cardiology-2026-04-chief-draft-v2`를 **실사용 가능한 실습 캘린더 상태**로 올린다.
핵심은 **새 데이터 생성**이 아니라, 이미 잠근 v2 세트가 실제 주간 그리드/종합/상세 패널에서 잘 보이는지 QA하고, 필요한 수정은 **data first**로 끝내는 것이다.

## 현재 잠긴 산출물
- local bundle: `kmle-planner/data/clerkships/bundles/cardiology_content_handoff_v2.bundle.json`
- local briefing: `kmle-planner/data/clerkships/briefings/cardiology_content_handoff_v2.daily_briefing.json`
- local reminders: `kmle-planner/data/clerkships/reminders/cardiology_content_handoff_v2.day_reminders.json`
- local audit: `kmle-planner/data/clerkships/audit/cardiology_content_handoff_v2.audit.json`
- local planner import: `kmle-planner/data/planner_state_cardiology_content_handoff_v2_import.json`
- deploy mirror bundle: `kmle-planner-deploy/data/clerkships/bundles/cardiology_content_handoff_v2.bundle.json`
- deploy mirror planner import: `kmle-planner-deploy/data/planner_state_cardiology_content_handoff_v2_import.json`

## 현재 확정 수치
- bundle id: `cardiology-2026-04-chief-draft-v2`
- sessions: **73**
- assignments: **7**
- overlay sessions: **7**
- expected imported cardiology calendar events: **83**
- expected first event title example: `교수님 확인 문자 · 박재형`

## 절대 원칙
1. **data first / HTML last**
2. 원문 truth는 `심장내과 인계 정리용.md` 쪽에서 유지하고, bundle은 실사용용 정규화 층으로 다룬다.
3. `approval_required`, `confirm_level`, `split_group`, `source_refs`, stable id, overlay semantics는 유지한다.
4. placeholder/skeleton 문구를 다시 넣지 않는다.
5. 캐시 때문에 오래된 66-session bundle이 보일 수 있으므로, QA는 반드시 **fresh origin / cache-bust** 기준으로 한다.

---

## Phase 1. QA 기준 잠그기
### 목표
"무엇을 통과하면 live로 본다"를 먼저 잠근다.

### 체크 항목
1. **주간 종합 counts 정상 여부**
   - cardiology import 후 주간 summary/card count가 session/assignment 구조와 크게 어긋나지 않는지
2. **assignment 7개 summary 과밀 여부**
   - 각 주에 summary card가 너무 많이 몰려 시야를 가리지 않는지
3. **overlay 7개 노출 밀도**
   - chief/admin lane에서 overlay가 지나치게 시끄럽게 보이지 않는지
4. **split card 가독성**
   - `ABC/DEF`, `A/B`, `CD/EF` 분기 카드가 실제 주간 그리드에서 구분 가능하고 눌렀을 때 정보가 자연스러운지
5. **approval / 확인필요 표시성**
   - approval 색상/배지가 실제로 눈에 띄는지
6. **상세 패널 밀도**
   - summary / note / prep_tasks / core_points가 너무 길거나 중복되지 않는지

### 산출물
- pass/fail 메모 1개
- issue list를 **data issue / shell issue**로 분리

---

## Phase 2. 실사용 QA (HTML 수정 없이)
### 목표
현재 셸 그대로 cardiology v2를 실제로 넣어보고, 문제를 **관찰만** 한다.

### 실행 방식
1. **fresh local origin**에서 `kmle-planner-deploy/` 또는 `kmle-planner/`를 띄운다.
2. 기존 캐시/서비스워커 영향 없는 상태에서 cardiology v2 bundle을 불러온다.
3. 실습 캘린더 화면 중심으로 아래를 본다:
   - 주간 종합 카드
   - chief/admin lane
   - session detail panel
   - assignment summary card
   - overlay session 노출

### 기록 방식
문제 발견 시 바로 고치지 말고 아래 포맷으로 적는다.
- `Q1`: counts mismatch / no mismatch
- `Q2`: assignment over-dense / tolerable
- `Q3`: overlay too loud / acceptable
- `Q4`: split unreadable / acceptable
- `Q5`: approval weak / visible
- `Q6`: detail too long / acceptable

### 통과 기준
- counts가 audit 예상치와 크게 어긋나지 않음
- assignment 7개 summary가 주간 카드에서 과밀하지 않음
- overlay 7개가 경고성 정보로만 보이고 본편을 잡아먹지 않음
- approval/확인필요가 실제로 눈에 들어옴
- split card를 눌렀을 때 누가/어디로 가는지 혼동이 적음

---

## Phase 3. 수정 (반드시 data first)
### 목표
문제가 있으면 HTML보다 **bundle / reminders / briefing**에서 먼저 해결한다.

### 우선 조정 대상
1. `summary`
   - 1~2줄 유지, 중복 제거
2. `calendar_body_short`
   - lane에서 보이는 한 줄 밀도 조정
3. `prep_tasks`, `core_points`
   - 0~3개 수준 유지
4. `sections`
   - `intro / 핵심 정리 / 준비·운영 포인트` 중심 유지
5. overlay session
   - 너무 시끄러우면 `note`, `calendar_body_short`, `linked_note_show_sections` 조정
6. reminder/briefing
   - chief/admin/overlay 과밀이 day summary를 가리면 sidecar 쪽에서 분산

### 수정 금지선
- stable id 변경 금지
- semantics field 삭제 금지
- truth source를 요약문으로 오염시키지 말 것
- HTML/CSS로 먼저 덮지 말 것

---

## Phase 4. QA 재실행 → 승격 판정
### 목표
data 조정본으로 다시 QA를 돌리고, live 승격 여부를 판정한다.

### 판정
- **PASS**: data-only fix로 문제 대부분 해소
- **SOFT PASS**: 사소한 셸 개선이 있으면 더 좋지만, 수동 import/live 사용은 가능
- **FAIL**: split card/approval visibility/counts 문제가 구조적으로 남아 HTML 검토 필요

### 여기서 잠글 것
- 최종 live 대상 파일 경로
- import 기준 경로(local/deploy)
- live 운영 방침(수동 import vs 최소 버튼 추가)

---

## Phase 5. live 진입 방식 결정
### 옵션 A. 수동 import 유지 (권장 시작점)
**언제 선택?**
- 셸 수정 없이도 QA가 통과할 때
- 일단 빨리 실사용에 올리고 싶을 때

**장점**
- HTML freeze 원칙 유지
- 리스크 작음
- bundle만 갈아끼우면 됨

**방식**
- 기존 import UI로 cardiology bundle 또는 planner import state를 불러온다.
- Mac 기준 baseline 확인 후 필요 시 sync code로 iPad에 밀어넣는다.

### 옵션 B. 최소 버튼 추가
**언제 선택?**
- 반복적으로 cardiology를 원클릭으로 불러와야 할 때
- 수동 import UX가 실제 사용에서 번거로울 때

**조건**
- Phase 4 PASS 이후에만 검토
- respiratory 버튼 패턴을 복제하는 최소 변경만 허용
- `index.html` / `kmle-planner-deploy/index.html` 동시 반영

**변경 범위 최소안**
- 버튼 1개 추가: `심장내과 실습 불러오기`
- loader target: `./data/clerkships/bundles/cardiology_content_handoff_v2.bundle.json`
- 셸 변경은 이 수준에서 끝내고, 추가 기능은 금지

---

## Phase 6. 실제 반영 / 운영 잠금
### 목표
실사용 시작 후 재수정 범위를 최소화한다.

### 마지막 체크
1. local / deploy mirror 파일 동기화
2. import 결과가 기대값(83 cardiology events)에 맞는지 재확인
3. sync 필요 시 Mac → iPad 전송
4. 운영 메모 갱신
   - live path
   - import 방식
   - HTML 수정 여부
   - 다음 수정은 bundle-only인지 여부

---

## 추천 실행 순서 (이번 작업용)
1. **Phase 1 QA 기준 잠그기**
2. **Phase 2 실사용 QA**
3. 이슈를 `data issue / shell issue`로 분류
4. **Phase 3 data-only 수정**
5. **Phase 4 QA 재실행**
6. **옵션 A(수동 import)**로 먼저 올릴지, **옵션 B(최소 버튼 추가)**로 갈지 결정
7. 실제 live 반영

내 현재 추천은:
- **1차 승격은 옵션 A(수동 import 유지)**
- 버튼 추가는 QA가 깨끗하게 통과한 뒤 2차로 검토

---

## context reset 후 첫 액션
다음 세션에서는 이 파일부터 읽고 바로 집행:
- `kmle-planner/data/clerkships/packets/cardiology/2026-04-19_cardiology_v2_calendar_rollout_plan.md`

그다음 바로 볼 것:
- `kmle-planner/data/clerkships/bundles/cardiology_content_handoff_v2.bundle.json`
- `kmle-planner/data/clerkships/audit/cardiology_content_handoff_v2.audit.json`
- `kmle-planner-deploy/index.html`
- `kmle-planner/index.html`

## 한 줄 결론
**지금은 새로 만들 단계가 아니라, cardiology v2를 실사용 QA로 검수하고 data-only로 다듬은 뒤, 수동 import로 먼저 올릴지 최소 버튼을 추가할지 결정하는 단계다.**
