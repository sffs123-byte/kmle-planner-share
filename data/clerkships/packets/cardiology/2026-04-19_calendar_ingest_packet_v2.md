# 심장내과 캘린더 ingest packet v2

- 작성일: 2026-04-19
- 목적: 비서 자비스가 `심장내과 인계 정리용.md`를 캘린더에 반영할 때 **바로 쓸 수 있는 ingest view** 제공
- 1차 정본: `/Users/sffs123gmail.com/Desktop/의학과 공부 파일/본3/심장내과/25/(0) 26년도 인계/심장내과 인계 정리용.md`
- 기반 bundle: `/Users/sffs123gmail.com/.openclaw/workspace/kmle-planner/data/clerkships/bundles/cardiology_content_handoff_v1.bundle.json`

## 1. 이 packet이 해결하는 것

- fixed timed spine와 untimed chief/admin event를 분리한다.
- `approval_required` 세션을 특별 색으로 표시할 수 있게 분리한다.
- `ABC/DEF`, `A/B`, `C,D`, `E,F` 같은 split group을 separate card로 렌더할 수 있게 한다.
- 시간표 spine에는 없지만 실제 운영상 중요한 **hidden / variable overlays**를 따로 뺀다.

## 2. secretary ingest 규칙 요약

1. `1-1-2`를 timed session spine으로 사용한다.
2. `1-1-3`으로 participant overlay를 입힌다.
3. `1-1-4`로 approval / submission semantics를 붙인다.
4. `1-2 ~ 1-13`은 본문 전체를 캘린더에 넣지 말고 linked note 디테일로만 쓴다.
5. `2.x`는 날짜 하단 untimed chief/admin 이벤트로 넣는다.
6. `3.x`, `4.x`는 guide pack / linked note에만 두고 calendar body에는 길게 넣지 않는다.

## 3. approval 색상 대상

- `심전도 발표` → 유폴 자유기록 · 심전도 발표
- `PCI` → 유폴 자유기록 · 심혈관조영실 PCI
- `심혈관조영실` → 유폴 자유기록 · 심혈관조영실 PCI
- `부정맥 시술 참관` → 유폴 자유기록 · 심혈관조영실 PCI
- `심음 청진` → 유폴 자유기록 · 심음청진
- `심장 신체진찰` → 유폴 자유기록 · 심장진찰
- `CPX` → 유폴 자유기록 · CPX
- `외래 참관` → 유폴 외래참관 + 예진기록지
- `제세동 / 심폐소생술 OT 및 OSCE` → 유폴 임상술기 · OSCE 척도평가
- `심장판막질환` → 유폴 자유기록 · 심장판막질환

## 4. hidden / variable overlay 핵심

### 2026-04-29

- **흉통 CPX** (conditional_session)
  - why: 고정 시간표에는 안 보이지만 실제 조 운영에서는 수요일 오후나 목요일 16시로 이동해 들어올 수 있다.
  - action: 확정 전까지는 고정 timed event로 만들지 말고, day note의 variable block으로 두었다가 박현웅 교수님 답장/전화 기준으로 확정 시 승격.
  - refs: 1-5-3, 2-6-3

### 2026-05-04

- **세종 오전 외래↔PCI split** (hidden_runtime_override)
  - why: 시간표는 외래만 보이지만 실제로는 초진 부족 인원은 외래, 나머지는 PCI/부정맥 시술 참관으로 갈라질 수 있다.
  - action: 기본 spine은 시간표대로 두되, day note 상단에 “김민수 교수님 당일 지시 우선” 배지를 고정한다.
  - refs: 1-8-2, 1-9-2, 1-9-3
- **심혈관질환의 개요 Q&A 과제 트리거** (assignment_trigger)
  - why: 별도 강의 세션보다 과제 주제 지시 성격이 강해 timed session보다 assignment/reminder로 다루는 편이 맞다.
  - action: 수업 카드보다 과제/reminder 영역에 배치한다.
  - refs: 1-9-4

### 2026-05-05

- **초진 quota 보충 외래** (conditional_session)
  - why: 고정 시간표는 PCI 중심이지만, 예진 미충족자는 9~10시 또는 오전 중 다른 교수님 외래를 먼저 볼 수 있다.
  - action: 기본 spine 유지 + “예진 미충족자 outpatient override 가능” 메모를 오전 카드에 붙인다.
  - refs: 1-10-1

### 2026-05-06

- **박재형 심장초음파 수업** (hidden_session)
  - why: 시간표에 없지만 실제 인계상 존재하는 숨은 일정이라 누락되기 쉽다.
  - action: 기본 spine와 별개로 AM hidden session candidate로 둔다. 박재형 교수님 확인 문자가 오면 즉시 timed session으로 승격.
  - refs: 1-11-2, 2-11-2
