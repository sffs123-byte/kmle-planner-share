#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { applyPersonalOverlay, buildPersonalOverlay } = require('../cpx-personal-overlay');

const ROOT = path.resolve(__dirname, '..');
const HTML_FILES = ['index.html', 'cpx-a4-editor-local.html'];

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} missing`);
  const paramsOpen = source.indexOf('(', start);
  let paramsDepth = 0;
  let open = -1;
  for (let i = paramsOpen; i < source.length; i++) {
    if (source[i] === '(') paramsDepth += 1;
    else if (source[i] === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        open = source.indexOf('{', i + 1);
        break;
      }
    }
  }
  assert.notEqual(open, -1, `${name} body missing`);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} closing brace missing`);
}

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(String(key)) ? values.get(String(key)) : null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key)),
  };
}

for (const filename of HTML_FILES) {
  const html = fs.readFileSync(path.join(ROOT, filename), 'utf8');
  const names = [
    'quizProgressUserId',
    'quizProgressLocalKey',
    'quizOverrideLocalKey',
    'quizMigrationPendingKey',
    'markQuizMigrationPending',
    'quizMigrationPending',
    'clearQuizMigrationPending',
    'quizProgressTime',
    'mergeQuizProgressMaps',
    'readQuizProgressForCurrentUser',
    'mergeQuizFieldOverrideMaps',
    'primeQuizFieldOverrideCache',
    'readQuizFieldOverridesForCurrentUser',
  ];
  const localStorage = storage({
    'cpxA4QuizSrs.v1': JSON.stringify({ legacy: { reviews: 1, lastAt: '2026-07-11T01:00:00.000Z' } }),
  });
  const context = {
    currentUser: { id: 'user-a' },
    settings: { quizFieldOverrides: { '42': { fields: { C: 'A answer' } } }, quizProgress: {} },
    localStorage,
    QUIZ_PROGRESS_KEY: 'cpxA4QuizSrs.v1',
    QUIZ_PROGRESS_MIGRATION_KEY: 'cpxA4QuizSrsMigrationOwner.v2',
    QUIZ_OVERRIDE_CACHE_KEY: 'cpxA4QuizFieldOverrides.v1',
    QUIZ_OVERRIDE_MIGRATION_KEY: 'cpxA4QuizFieldOverridesMigrationOwner.v2',
    QUIZ_MIGRATION_PENDING_KEY: 'cpxA4QuizMigrationPending.v2',
    encodeURIComponent,
    JSON,
    Date,
  };
  context.readLocalJSON = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
  };
  vm.createContext(context);
  vm.runInContext(names.map(name => extractFunction(html, name)).join('\n'), context);

  const userAProgress = context.readQuizProgressForCurrentUser();
  assert.equal(userAProgress.legacy.reviews, 1, `${filename}: legacy progress not migrated`);
  assert.equal(context.quizMigrationPending(), true, `${filename}: legacy progress migration was not queued for server sync`);
  const userAAnswers = context.primeQuizFieldOverrideCache();
  assert.equal(userAAnswers['42'].fields.C, 'A answer', `${filename}: legacy answer not migrated`);

  context.currentUser = { id: 'user-b' };
  context.settings = { quizFieldOverrides: { '77': { fields: { C: 'B answer' } } }, quizProgress: { b: { reviews: 2, lastAt: '2026-07-11T02:00:00.000Z' } } };
  assert.deepEqual(Object.keys(context.readQuizProgressForCurrentUser()), [], `${filename}: user A progress leaked to user B local cache`);
  assert.deepEqual(Object.keys(context.primeQuizFieldOverrideCache()), [], `${filename}: user A answer leaked to user B local cache`);
  assert.equal(context.readQuizProgressForCurrentUser({ includeSettings: true }).b.reviews, 2, `${filename}: user B remote progress missing`);
  assert.equal(context.readQuizFieldOverridesForCurrentUser({ includeSettings: true })['77'].fields.C, 'B answer', `${filename}: user B remote answer missing`);

  const merged = context.mergeQuizProgressMaps(
    { card: { reviews: 1, updatedAt: '2026-07-11T01:00:00.000Z' } },
    { card: { reset: true, updatedAt: '2026-07-11T03:00:00.000Z' } },
  );
  assert.equal(merged.card.reset, true, `${filename}: newer reset tombstone lost`);
  assert.match(html, /markDirty\('퀴즈 복습 기록'\)/, `${filename}: quiz progress is not queued for personal sync`);
  assert.match(html, /saveQuizFieldOverridesLocal\(\)/, `${filename}: quiz answer edit is not cached per user`);
  assert.match(html, /_pullAllStateWithPersonalQuiz/, `${filename}: remote quiz hydration wrapper missing`);
}

const master = { docs: {}, settings: { quizFieldOverrides: {}, quizProgress: {} } };
const incomingA = {
  docs: {},
  settings: {
    quizFieldOverrides: { '42': { fields: { C: 'A answer' }, updatedAt: '2026-07-11T01:00:00.000Z' } },
    quizProgress: { card: { reviews: 3, updatedAt: '2026-07-11T01:00:00.000Z' } },
  },
};
const overlayA = buildPersonalOverlay(master, incomingA, { allowedDocIds: [] });
const stateA = applyPersonalOverlay(master, overlayA);
const stateB = applyPersonalOverlay(master, {});
assert.equal(stateA.settings.quizFieldOverrides['42'].fields.C, 'A answer');
assert.equal(stateA.settings.quizProgress.card.reviews, 3);
assert.equal(stateB.settings.quizFieldOverrides['42'], undefined);
assert.equal(stateB.settings.quizProgress.card, undefined);
assert.equal(master.settings.quizFieldOverrides['42'], undefined);
assert.equal(master.settings.quizProgress.card, undefined);

console.log('CPX personal quiz answer + progress sync: ok');
