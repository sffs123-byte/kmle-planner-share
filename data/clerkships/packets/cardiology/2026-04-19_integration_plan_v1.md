# 심장내과 실습 캘린더 integration plan v1

- 작성일: 2026-04-19
- 목적: `심장내과 인계 정리용.md`, `심장내과 조장용 공지, 문자 예시`, `PCI 및 외래 인계`를 GitHub Pages/KMLE planner에 넣기 위한 실제 반영 단위 정리
- 원칙: HTML 셸은 가급적 고정하고, bundle/packet JSON에서 해결한다.

## 1. Source of truth

### 1차 정본
- `/Users/sffs123gmail.com/Desktop/의학과 공부 파일/본3/심장내과/25/(0) 26년도 인계/심장내과 인계 정리용.md`

### 보조 소스
- `/Users/sffs123gmail.com/Desktop/의학과 공부 파일/본3/심장내과/25/(0) 26년도 인계/심장내과 조장용 공지, 문자 예시(26.04.10 update).docx`
- `/Users/sffs123gmail.com/Desktop/의학과 공부 파일/본3/심장내과/25/(0) 26년도 인계/2026 PCI 및 외래 인계 (26.04.10 update).docx`
- `/Users/sffs123gmail.com/Desktop/의학과 공부 파일/본3/심장내과/25/(0) 26년도 인계/2026 김준형 교수님 심전도 발표 인계 (26.04.10 update).docx`
- `/Users/sffs123gmail.com/Desktop/의학과 공부 파일/본3/심장내과/25/(0) 26년도 인계/심장내과 전체인계_2026_1학기(26.04.10 update).docx`

### 반영 원칙
- md = 메인 인계의 canonical source
- **보강 텍스트는 항상 md 안의 원문을 그대로 넣는다. 요약/압축/문장 다듬기 금지.**
- 공지/문자 docx = `communications_by_date` 구성용 보조 소스
- PCI/외래 docx = `guide_packs` 구성용 보조 소스
- docx 원문을 HTML에 직접 박지 않고, 구조화 후 packet/bundle로 반영
- docx는 `배치 위치 결정`, `교수별/날짜별 분류`, `추가 참고 포인트 보존` 용도로만 쓰고, 메인 설명문을 대체하지 않는다.

---

## 2. 캘린더 레이어 분리

### A. timed session
- 시간표에 있는 실제 수업/실습/발표/시험
- 예: OT, Pretest, 심전도 발표, 외래 참관, PCI 참관, CPX

### B. untimed communication session
- 날짜 하단 `시간 미정` 영역에 들어가는 조장 운영 이벤트
- type:
  - `chief` = 조원 공지
  - `admin` = 교수님/전공의 문자, 과제 회수, 운영 확인

### C. guide pack
- PCI / 외래 / 교수별 운영 포인트
- 개별 timed session 상세 패널에 연결
- 날짜 하단 이벤트로 직접 노출하지 않음

---

## 3. untimed communication event 목록

원칙:
- 한 날짜에 최대 2개 권장
- `조원 공지 1개 + 문자 1개`로 묶는다
- 주말 공지는 실제 주말 날짜에 둔다

### 전주 금요일
1. `chief` · 조원 공지 · 실습 전주 준비
2. `admin` · 교수님 확인 문자 · 박재형

### 전주 일요일
1. `admin` · 교수님 확인 문자 · OT / 성인환

### 1주차 월요일
1. `chief` · 조원 공지 · 일정 종료 후
2. `admin` · 교수님 확인 문자 · 화/수 일정
   - 진선아 / 박현웅 / 이재환 / 김준형

### 1주차 화요일
1. `chief` · 조원 공지 · 일정 종료 후
2. `admin` · 교수님 확인 문자 · 전공의 / 정진옥

### 1주차 수요일
1. `chief` · 조원 공지 · 일정 종료 후
2. `admin` · 교수님 확인 문자 · 권희진 / 김준형

### 1주차 목요일
1. `chief` · 조원 공지 · 일정 종료 후
2. `admin` · 교수님 확인 문자 · 안계택

### 1주차 금요일
1. `chief` · 조원 공지 · 세종 준비 / 다음주 준비

### 1주차 일요일
1. `chief` · 주말 공지 · 세종 집합 안내
2. `admin` · 교수님 확인 문자 · 김민수

### 2주차 월요일
1. `admin` · 교수님 확인 문자 · 김미주 / 박재형 / 전공의

### 2주차 화요일
1. `admin` · 교수님 확인 문자 · 오진경

### 2주차 수요일
1. `chief` · 조원 공지 · 일정 종료 후
2. `admin` · 교수님 확인 문자 · 김준형

### 2주차 목요일
1. `chief` · 조원 공지 · 일정 종료 후
2. `admin` · 교수님 확인 문자 · 양유진

### 2주차 금요일
1. `chief` · 과제 checklist · 최종 제출 / 인계파일 회수

---

## 4. untimed event 상세 패널 구성 규칙

각 untimed event는 기존 session 상세 패널 구조를 재사용한다.

### 공통 section key
- `intro`
- `핵심 정리`
- `준비 / 운영 포인트`
- `질문 / 예시 포인트`
- `조사 / 보강 내용`

### 예시
#### `chief` · 1주차 월요일 조원 공지
- intro: 오늘 일정 종료 후 전원에게 공유할 운영 공지
- 핵심 정리: echo/ECG, MI case, 심전도 발표, 유폴 업로드 등
- 준비 / 운영 포인트: 공지 시점, 누락되기 쉬운 항목
- 질문 / 예시 포인트: 실제 복붙 가능한 공지 문구
- 조사 / 보강 내용: 일정 변동 시 수정해서 사용

