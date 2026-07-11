'use strict';

const crypto = require('node:crypto');
const querystring = require('node:querystring');

const HANDOFF_KEY = 'cpxGoogleRedirectCredential.v1';

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  }
  return out;
}

async function requestBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (Buffer.isBuffer(req.body)) return querystring.parse(req.body.toString('utf8'));
  if (typeof req.body === 'string') return querystring.parse(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return querystring.parse(Buffer.concat(chunks).toString('utf8'));
}

function sameToken(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function page(title, message, script = '') {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8f0dc;color:#102448;font:16px -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif}.card{max-width:520px;margin:24px;padding:28px;border:1px solid #ddcfad;border-radius:24px;background:#fffaf0;box-shadow:0 20px 50px #5d43151f}a{color:#a72b20;font-weight:700}</style></head><body><main class="card"><h1>${title}</h1><p>${message}</p><p><a href="/">로그인 화면으로 돌아가기</a></p></main>${script}</body></html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send(page('Google 로그인 요청 오류', '이 주소는 Google 로그인 완료 요청만 받습니다.'));
  }

  const body = await requestBody(req);
  const cookieToken = parseCookies(req.headers?.cookie || '').g_csrf_token;
  const bodyToken = body.g_csrf_token;
  if (!sameToken(cookieToken, bodyToken)) {
    return res.status(403).send(page('Google 로그인 보안 확인 실패', '로그인 확인값이 일치하지 않습니다. 로그인 화면에서 다시 시도해주세요.'));
  }

  const credential = String(body.credential || '');
  if (!credential || credential.length > 16000 || credential.split('.').length !== 3) {
    return res.status(400).send(page('Google 로그인 응답 오류', 'Google 계정 응답을 확인할 수 없습니다. 로그인 화면에서 다시 시도해주세요.'));
  }

  const payload = Buffer.from(JSON.stringify({ credential, receivedAt: Date.now() }), 'utf8').toString('base64');
  const script = `<script>(function(){var value=atob(${JSON.stringify(payload)}),saved=false;try{sessionStorage.setItem(${JSON.stringify(HANDOFF_KEY)},value);saved=true}catch(error){}try{localStorage.setItem(${JSON.stringify(HANDOFF_KEY)},value);saved=true}catch(error){}if(saved)location.replace('/?google_redirect=1');else document.querySelector('main').insertAdjacentHTML('beforeend','<p>Safari 저장소에 로그인 결과를 보관하지 못했습니다. 새 탭에서 다시 시도해주세요.</p>')})();</script>`;
  return res.status(200).send(page('Google 로그인 확인 완료', 'CPX 대본 화면으로 이동하고 있습니다.', script));
};

module.exports._test = { parseCookies, sameToken, requestBody, HANDOFF_KEY };