- **예진 미충족자 외래 보충** (conditional_session)
  - why: 수요일 오전은 미진한 외래/예진을 마저 채우는 보충 창으로 자주 쓰인다.
  - action: 고정 세션으로 넣기보다 day note의 flex block으로 표시한다.
  - refs: 1-11-3
- **부정맥 시술 참관 추가분** (optional_extension)
  - why: 조와 해에 따라 오후 추가 참관이 붙을 수 있다.
  - action: optional badge만 달고 기본 timeline엔 넣지 않는다.
  - refs: 1-11-5

## 5. 날짜별 secretary action digest

### 2026-04-24 |  

- site default: 본원
- timed events: 0
- untimed ops: 2
- approval sessions: 없음
- confirm sessions: 없음
- untimed ops:
  - 조원 공지 · 실습 전주 준비
  - 교수님 확인 문자 · 박재형

### 2026-04-26 |  

- site default: 본원
- timed events: 0
- untimed ops: 1
- approval sessions: 없음
- confirm sessions: 없음
- untimed ops:
  - 교수님 확인 문자 · OT / 성인환

### 2026-04-27 | 1주차 월요일

- site default: 본원
- timed events: 6
- untimed ops: 2
- approval sessions: 심장 신체진찰
- confirm sessions: Orientation, Pretest
- assignments touching today:
  - My Echo & ECG 발표 준비 (상) | deadline 2026-04-28T12:00
  - POMR / 심전도 발표 케이스 준비 (최상) | deadline 2026-04-29T10:00
  - MI case 발표 준비 (상) | deadline 2026-04-29T12:00
  - 유폴 현장승인 항목 관리 (상) | deadline 2026-05-08T18:00
- prep top line:
  - 의국회의 전 심장진찰용 자와 MI/ECG 케이스 전달 여부 확인
  - 월초 시작 조는 의국회의 유무를 전 조에게 미리 확인
  - 화·수 수업 교수님들께 다시 확인 연락할 목록 정리
  - 김준형 심전도 발표, 김미주 호흡곤란 CPX처럼 변동 잦은 일정 별도 체크
- untimed ops:
  - 조원 공지 · 일정 종료 후
  - 교수님 확인 문자 · 화/수 일정

### 2026-04-28 | 1주차 화요일

- site default: 본원
- timed events: 7
- untimed ops: 2
- approval sessions: 심음 청진, ABC 심혈관조영실 참관, DEF 외래 참관(예진), CPX for HTN
- confirm sessions: 심음 청진, ABC 심혈관조영실 참관, DEF 외래 참관(예진), CPX for HTN
- assignments touching today:
  - My Echo & ECG 발표 준비 (상) | deadline 2026-04-28T12:00
  - 외래 예진기록지 2회 (최상) | deadline 2026-05-08T23:59
- prep top line:
  - 조 안에서 환자 겹치지 않게 분산
  - 스캔본 제출 루트 확인
  - OSCE 예약 확인
  - 성석우 교수님용 스캔본 분리
- untimed ops:
  - 조원 공지 · 일정 종료 후
  - 교수님 확인 문자 · 전공의 / 정진옥

### 2026-04-29 | 1주차 수요일

- site default: 본원
- timed events: 5
- untimed ops: 2
- approval sessions: DEF 외래 참관(예진)
- confirm sessions: DEF 외래 참관(예진)
- variable overlays: 흉통 CPX
- assignments touching today:
  - POMR / 심전도 발표 케이스 준비 (최상) | deadline 2026-04-29T10:00
  - MI case 발표 준비 (상) | deadline 2026-04-29T12:00
- prep top line:
  - 주제 분배 확정
  - 슬라이드 최소화, 핵심 위주
  - AB 발표자 / 자료 담당 분리
  - 전공의 피드백 PPT 별도 준비
- untimed ops:
  - 조원 공지 · 일정 종료 후
  - 교수님 확인 문자 · 권희진 / 김준형

### 2026-04-30 | 1주차 목요일

- site default: 본원
- timed events: 6
- untimed ops: 2
- approval sessions: A 심전도 발표, ABC 외래 참관(예진), DEF 심혈관조영실 참관, CPX: palpitation & syncope
- confirm sessions: A 심전도 발표, ABC 외래 참관(예진), DEF 심혈관조영실 참관, CPX: palpitation & syncope
- prep top line:
  - 전공의 피드백 반영본 최종 점검
  - 예진기록지 추가분 챙기기
  - 유폴 현장승인 누락 금지
  - 전날 공지대로 전원 준비
- untimed ops:
  - 조원 공지 · 일정 종료 후
  - 교수님 확인 문자 · 안계택

### 2026-05-01 | 1주차 금요일

- site default: 본원
- timed events: 4
- untimed ops: 1
- approval sessions: B 심전도 발표, 제세동 / 심폐소생술 OT 및 OSCE
- confirm sessions: B 심전도 발표, 제세동 / 심폐소생술 OT 및 OSCE
- assignments touching today:
  - 주간실습계획과 성찰 / 최종성찰 (상) | deadline 2026-05-08T23:59
