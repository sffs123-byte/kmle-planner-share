'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const files = ['index.html', 'cpx-a4-editor-local.html'];
const wrapperPattern = /let cpxStatePullInFlight=null;const pullAllStateUnshared=pullAllState;pullAllState=function\(opts=\{\}\)\{[^\n]+\};/;

async function verify(file) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const match = html.match(wrapperPattern);
  assert(match, `${file}: state pull single-flight wrapper missing`);
  assert(
    html.indexOf(match[0]) < html.indexOf('void bootstrapAuth()'),
    `${file}: single-flight wrapper must be installed before auth bootstrap`
  );

  const source = `
    let calls = 0;
    async function pullAllState() {
      calls += 1;
      await new Promise(resolve => setTimeout(resolve, 15));
      return calls;
    }
    ${match[0]}
    (async () => {
      const first = pullAllState();
      const second = pullAllState();
      assert.strictEqual(first, second);
      assert.strictEqual(await first, 1);
      assert.strictEqual(calls, 1);
      await pullAllState();
      assert.strictEqual(calls, 2);
    })();
  `;
  await vm.runInNewContext(source, { assert, Promise, setTimeout }, { timeout: 1000 });
  return file;
}

(async () => {
  const verified = [];
  for (const file of files) verified.push(await verify(file));
  console.log(JSON.stringify({ ok: true, verified }, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
