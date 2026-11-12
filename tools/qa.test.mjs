import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serveBuild } from './serve-build.mjs';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run separately so the CLI owns the only active browser process.
test('QA exits unsuccessfully for console errors, broken scenarios and empty filters', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dino-qa-regression-'));
  const relative = path.relative(tmpdir(), directory);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cli = (args) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./qa.mjs', import.meta.url)), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    // Windows software WebGL can take longer to launch and release a context.
    const timeout = process.platform === 'win32' ? 120000 : 60000;
    const timer = setTimeout(() => { output += `\nQA process timed out after ${timeout} ms`; child.kill(); }, timeout);
    child.once('error', reject);
    child.once('close', (code) => { clearTimeout(timer); resolve({ code, output }); });
    t.after(() => child.kill());
  });
  for (const mode of ['console', 'scenario']) {
    const injected = mode === 'console'
      ? "console.error('Injected QA failure [warning]');"
      : "let app; Object.defineProperty(window, '__dino', { get: () => app, set(value) { app = value; value.game.enterMenu = () => { throw new Error('Injected scenario failure'); }; } });";
    const proxy = await serveBuild({ transformHtml: (html) => html.replace('<head>', `<head><script>${injected}</script>`) });
    try {
      const out = path.join(directory, mode);
      const result = await cli(['--url', proxy.url, '--only', '01-menu', '--out', out, '--width', '320', '--height', '240']);
      assert.equal(result.code, 1, result.output);
      const report = JSON.parse(await readFile(path.join(out, '_report.json'), 'utf8'));
      assert.equal(report.passed, false);
      assert.ok(report.logs.some((line) => line.includes(mode === 'console' ? 'Injected QA failure' : 'Injected scenario failure')), result.output);
    } finally {
      await proxy.close();
    }
  }
  const result = await cli(['--only', 'does-not-exist', '--out', path.join(directory, 'empty')]);
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /No scenarios match/);
});