- prep top line:
  - 다음 조 예약까지 같이 잡는 운영이 편함
  - 세종 관련은 김민수 교수님 연락대로 움직인다는 문구 포함
- untimed ops:
  - 조원 공지 · 세종 준비 / 다음주 준비

### 2026-05-03 |  

- site default: 본원
- timed events: 0
- untimed ops: 2
- approval sessions: 없음
- confirm sessions: 없음
- untimed ops:
  - 주말 공지 · 세종 집합 안내
  - 교수님 확인 문자 · 김민수

### 2026-05-04 | 2주차 월요일

- site default: 세종
- timed events: 2
- untimed ops: 1
- approval sessions: ABC 외래 참관, DEF 외래 참관
- confirm sessions: ABC 외래 참관, DEF 외래 참관
- variable overlays: 세종 오전 외래↔PCI split, 심혈관질환의 개요 Q&A 과제 트리거
- prep top line:
  - 명찰 수령, 출입증, 집합 확인
  - 유폴 성함 누락 시 김민수 교수님 경유
  - 박재형 교수님 수업은 시간표 외 숨은 일정이라 세종 일정과 함께 확인
- untimed ops:
  - 교수님 확인 문자 · 김미주 / 박재형 / 전공의

### 2026-05-05 | 2주차 화요일

- site default: 세종
- timed events: 3
- untimed ops: 1
- approval sessions: ABC PCI 참관, DEF PCI 참관, DEF 부정맥 시술 참관
- confirm sessions: ABC PCI 참관, DEF PCI 참관, DEF 부정맥 시술 참관
- variable overlays: 초진 quota 보충 외래
- prep top line:
  - 김민수 교수님 운영 연락 병행
  - 세종 일정이라 장소도 같이 재확인
- untimed ops:
  - 교수님 확인 문자 · 오진경

### 2026-05-06 | 2주차 수요일

- site default: 세종
- timed events: 3
- untimed ops: 2
- approval sessions: ABC 부정맥 시술 참관
- confirm sessions: ABC 부정맥 시술 참관, 부정맥과 심전도, 심초음파의 이해
- variable overlays: 박재형 심장초음파 수업, 예진 미충족자 외래 보충, 부정맥 시술 참관 추가분
- prep top line:
  - 장소/시간 재확인
  - 2명씩 짝지어 가상환자 대본 작성, 의사/환자 역할 랜덤
  - 발표 전날 짧고 가볍게
- untimed ops:
  - 조원 공지 · 일정 종료 후
  - 교수님 확인 문자 · 김준형

### 2026-05-07 | 2주차 목요일

- site default: 본원
- timed events: 5
- untimed ops: 2
- approval sessions: C,D 심전도 발표, CPX 호흡곤란, ABC 외래 참관(예진)
- confirm sessions: C,D 심전도 발표, CPX 호흡곤란, ABC 외래 참관(예진)
- prep top line:
  - 전날 공지로 대본 작성 완료
  - 교수님 시간 변동 가능성 확인
  - 예진기록지 2회 요건 채우는 날로 중요
  - 돌아가며 질문하는 스타일이라 야마 위주 준비
- untimed ops:
  - 조원 공지 · 일정 종료 후
  - 교수님 확인 문자 · 양유진

### 2026-05-08 | 2주차 금요일

- site default: 본원
- timed events: 4
- untimed ops: 1
- approval sessions: E,F 심전도 발표, 심장판막질환
- confirm sessions: E,F 심전도 발표, 심장판막질환
- assignments touching today:
  - 유폴 현장승인 항목 관리 (상) | deadline 2026-05-08T18:00
  - 외래 예진기록지 2회 (최상) | deadline 2026-05-08T23:59
  - 주간실습계획과 성찰 / 최종성찰 (상) | deadline 2026-05-08T23:59
  - 마지막 업로드 묶음 (상) | deadline 2026-05-09T23:59
- prep top line:
  - 전날 문자로 장소/대행 여부 재확인
  - 드롭박스/유폴리오/로컬 인계파일 회수 경로를 분리해서 관리
- untimed ops:
  - 과제 checklist · 최종 제출 / 인계파일 회수

## 6. 파일

- JSON: `/Users/sffs123gmail.com/.openclaw/workspace/kmle-planner/data/clerkships/packets/cardiology/2026-04-19_calendar_ingest_packet_v2.json`
- MD: `/Users/sffs123gmail.com/.openclaw/workspace/kmle-planner/data/clerkships/packets/cardiology/2026-04-19_calendar_ingest_packet_v2.md`

## 7. 비고

- calendar body에는 짧게 넣고, 디테일은 linked note로 보내는 구조가 맞다.
- 특히 2주차 세종 일정은 fixed timetable보다 당일 운영 지시를 우선해야 하므로, secretary가 PM 레벨에서 variable badge를 유지해야 한다.