#### `admin` · 1주차 월요일 교수님 확인 문자
- intro: 화/수 일정 관련 확인 문자 묶음
- 핵심 정리: 진선아 / 박현웅 / 이재환 / 김준형
- 준비 / 운영 포인트: 오후 1~2시 전송, OT 직후 직접 물어볼 수 있으면 생략 가능
- 질문 / 예시 포인트: 교수님별 문자 원문
- 조사 / 보강 내용: 연락금지/예외/리마인드 규칙

---

## 5. guide pack 목록

## 5-1. 공통 guide pack
1. `guide-pci-common`
- 입실 동선
- 복장 / 납복 / 캡
- 대기 위치
- 유폴 현장승인 타이밍
- 질문 대비 포인트

2. `guide-outpatient-common`
- 시작 10분 전 대기
- 시간표 지정 교수 외래만 들어가기
- 초진 / 예진 / patient log / 유폴 흐름
- 중간 이탈 금지 원칙(교수님이 먼저 보내는 경우 제외)

3. `guide-sejong-special`
- 세종에서 싸인/승인 우회되는 케이스
- 유폴 교수명 누락 시 누구에게 받는지

## 5-2. PCI 교수별 guide pack
- `guide-pci-seongsw`
- `guide-pci-leejaehwan`
- `guide-pci-kimtaeseok`
- `guide-pci-nojaehyung-placeholder`

## 5-3. 외래 교수별 guide pack (대전)
- `guide-outpatient-leejaehwan`
- `guide-outpatient-parkhyunwoong`
- `guide-outpatient-songpilsang`
- `guide-outpatient-jinseona`
- `guide-outpatient-seongsw`
- `guide-outpatient-kwonheejin`
- `guide-outpatient-bokyoungnam`
- `guide-outpatient-ankytaek`
- `guide-outpatient-jungjinok`
- `guide-outpatient-kimjunhyung`
- `guide-outpatient-kimmiju`

## 5-4. 외래 교수별 guide pack (세종)
- `guide-outpatient-hwangwonmuk`
- `guide-outpatient-kimtaeseok`
- `guide-outpatient-ohjingyeong`
- `guide-outpatient-kimminsu`

---

## 6. timed session ↔ guide pack 연결표

### 1주차 화요일 10:00–12:00
#### ABC 심혈관조영실
- `guide-pci-common`
- `guide-pci-leejaehwan`

#### DEF 외래 참관(예진)
- `guide-outpatient-common`
- `guide-outpatient-jungjinok`
- `guide-outpatient-ankytaek`

### 1주차 수요일 14:00–18:00 DEF 외래 참관(예진)
- `guide-outpatient-common`
- `guide-outpatient-kimjunhyung`
- `guide-outpatient-jinseona`
- `guide-outpatient-bokyoungnam`

### 1주차 목요일 08:40–12:00
#### ABC 외래 참관(예진)
- `guide-outpatient-common`
- `guide-outpatient-leejaehwan`
- `guide-outpatient-parkhyunwoong`
- `guide-outpatient-kwonheejin`

#### DEF 심혈관조영실
- `guide-pci-common`
- `guide-pci-seongsw`

### 2주차 월요일 (세종)
#### ABC 외래참관
- `guide-outpatient-common`
- `guide-sejong-special`
- `guide-outpatient-kimminsu`

#### DEF 외래참관
- `guide-outpatient-common`
- `guide-sejong-special`
- `guide-outpatient-hwangwonmuk`

### 2주차 화요일 (세종)
#### ABC/DEF PCI 참관
- `guide-pci-common`
- `guide-sejong-special`
- `guide-pci-nojaehyung-placeholder`

### 2주차 수요일 (세종)
#### ABC 부정맥 시술 참관
- `guide-pci-common`
- `guide-sejong-special`
- `guide-pci-kimtaeseok`

#### 심초음파의 이해
- `guide-outpatient-ohjingyeong`

### 2주차 목요일 13:30–16:00 ABC 외래 참관(예진)
- `guide-outpatient-common`
- `guide-outpatient-ankytaek`
- `guide-outpatient-parkhyunwoong`
- `guide-outpatient-seongsw`

---

## 7. 주말 공지 처리 규칙

- 일요일 공지는 월요일 밑으로 밀어넣지 않는다.
- 실제 일요일 날짜의 untimed event로 둔다.
- 월요일 day reminder에는 `전날 공지/문자 완료 여부 확인`만 짧게 carry-over 한다.

예:
- 일요일: `주말 공지 · 세종 집합 안내`
- 월요일 reminder: `세종 집합 9:30 / 명찰 / 김민수 교수님 문자 확인 완료 여부`

---

## 8. 다음 단계

### step 1
이 문서를 기준으로 cardiology용 content handoff md 초안 생성

### step 2
cardiology planner packet / bundle skeleton 생성
- `meta`
- `global_rules`
- `fixed_info`
- `sessions`
- `day_reminders`
- `analysis_appendix.guide_packs`

### step 3
1주차 월요일부터 session.sections를 실제 텍스트로 채우기

### step 4
untimed communication event를 실제 session row로 넣기
- type = `chief` / `admin`
- `time_label` = `시간 미정`
- `start_time` = ``

### step 5
각 timed session에 `guide_pack_ids` 또는 동등 참조 필드 연결

---

## 9. 현재 판단 요약

- 공지/문자 = 날짜 하단 untimed chief/admin 이벤트
- PCI/외래 = 해당 일정 카드 상세 패널 guide pack
- 일요일 공지는 일요일에 그대로 배치
- 월요일에는 체크 리마인드만 남김
- HTML 셸은 건드리지 않고 bundle JSON 중심으로 해결
