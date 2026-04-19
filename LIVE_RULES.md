# KMLE Planner Live Rules

이 문서는 **읽기용 회고**가 아니라, 플래너를 실제로 굴릴 때 판단 기준으로 쓰는 **짧은 운영 규칙**만 담는다.

## 1) Truth
### 호흡기 실습 human truth
- `~/Desktop/의학과 공부 파일/본3/호흡기내과/AI_정리/호흡기내과_메인인계_압축정리_v9.pdf`
- 의미: **무엇이 과제이고 무엇이 수업인지**를 판정하는 기준본
- 규칙:
  - **1페이지 표 = 과제 truth**
  - **2, 3페이지 = 전부 수업/세션 truth**
  - 수업 설명 속 과제 언급은 **링크만**, 수업 자체를 과제로 재분류하지 않음

## 2) Live execution source
### 실습 캘린더 live bundle
- `data/clerkships/bundles/respiratory_content_handoff_v2.bundle.json`
- 고정 `meta.clerkship_id`: `respiratory-2026-04-track-b`
- 원칙: **live path와 clerkship_id를 바꾸지 않는다**

### 국시 과목 관리 source
실습 bundle과 별개다.
- `data/canary_import_seed.json`
- `index.html` 내부
  - `CANARY_PARTS`
  - `buildCanaryState()`
- 의미:
  - 실습 캘린더 = bundle
  - 국시 과목/파트/문항 수/초기 진행 구조 = canary seed + HTML 로직

## 3) HTML 셸 운영 원칙
- `index.html`, `sync.js`, `service-worker.js`는 **셸**이다.
- 기본 원칙은 **freeze**.
- 다음 경우에만 HTML 수정 허용:
  1. 새 기능 추가가 정말 필요할 때
  2. loader / renderer / sync / save 이벤트가 실제로 깨졌을 때
  3. cache 전략을 고쳐야 할 때

즉:
- **내용 수정** → bundle 우선
- **기능 수정** → HTML 셸

## 4) 실습 종합(summary) 규칙
- 과제는 `착수` / `마감`으로 쪼개지 않는다.
- **과제 1개당 주간 summary 1개**로 본다.
- 과제 기간이 여러 주에 걸치면 **걸친 각 주마다 1개씩** 둔다.
- 한 주 안에서 끝나면 **그 주에만 1개**
- 주간 기준은 **월요일~일요일**

## 5) 과제 완료 체크 규칙
- 완료 체크 대상은 **실습 과제(assignment)**만
- 수업/세션(session)은 체크 대상이 아님
- 완료 상태는 기존 `calendarEvents[*].completed`를 재사용
- sync도 기존 state 저장/서버 반영 경로를 그대로 사용
- bundle 재불러오기 시에도 assignment 완료 상태는 carry-over 유지

## 6) 배포 원칙
### 가장 흔한 경우: 실습 내용 수정
- **bundle만 교체**
- 같은 live path에 덮어쓰기

### 예외: 기능 수정/셸 수정
- `index.html` 수정
- 필요 시 `service-worker.js`도 같이 수정
- 목표는 offline보다 **업데이트 즉시성** 우선

## 7) 캐시 원칙
- live bundle은 **network-first**
- 셸 자산(`index.html`, `sync.js`, `manifest`)도 가능하면 **fresh shell 우선**
- 목표:
  - 사용자가 매번 캐시 삭제/홈화면 재등록 안 하게 하기
  - HTML 변경 후에도 최대한 그냥 다시 열면 반영되게 하기

## 8) 문서화 원칙
문서는 많이 남기지 않는다.
남길 건 딱 3종류만:
1. **truth**
2. **실행 데이터**
3. **짧은 운영 규칙**

삭제 후보가 되는 문서:
- 길고 다시 안 읽는 회고문
- 코드/데이터에 반영되지 않는 설명문
- 판단을 바꾸지 않는 handoff 장문

한 줄 원칙:
> 읽기 위한 문서화는 줄이고, **동작을 바꾸는 문서화만 남긴다.**
