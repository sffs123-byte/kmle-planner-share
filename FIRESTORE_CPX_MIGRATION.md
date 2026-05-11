# CPX 대본 공유보드 Firestore 이주 계획

## 목표
Supabase `planner_user_state` 전체-state 저장을 중단하고, Firestore에 CPX 대본을 CC별 문서로 저장한다.

## Firestore 무료 한도 공식 기준
- Stored data: 1 GiB
- Document reads: 50,000/day
- Document writes: 20,000/day
- Document deletes: 20,000/day
- Outbound data transfer: 10 GiB/month
- quota reset: Pacific time 자정 전후

## 데이터 구조
```text
cpxBoards/gangryeol-main
  boardId
  owner
  userId
  version
  topics[]
  categories[]
  selectedId
  updatedAt
  updatedBy

cpxBoards/gangryeol-main/scripts/{ccId}
  topicId
  boardId
  overview
  history
  pe
  education
  differentials
  coreDiseases
  script
  references
  updatedAt
  updatedBy
```

## 왜 CC별 문서인가
- 기존 Supabase 구조처럼 전체 state를 통째 저장하면 수정 1회마다 100KB+ 단위 전송이 발생한다.
- Firestore는 문서 read/write 단위 과금이므로, 현재 선택한 CC 문서만 listen/save하는 구조가 유리하다.
- 58개 CC 전체 이주는 58 writes + board meta 1 write 정도로 충분히 작다.

## 보안 원칙
- Firebase Auth Google 로그인 사용.
- Firestore Rules에서 `request.auth.token.email == 'sffs123@gmail.com'`만 허용.
- API key는 클라이언트에 공개되는 Firebase web config 값이므로 비밀로 보지 않는다. 보안은 Rules가 담당한다.

## Firebase Console 설정 순서
1. Firebase Console에서 새 프로젝트 생성: 예) `cpx-script-board`
2. Build > Firestore Database 생성
   - mode: Production mode
   - location: 가능하면 asia-northeast3 또는 가까운 리전
3. Build > Authentication > Sign-in method
   - Google provider enable
   - Authorized domains에 GitHub Pages 도메인 추가: `sffs123-byte.github.io`
4. Project settings > General > Your apps
   - Web app 추가
   - firebaseConfig 복사
5. `cpx-script-board-firestore.html`의 `FIREBASE_CONFIG`에 붙여넣기
6. Firestore Rules에 `firestore.rules.cpx` 내용 적용
7. GitHub Pages 배포
8. 기존 CPX 보드가 열리는 기기에서 Firestore 버전 접속
9. Google 로그인
10. JSON 백업 한 번 다운로드
11. `Firestore 전체 이주` 클릭
12. iPad/다른 기기에서 같은 Google 계정 로그인 후 동기화 확인

## 현재 생성 파일
- `cpx-script-board-firestore.html`: Firestore 이주용 별도 HTML. live Supabase 파일은 아직 건드리지 않음.
- `firestore.rules.cpx`: 소유자 이메일 제한 Firestore Rules.

## 2026-05-11 실제 생성 상태
- Firebase/GCP project created: `cpx-script-board-20260511`
- Firebase project attached: 완료
- Web app created: `CPX Script Board Web`
- Firestore database: `(default)`, `asia-northeast3`, Native mode, freeTier true, Realtime enabled
- Firestore Rules deployed: `cloud.firestore` release points to owner-email ruleset
- `cpx-script-board-firestore.html`에 Firebase web config 삽입 완료

## 2026-05-11 추가 진행 상태
- Firestore Rules 확인 완료: `cloud.firestore` release가 `sffs123@gmail.com` owner-email ruleset을 가리킨다.
- Mac mini의 OpenClaw / OpenAI Atlas / Google Chrome 프로필을 다시 좁혀 검색했지만, authoritative Local Storage key `cpx-script-board-state.v1`는 발견되지 않았다.
  - 발견된 것은 대부분 cached HTML/JS, Service Worker cache, History, File System cache, 또는 새 Firestore 페이지 접속으로 생긴 `cpx-script-device.v1`뿐이다.
- 그래서 우선 `cpx-script-board-firestore.html` 안의 seed-data snapshot을 Firestore에 서버 OAuth로 직접 적재했다.
  - Board doc: `cpxBoards/gangryeol-main`
  - Script docs: `cpxBoards/gangryeol-main/scripts/{ccId}`
  - Count: 58 scripts + 1 board doc = 59 writes
  - Commit time: `2026-05-11T05:23:31.190884Z`
  - Local backup: `.tmp/cpx-script-board-firestore-seed-backup-20260511T142329.json`

## 남은 blocker
CLI/API로 Google provider를 켜려고 했지만 Identity Toolkit API가 `BILLING_NOT_ENABLED` / `CONFIGURATION_NOT_FOUND`로 막혔다.
무료 Firebase Auth 자체는 콘솔에서 가능하므로 아래만 수동 또는 로그인 브라우저에서 처리하면 된다.

1. <https://console.firebase.google.com/project/cpx-script-board-20260511/authentication/providers>
2. Authentication 시작/Get started
3. Sign-in method에서 Google provider Enable
4. Support email: `sffs123@gmail.com`
5. Authorized domains에 `sffs123-byte.github.io`가 없으면 추가

이후 GitHub Pages에서 `cpx-script-board-firestore.html`를 열고 Google 로그인하면, 이미 Firestore에 올라간 seed snapshot을 읽을 수 있다. 단, seed 이후에 Supabase/localStorage에만 남은 미동기화 편집본이 따로 있었다면, 그 편집본은 아직 별도 복구가 필요하다.
