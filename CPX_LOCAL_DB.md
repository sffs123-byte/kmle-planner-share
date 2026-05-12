# CPX Script Board — Local DB Mode

Supabase 없이 Mac mini에서 CPX 대본 공유보드를 돌리는 로컬 DB 모드입니다.

## Files

- `cpx-local-server.js` — Node HTTP server + SQLite + SSE realtime
- `cpx-script-board-local.html` — Supabase 제거, local API/SSE로 동작하는 보드
- `.local/cpx-local.sqlite` — 런타임에 생성되는 SQLite DB. Git에 올리지 않음.

## Run

Set a shared password with `CPX_BOARD_PASSWORD`. The server rejects login if no password is configured.

```bash
cd /Users/sffs123gmail.com/.openclaw/workspace/kmle-planner-share
CPX_BOARD_PASSWORD='새공유비밀번호' CPX_LOCAL_PORT=8797 node cpx-local-server.js
```

Or:

```bash
CPX_BOARD_PASSWORD='새공유비밀번호' ./start-cpx-local.sh
```

Open:

```text
http://127.0.0.1:8797/
```

Same page aliases:

```text
http://127.0.0.1:8797/cpx
http://127.0.0.1:8797/cpx-local
http://127.0.0.1:8797/cpx-script-board-local.html
```

## API

```bash
curl http://127.0.0.1:8797/api/health
curl 'http://127.0.0.1:8797/api/state?user_id=gangryeol-cpx-scripts'
curl 'http://127.0.0.1:8797/api/export?user_id=gangryeol-cpx-scripts' > cpx-backup.json
```

## Login + Realtime + Presence

- Login endpoint: `POST /api/login`
- Login uses a nickname plus shared password.
- API calls use a bearer token after login.
- Browser clients connect to SSE with a session token:

```text
/api/events?user_id=gangryeol-cpx-scripts&token=...
```

The server uses SSE. When one browser saves, other open browsers pull the new state and re-render.

Presence/soft lock:

- When a user focuses or types in a CC field, the browser posts `/api/presence`.
- Other browsers show `수정 중: {nickname}` next to that CC.
- If another user opens the same CC, a warning banner appears.
- This is a soft lock: users can still edit, but they are warned.

## External access later

Cloudflare Tunnel can expose the same local server. The HTML uses same-origin `/api/...`, so if the tunnel points to `http://127.0.0.1:8797`, both page and API work through the same URL.

Quick tunnel example:

```bash
cloudflared tunnel --url http://127.0.0.1:8797
```

When serving the HTML from GitHub Pages, set `DEFAULT_API_BASE` in `cpx-script-board-local.html` to the Cloudflare Tunnel URL, or open the page with `?api=https://...trycloudflare.com`.

Use a named tunnel/domain later if this becomes the real production path. Quick tunnel URLs can change when `cloudflared` restarts.

## Current limits

- Saves the whole board state as one JSON blob.
- Soft lock warns about simultaneous editing, but does not forcibly block edits.
- Last write wins if two people ignore the warning and edit/save the exact same CC at the same time.
- `state_history` table keeps snapshots for recovery, but the UI does not yet expose history/restore.

Next hardening step: per-CC history/restore UI and optional force-lock mode.
