(function () {
  'use strict';

  const MODAL_ID = 'cpxCloudModal';
  const STYLE_ID = 'cpxCloudStyle';
  const PAGE_MOUNT_ID = 'cpxCloudPageMount';
  const PAGE_ROOT_ID = 'cpxCloudPageRoot';
  const state = {
    path: '/',
    entries: [],
    status: null,
    busy: false,
    error: '',
    selected: new Set(),
    dragging: false,
  };
  const AUTH_WAIT_MS = 5000;
  const AUTH_WAIT_INTERVAL_MS = 120;

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[ch]));
  }
  function apiPath(path) {
    return typeof window.localApiUrl === 'function' ? window.localApiUrl(path) : path;
  }
  function apiHeaders(extra) {
    return typeof window.localHeaders === 'function' ? window.localHeaders(extra || {}) : (extra || {});
  }
  function authToken() {
    const headers = apiHeaders();
    const raw = headers.authorization || headers.Authorization || '';
    const match = String(raw).match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : '';
  }
  function downloadApiUrl(endpoint, params = []) {
    const url = new URL(apiPath(endpoint), window.location.href);
    const items = Array.isArray(params) ? params : Object.entries(params);
    for (const [key, value] of items) {
      if (value !== undefined && value !== null) url.searchParams.append(key, value);
    }
    const token = authToken();
    if (token) url.searchParams.set('token', token);
    return url.toString();
  }
  function startBrowserDownload(href, filename) {
    const a = document.createElement('a');
    a.href = href;
    if (filename) a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function notify(message) {
    if (typeof window.toast === 'function') window.toast(message);
  }
  function fmtBytes(bytes) {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = n;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
  }
  function dirname(path) {
    const parts = String(path || '/').split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/');
  }
  function childPath(parent, name) {
    return '/' + [String(parent || '/').split('/').filter(Boolean).join('/'), name].filter(Boolean).join('/');
  }
  function tokenReady() {
    return typeof window.localDbAvailable === 'function' ? Boolean(window.localDbAvailable()) : true;
  }
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  function renderCloudMessage(title, body) {
    const list = byId('cpxCloudList');
    const usage = byId('cpxCloudUsage');
    const sub = byId('cpxCloudSub');
    const fill = byId('cpxCloudFill');
    if (fill) fill.style.width = '0%';
    if (usage) usage.textContent = title;
    if (sub) sub.textContent = body || title;
    if (list) {
      list.innerHTML = `<div class="cpxCloudEmpty"><b>${esc(title)}</b>${body ? `<br>${esc(body)}` : ''}</div>`;
    }
  }
  async function waitForTokenReady() {
    const started = Date.now();
    while (!tokenReady() && Date.now() - started < AUTH_WAIT_MS) {
      renderCloudMessage('로그인 확인 중', '계정 확인이 끝나면 CPX Cloud를 자동으로 불러옵니다.');
      await sleep(AUTH_WAIT_INTERVAL_MS);
    }
    return tokenReady();
  }

  function ensureStyle() {
    if (byId(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.cpxCloudOpenBtn{box-shadow:0 10px 28px rgba(37,74,145,.18)}
.cpxCloudModal{z-index:95;background:rgba(18,23,31,.48);backdrop-filter:blur(3px)}
.cpxCloudWindow{width:min(1120px,96vw);height:min(760px,88vh);background:#f7f8fb;border:1px solid #d8dee8;border-radius:20px;box-shadow:0 28px 90px rgba(15,23,42,.28);overflow:hidden;display:grid;grid-template-rows:auto 1fr;color:#182235}
.cpxCloudTop{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 16px;border-bottom:1px solid #d9e0ea;background:linear-gradient(180deg,#fff,#f2f4f8)}
.cpxCloudTitle{display:flex;align-items:center;gap:11px;min-width:0}.cpxCloudGlyph{width:36px;height:36px;border-radius:10px;background:#172033;color:#fff;display:grid;place-items:center;font-weight:950}.cpxCloudTitle h2{margin:0;font-size:20px;letter-spacing:0}.cpxCloudTitle .sub{margin:2px 0 0;font-size:12px;color:#667085;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpxCloudActions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.cpxCloudActions .btn{padding:8px 12px;border-radius:999px}.cpxCloudActions .primary{background:#254a91}.cpxCloudHidden{display:none!important}.cpxCloudSelectedAction{background:#172033!important;color:#fff!important}
.cpxCloudBody{min-height:0;background:#fbfcfe}
.cpxCloudMain{min-width:0;min-height:0;height:100%;display:grid;grid-template-rows:auto auto 1fr}.cpxCloudMeter{display:grid;gap:8px;padding:12px 16px;border-bottom:1px solid #edf1f6;background:#fbfcfe}.cpxCloudMeterHead{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}.cpxCloudMeterLabel{font-size:12px;font-weight:900;color:#667085;white-space:nowrap}.cpxCloudBar{height:7px;background:#e5ebf3;border-radius:999px;overflow:hidden}.cpxCloudFill{height:100%;width:0;background:#254a91;border-radius:inherit}.cpxCloudUsage{display:flex;align-items:baseline;justify-content:flex-end;gap:8px;flex-wrap:wrap;text-align:right;color:#536174}.cpxCloudUsageMain{font-size:14px;font-weight:950;color:#253550;white-space:nowrap}.cpxCloudUsageMeta{font-size:12px;font-weight:850;white-space:nowrap}
.cpxCloudCrumbs{display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid #edf1f6;background:#fff}.cpxCloudCrumbs button{border:0;background:transparent;color:#334155;border-radius:8px;padding:5px 8px;font-size:12px;font-weight:850;cursor:pointer}.cpxCloudCrumbs button:hover{background:#f0f4f9}.cpxCloudCrumbs .current{background:#172033;color:#fff}
	.cpxCloudList{min-height:0;overflow:auto;padding:26px;display:grid;grid-template-columns:repeat(auto-fill,minmax(142px,1fr));grid-auto-rows:minmax(156px,auto);align-content:start;gap:18px 16px}.cpxCloudRow{position:relative;min-width:0;display:flex;flex-direction:column;align-items:center;text-align:center;border:1px solid transparent;border-radius:14px;padding:12px 8px 10px;background:transparent;cursor:default}.cpxCloudRow:hover,.cpxCloudRow:focus-within{background:#edf4ff;border-color:#d6e4f7}.cpxCloudRow.isSelected{background:#eaf2ff;border-color:#7aa7e8;box-shadow:0 0 0 3px rgba(37,99,235,.13)}.cpxCloudRow.isPopular{background:#fffaf0;border-color:#d7a53f;box-shadow:0 0 0 3px rgba(215,165,63,.14)}.cpxCloudRow.isPopular:hover,.cpxCloudRow.isPopular:focus-within{background:#fff6df;border-color:#c99227}.cpxCloudSelectBtn{position:absolute;left:8px;top:8px;width:25px;height:25px;border-radius:999px;border:1px solid #bdc9da;background:#fff;color:#254a91;font-size:14px;font-weight:950;line-height:1;display:grid;place-items:center;cursor:pointer;opacity:.72}.cpxCloudSelectBtn:hover,.cpxCloudSelectBtn.selected{opacity:1;background:#254a91;color:#fff;border-color:#254a91}.cpxCloudIcon{position:relative;width:82px;height:60px;margin:0 auto 12px;border-radius:8px;display:grid;place-items:center;background:linear-gradient(180deg,#60a5fa,#2563eb);box-shadow:0 12px 24px rgba(37,99,235,.18),inset 0 1px 0 rgba(255,255,255,.38);color:#fff;font-size:12px;font-weight:950;letter-spacing:.03em}.cpxCloudIcon.folder:before{content:'';position:absolute;left:8px;top:-9px;width:34px;height:16px;border-radius:7px 7px 0 0;background:#7bb8ff}.cpxCloudIcon.file{width:58px;height:72px;border:1px solid #d8dee9;border-radius:9px;background:#fff;color:#254a91;box-shadow:0 12px 24px rgba(15,23,42,.1);overflow:hidden}.cpxCloudRow.isPopular .cpxCloudIcon.file{border-color:#d7a53f;box-shadow:0 14px 28px rgba(154,90,0,.14)}.cpxCloudIcon.file:before{content:'';position:absolute;right:-1px;top:-1px;border-top:18px solid #e9eef7;border-left:18px solid transparent}.cpxCloudIcon.file span{position:absolute;left:8px;bottom:9px;padding:3px 5px;border-radius:5px;background:#254a91;color:#fff;font-size:10px;line-height:1;font-weight:950}
	.cpxCloudName{width:100%;font-weight:900;color:#172033;line-height:1.24;font-size:13px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}.cpxCloudMeta{font-size:11px;color:#667085;margin-top:5px;line-height:1.25}.cpxCloudLikeLine{margin-top:5px;font-size:11px;font-weight:950;color:#667085;line-height:1}.cpxCloudLikeLine.liked{color:#9a5a00}.cpxCloudRowActions{display:flex;gap:6px;justify-content:center;margin-top:9px;opacity:0;transform:translateY(3px);transition:opacity .14s ease,transform .14s ease}.cpxCloudRow:hover .cpxCloudRowActions,.cpxCloudRow:focus-within .cpxCloudRowActions{opacity:1;transform:translateY(0)}.cpxCloudIconBtn{min-width:0;height:28px;border:1px solid #cbd6e5;border-radius:999px;background:#fff;color:#253550;font-size:11px;font-weight:900;white-space:nowrap;padding:0 10px;cursor:pointer}.cpxCloudIconBtn:hover{background:#172033;color:#fff;border-color:#172033}.cpxCloudIconBtn.like.liked{background:#fff6df;color:#9a5a00;border-color:#e6bf66}.cpxCloudIconBtn.like:hover{background:#9a5a00;color:#fff;border-color:#9a5a00}.cpxCloudIconBtn.danger:hover{background:#bd3d34;border-color:#bd3d34}
.cpxCloudEmpty,.cpxCloudOffline{grid-column:1/-1;margin:10px;border:1px dashed #cbd7e8;border-radius:16px;background:#fff;padding:22px;color:#66758f;line-height:1.55}.cpxCloudOffline b{color:#172033}.cpxCloudFileInput{display:none}.cpxCloudDropHint{display:none;position:absolute;inset:70px 18px 18px;z-index:6;border:2px dashed #254a91;border-radius:18px;background:rgba(247,250,255,.92);place-items:center;color:#172033;font-size:18px;font-weight:950;box-shadow:inset 0 0 0 4px rgba(37,74,145,.08)}.cpxCloudWindow.isDragging .cpxCloudDropHint{display:grid}
.cpxCloudPageRoot .cpxCloudWindow{width:100%;height:min(760px,calc(100vh - 202px));border-radius:20px;box-shadow:0 22px 64px rgba(15,23,42,.13)}
.cpxCloudPageRoot .cpxCloudTop{padding:13px 16px}.cpxCloudPageRoot .cpxCloudCloseOnly{display:none}
@media(max-width:760px){.cpxCloudWindow{width:100vw;height:100dvh;border-radius:0}.cpxCloudTop{align-items:flex-start}.cpxCloudTitle .sub{white-space:normal}.cpxCloudMeterHead{align-items:flex-start;flex-direction:column;gap:4px}.cpxCloudUsage{justify-content:flex-start;text-align:left}.cpxCloudList{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(152px,auto);padding:16px;gap:12px}.cpxCloudRowActions{opacity:1;transform:none}.cpxCloudActions .btn{min-height:40px}.cpxCloudIcon{width:74px;height:54px}.cpxCloudIcon.file{width:52px;height:66px}.cpxCloudDropHint{inset:86px 12px 12px}}
`;
    document.head.appendChild(style);
  }

  function cloudMarkup(closeClass) {
    return `
<div class="cpxCloudWindow" role="region" aria-labelledby="cpxCloudHeading">
  <div class="cpxCloudTop">
    <div class="cpxCloudTitle">
      <div class="cpxCloudGlyph">C</div>
      <div><h2 id="cpxCloudHeading">CPX Cloud</h2><p class="sub" id="cpxCloudSub">국시 실기 자료 공유함</p></div>
    </div>
    <div class="cpxCloudActions">
      <button class="btn" type="button" id="cpxCloudRetry" title="다시 불러오기">다시 불러오기</button>
      <button class="btn cpxCloudSelectedAction cpxCloudHidden" type="button" id="cpxCloudDownloadSelected" title="선택 다운로드">선택 다운로드</button>
      <button class="btn cpxCloudSelectedAction cpxCloudHidden" type="button" id="cpxCloudMoveSelected" title="선택 이동">선택 이동</button>
      <button class="btn cpxCloudHidden" type="button" id="cpxCloudClearSelection" title="선택 해제">선택 해제</button>
      <button class="btn" type="button" id="cpxCloudNewFolder" title="새 폴더">새 폴더</button>
      <button class="btn primary" type="button" id="cpxCloudUpload" title="파일 업로드">업로드</button>
      <button class="btn ghost ${closeClass || ''}" type="button" id="cpxCloudClose" title="닫기">닫기</button>
    </div>
  </div>
  <div class="cpxCloudBody">
    <main class="cpxCloudMain">
      <div class="cpxCloudMeter"><div class="cpxCloudMeterHead"><div class="cpxCloudMeterLabel">저장소 사용량</div><div class="cpxCloudUsage" id="cpxCloudUsage">연결 확인 중</div></div><div class="cpxCloudBar"><div class="cpxCloudFill" id="cpxCloudFill"></div></div></div>
      <div class="cpxCloudCrumbs" id="cpxCloudCrumbs"></div>
      <div class="cpxCloudList" id="cpxCloudList"></div>
    </main>
  </div>
  <input class="cpxCloudFileInput" id="cpxCloudFileInput" type="file" multiple>
  <div class="cpxCloudDropHint" id="cpxCloudDropHint">현재 폴더에 업로드</div>
</div>`;
  }

  function bindCloudControls(root, mode) {
    if (!root || root.dataset.cloudBound === '1') return;
    root.dataset.cloudBound = '1';
    byId('cpxCloudClose')?.addEventListener('click', closeCloud);
    byId('cpxCloudRetry')?.addEventListener('click', () => loadCloud(state.path || '/', { skipEnsure: mode === 'page' }));
    byId('cpxCloudDownloadSelected')?.addEventListener('click', downloadSelected);
    byId('cpxCloudMoveSelected')?.addEventListener('click', moveSelected);
    byId('cpxCloudClearSelection')?.addEventListener('click', clearSelection);
    byId('cpxCloudNewFolder')?.addEventListener('click', createFolder);
    byId('cpxCloudUpload')?.addEventListener('click', () => byId('cpxCloudFileInput')?.click());
    byId('cpxCloudFileInput')?.addEventListener('change', uploadSelectedFiles);
    const win = root.querySelector('.cpxCloudWindow') || root;
    win.addEventListener('dragenter', handleDragOver);
    win.addEventListener('dragover', handleDragOver);
    win.addEventListener('dragleave', handleDragLeave);
    win.addEventListener('drop', handleDrop);
  }

  function ensureModal() {
    ensureStyle();
    if (byId(MODAL_ID)) return byId(MODAL_ID);
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'modal cpxCloudModal hidden';
    modal.innerHTML = cloudMarkup('');
    document.body.appendChild(modal);
    bindCloudControls(modal, 'modal');
    modal.addEventListener('click', event => {
      if (event.target === modal) closeCloud();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeCloud();
    });
    return modal;
  }

  function ensurePage() {
    ensureStyle();
    const mount = byId(PAGE_MOUNT_ID);
    if (!mount) return null;
    if (!byId(PAGE_ROOT_ID)) {
      mount.innerHTML = `<div class="cpxCloudPageRoot" id="${PAGE_ROOT_ID}">${cloudMarkup('cpxCloudCloseOnly')}</div>`;
      bindCloudControls(byId(PAGE_ROOT_ID), 'page');
    }
    return byId(PAGE_ROOT_ID);
  }

  function navigateCloudPage() {
    if (typeof window.showCloudWorkspace === 'function') {
      window.showCloudWorkspace();
      return;
    }
    if (location.protocol.startsWith('http')) location.href = '/cpx_cloud';
    else location.hash = '/cloud';
  }

  function installButton() {
    const nav = byId('cpxCloudNavBtn');
    if (nav) {
      if (nav.dataset.cloudBound !== '1') {
        nav.dataset.cloudBound = '1';
        nav.addEventListener('click', openCloud);
      }
      return;
    }
    if (typeof window.showCloudWorkspace === 'function') return;
    if (byId('cpxCloudOpenBtn')) return;
    const actions = document.querySelector('.homeAppNav') || document.querySelector('.home-actions');
    if (!actions) return;
    const btn = document.createElement('button');
    btn.id = 'cpxCloudOpenBtn';
    btn.className = 'btn primary cpxCloudOpenBtn';
    btn.type = 'button';
    btn.textContent = actions.classList.contains('homeAppNav') ? 'CLOUD' : '클라우드 열기';
    btn.title = 'CPX Cloud 열기';
    btn.addEventListener('click', openCloud);
    const anchor = actions.classList.contains('homeAppNav') ? byId('openQuizBtn') : byId('syncState');
    actions.insertBefore(btn, anchor || null);
  }

  function renderStatus() {
    const status = state.status || {};
    const fill = byId('cpxCloudFill');
    const usage = byId('cpxCloudUsage');
    const sub = byId('cpxCloudSub');
    if (!fill || !usage || !sub) return;
    const capacity = Number(status.capacityBytes || 0);
    const used = Number(status.usedBytes || 0);
    const rawPct = capacity ? Math.min(100, (used / capacity) * 100) : 0;
    const pctText = rawPct > 0 && rawPct < 1 ? `${Math.max(rawPct, 0.1).toFixed(1)}%` : `${Math.round(rawPct)}%`;
    const fillPct = rawPct > 0 && rawPct < 0.5 ? 0.5 : rawPct;
    fill.style.width = `${fillPct}%`;
    if (status.mounted) {
      usage.innerHTML = `<span class="cpxCloudUsageMain">${fmtBytes(status.activeBytes)} / ${fmtBytes(capacity)}</span> <span class="cpxCloudUsageMeta">${pctText} 사용 · 파일당 ${fmtBytes(status.maxFileBytes)}</span>`;
      sub.textContent = `현재 ${state.path}`;
    } else {
      usage.textContent = 'Mac mini 또는 SSD 연결 대기';
      sub.textContent = '일시적으로 오프라인';
    }
  }

  function renderSide() {
    return;
  }

  function renderCrumbs() {
    const el = byId('cpxCloudCrumbs');
    if (!el) return;
    const parts = String(state.path || '/').split('/').filter(Boolean);
    let acc = '';
    const items = [`<button type="button" data-path="/" class="${parts.length ? '' : 'current'}">CPX Cloud</button>`];
    parts.forEach((part, idx) => {
      acc += '/' + part;
      items.push(`<button type="button" data-path="${esc(acc)}" class="${idx === parts.length - 1 ? 'current' : ''}">${esc(part)}</button>`);
    });
    el.innerHTML = items.join('');
    el.querySelectorAll('[data-path]').forEach(btn => btn.addEventListener('click', () => loadCloud(btn.dataset.path || '/')));
  }

  function extLabel(name) {
    const ext = String(name || '').split('.').pop();
    return ext && ext.length <= 5 ? ext.toUpperCase() : 'FILE';
  }
  function likeCount(ent) {
    const count = Number(ent?.likeCount || 0);
    return Number.isFinite(count) && count > 0 ? count : 0;
  }
  function likeMark(ent) {
    return ent?.likedByMe ? '♥' : '♡';
  }
  function visibleSelectedPaths() {
    const visible = new Set((state.entries || []).map(ent => ent.path));
    return Array.from(state.selected || []).filter(path => visible.has(path));
  }
  function pruneSelection() {
    const keep = new Set((state.entries || []).map(ent => ent.path));
    Array.from(state.selected || []).forEach(path => {
      if (!keep.has(path)) state.selected.delete(path);
    });
  }
  function renderSelectionControls() {
    const paths = visibleSelectedPaths();
    const dl = byId('cpxCloudDownloadSelected');
    const move = byId('cpxCloudMoveSelected');
    const clear = byId('cpxCloudClearSelection');
    if (!dl || !move || !clear) return;
    dl.classList.toggle('cpxCloudHidden', !paths.length);
    move.classList.toggle('cpxCloudHidden', !paths.length);
    clear.classList.toggle('cpxCloudHidden', !paths.length);
    dl.textContent = paths.length ? `${paths.length}개 다운로드` : '선택 다운로드';
    move.textContent = paths.length ? `${paths.length}개 이동` : '선택 이동';
  }
  function clearSelection() {
    state.selected.clear();
    renderAll();
  }
  function toggleSelection(path) {
    if (!path) return;
    if (state.selected.has(path)) state.selected.delete(path);
    else state.selected.add(path);
    renderAll();
  }

  function renderList() {
    const list = byId('cpxCloudList');
    if (!list) return;
    pruneSelection();
    if (state.error) {
      list.innerHTML = `<div class="cpxCloudOffline"><b>클라우드가 잠시 닫혀 있습니다.</b><br>${esc(state.error)}<br>Mac mini가 켜지고 SSD가 마운트되면 이 화면에서 다시 불러오면 됩니다. 계속 비어 있으면 페이지를 새로고침해주세요.</div>`;
      return;
    }
    if (!state.entries.length) {
      list.innerHTML = '<div class="cpxCloudEmpty">아직 파일이 없습니다. 업로드 버튼으로 자료를 올리면 여기에 표시됩니다.</div>';
      return;
    }
    list.innerHTML = state.entries.map(ent => {
      const likes = likeCount(ent);
      const liked = Boolean(ent.likedByMe);
      const isFile = ent.type === 'file';
      const popular = isFile && likes >= 5;
      const selected = state.selected.has(ent.path);
      const deleteButton = ent.canDelete ? '<button class="cpxCloudIconBtn danger delete" type="button" title="휴지통으로 이동">삭제</button>' : '';
      return `
	<div class="cpxCloudRow${popular ? ' isPopular' : ''}${selected ? ' isSelected' : ''}" data-path="${esc(ent.path)}" data-type="${esc(ent.type)}" data-name="${esc(ent.name)}">
	  <button class="cpxCloudSelectBtn ${selected ? 'selected' : ''}" type="button" title="선택" aria-pressed="${selected ? 'true' : 'false'}">${selected ? '✓' : ''}</button>
	  <div class="cpxCloudIcon ${isFile ? 'file' : 'folder'}">${isFile ? `<span>${esc(extLabel(ent.name))}</span>` : ''}</div>
	  <div><div class="cpxCloudName">${esc(ent.name)}</div><div class="cpxCloudMeta">${ent.type === 'folder' ? '폴더' : fmtBytes(ent.size)} · ${esc(new Date(ent.modifiedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }))}</div>${isFile ? `<div class="cpxCloudLikeLine ${liked ? 'liked' : ''}">${likeMark(ent)} ${likes}</div>` : ''}</div>
	  <div class="cpxCloudRowActions">
	    ${ent.type === 'folder' ? '<button class="cpxCloudIconBtn open" type="button" title="열기">열기</button><button class="cpxCloudIconBtn download" type="button" title="폴더 다운로드">다운로드</button>' : `<button class="cpxCloudIconBtn like ${liked ? 'liked' : ''}" type="button" title="좋아요" aria-pressed="${liked ? 'true' : 'false'}">${likeMark(ent)} ${likes}</button><button class="cpxCloudIconBtn download" type="button" title="다운로드">다운로드</button>`}
	    ${deleteButton}
	  </div>
	</div>`;
    }).join('');
    list.querySelectorAll('.cpxCloudRow').forEach(row => {
      const type = row.dataset.type;
      const path = row.dataset.path;
      row.querySelector('.cpxCloudSelectBtn')?.addEventListener('click', event => {
        event.stopPropagation();
        toggleSelection(path);
      });
      row.querySelector('.open')?.addEventListener('click', () => loadCloud(path));
      row.querySelector('.like')?.addEventListener('click', () => likeFile(path));
      row.querySelector('.download')?.addEventListener('click', () => downloadFile(path, row.dataset.name, type));
      row.querySelector('.delete')?.addEventListener('click', () => deleteEntry(path, row.dataset.name));
      row.addEventListener('dblclick', () => {
        if (type === 'folder') loadCloud(path);
        else downloadFile(path, row.dataset.name, type);
      });
    });
  }

  function renderAll() {
    renderStatus();
    renderSide();
    renderCrumbs();
    renderList();
    renderSelectionControls();
    document.querySelectorAll('.cpxCloudWindow').forEach(win => win.classList.toggle('isDragging', state.dragging));
  }

  async function requestJson(path, options) {
    const response = await fetch(apiPath(path), {
      ...options,
      headers: apiHeaders(options && options.headers ? options.headers : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function loadCloud(path, opts) {
    if (!opts || !opts.skipEnsure) ensureModal();
    state.busy = true;
    state.error = '';
    try {
      const data = await requestJson(`/api/cloud/list?path=${encodeURIComponent(path || '/')}`);
      state.path = data.path || path || '/';
      state.entries = data.entries || [];
      state.status = data.status || null;
      pruneSelection();
    } catch (error) {
      state.entries = [];
      state.error = error.message || String(error);
      try {
        state.status = await requestJson('/api/cloud/status');
      } catch {
        state.status = { mounted: false, capacityBytes: 300 * 1024 * 1024 * 1024, maxFileBytes: 200 * 1024 * 1024, seedFolders: [] };
      }
    } finally {
      state.busy = false;
      renderAll();
    }
  }

  async function openCloud() {
    const modal = ensureModal();
    modal.classList.remove('hidden');
    renderCloudMessage('클라우드 연결 준비 중', '잠시만 기다려주세요.');
    if (!await waitForTokenReady()) {
      renderCloudMessage('로그인 확인 필요', '홈 화면에서 로그인 상태가 확인되면 다시 불러오기를 눌러주세요. 계속 비어 있으면 페이지를 새로고침해주세요.');
      notify('로그인 후 클라우드를 열 수 있습니다');
      return;
    }
    renderAll();
    await loadCloud(state.path || '/');
  }

  async function openCloudPage() {
    if (!ensurePage()) {
      openCloud();
      return;
    }
    renderCloudMessage('클라우드 연결 준비 중', '잠시만 기다려주세요.');
    if (!await waitForTokenReady()) {
      renderCloudMessage('로그인 확인 필요', '홈 화면에서 로그인 상태가 확인되면 다시 불러오기를 눌러주세요. 계속 비어 있으면 페이지를 새로고침해주세요.');
      notify('로그인 후 클라우드를 열 수 있습니다');
      return;
    }
    renderAll();
    await loadCloud(state.path || '/', { skipEnsure: true });
  }

  function closeCloud() {
    byId(MODAL_ID)?.classList.add('hidden');
  }

  async function createFolder() {
    const name = window.prompt('새 폴더 이름');
    if (!name || !name.trim()) return;
    try {
      const data = await requestJson('/api/cloud/folder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: state.path, name: name.trim() }),
      });
      notify('폴더를 만들었습니다');
      state.entries = data.listing?.entries || state.entries;
      state.status = data.listing?.status || state.status;
      renderAll();
    } catch (error) {
      notify(error.message || '폴더 생성 실패');
    }
  }

  async function uploadSelectedFiles(event) {
    const input = event.target;
    const files = Array.from(input.files || []);
    input.value = '';
    await uploadFiles(files);
  }

  async function uploadFiles(files) {
    if (!files.length) return;
    const maxBytes = Number(state.status?.maxFileBytes || 200 * 1024 * 1024);
    for (const file of files) {
      if (file.size > maxBytes) {
        notify(`${file.name}은 파일당 ${fmtBytes(maxBytes)} 제한을 넘습니다`);
        continue;
      }
      const form = new FormData();
      form.append('path', state.path || '/');
      form.append('file', file, file.name);
      try {
        const response = await fetch(apiPath('/api/cloud/upload'), {
          method: 'POST',
          headers: apiHeaders(),
          body: form,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        state.entries = data.listing?.entries || state.entries;
        state.status = data.listing?.status || state.status;
        notify(`${file.name} 업로드 완료`);
      } catch (error) {
        notify(`${file.name} 업로드 실패: ${error.message || error}`);
      }
      renderAll();
    }
    await loadCloud(state.path || '/');
  }

  function handleDragOver(event) {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    state.dragging = true;
    renderAll();
  }

  function handleDragLeave(event) {
    const current = event.currentTarget;
    if (current && event.relatedTarget && current.contains(event.relatedTarget)) return;
    state.dragging = false;
    renderAll();
  }

  async function handleDrop(event) {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    state.dragging = false;
    renderAll();
    await uploadFiles(Array.from(event.dataTransfer.files || []));
  }

  async function deleteEntry(path, name) {
    if (!window.confirm(`${name || path}을 휴지통으로 이동할까요?`)) return;
    try {
      const data = await requestJson('/api/cloud/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      state.entries = data.listing?.entries || [];
      state.status = data.listing?.status || state.status;
      notify('휴지통으로 이동했습니다');
      renderAll();
    } catch (error) {
      notify(error.message || '삭제 실패');
    }
  }

  function normalizeDestinationPath(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    if (raw.startsWith('/')) return '/' + raw.split(/[\\/]+/).filter(Boolean).join('/');
    return childPath(state.path || '/', raw);
  }

  async function moveSelected() {
    const paths = visibleSelectedPaths();
    if (!paths.length) return;
    const selected = new Set(paths);
    const folders = (state.entries || [])
      .filter(ent => ent.type === 'folder' && !selected.has(ent.path))
      .map(ent => ent.name);
    const example = folders.length ? childPath(state.path || '/', folders[0]) : childPath(state.path || '/', '새 폴더');
    const hint = folders.length ? `\n현재 폴더 안 폴더: ${folders.slice(0, 8).join(', ')}${folders.length > 8 ? ' ...' : ''}` : '';
    const input = window.prompt(`이동할 폴더 경로를 입력하세요.\n예: ${example}${hint}`);
    const destinationPath = normalizeDestinationPath(input);
    if (!destinationPath) return;
    if (selected.has(destinationPath)) {
      notify('선택한 폴더 자신으로는 이동할 수 없습니다');
      return;
    }
    if (!window.confirm(`${paths.length}개 항목을 ${destinationPath}로 이동할까요?`)) return;
    try {
      const data = await requestJson('/api/cloud/move', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paths, destinationPath, currentPath: state.path || '/' }),
      });
      state.selected.clear();
      state.entries = data.listing?.entries || [];
      state.status = data.listing?.status || state.status;
      notify(`${data.moved?.length || paths.length}개 항목을 이동했습니다`);
      renderAll();
    } catch (error) {
      notify(error.message || '이동 실패');
    }
  }

  async function likeFile(path) {
    try {
      const data = await requestJson('/api/cloud/like', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      state.entries = data.listing?.entries || state.entries;
      state.status = data.listing?.status || state.status;
      notify(data.likedByMe ? '좋아요 표시했습니다' : '좋아요 취소했습니다');
      renderAll();
    } catch (error) {
      notify(error.message || '좋아요 실패');
    }
  }

  function downloadName(path, name, type) {
    const base = name || path.split('/').filter(Boolean).pop() || 'download';
    return type === 'folder' && !/\.zip$/i.test(base) ? `${base}.zip` : base;
  }

  async function downloadBlob(response, filename) {
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function downloadFile(path, name, type) {
    try {
      startBrowserDownload(
        downloadApiUrl('/api/cloud/download', { path }),
        downloadName(path, name, type)
      );
      notify('다운로드를 시작합니다');
    } catch (error) {
      notify(error.message || '다운로드 실패');
    }
  }

  async function downloadSelected() {
    const paths = visibleSelectedPaths();
    if (!paths.length) return;
    try {
      for (const itemPath of paths) {
        const ent = state.entries.find(entry => entry.path === itemPath) || {};
        startBrowserDownload(
          downloadApiUrl('/api/cloud/download', { path: itemPath }),
          downloadName(itemPath, ent.name, ent.type)
        );
      }
      notify(`${paths.length}개 다운로드를 시작합니다`);
    } catch (error) {
      notify(error.message || '선택 다운로드 실패');
    }
  }

  function boot() {
    installButton();
    const observer = new MutationObserver(installButton);
    observer.observe(document.body, { childList: true, subtree: true });
    window.openCpxCloudPage = openCloudPage;
    window.openCpxCloudModal = openCloud;
    const cloudPage = byId('cloudPage');
    if (cloudPage && !cloudPage.classList.contains('hidden')) void openCloudPage();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
