import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const english = await readFile(new URL('README.md', root), 'utf8');
const chinese = await readFile(new URL('README.zh-CN.md', root), 'utf8');

test('default README is English and both versions have reciprocal language links at the top', () => {
  assert.equal(english.split(/\r?\n/)[0], '**English** | [简体中文](README.zh-CN.md)');
  assert.equal(chinese.split(/\r?\n/)[0], '[English](README.md) | **简体中文**');
  assert.match(english, /^## Web quick start$/m);
  assert.match(chinese, /^## 网页版快速开始$/m);
});

test('both READMEs preserve the app version, dataset counts, build commands, and security guidance', () => {
  for (const source of [english, chinese]) {
    for (const value of ['1.1.3', '4,264', '4,108', '48', 'AES-256-GCM', 'npm start', 'npm run sync', 'npm test', 'npm run audit', 'npm run android:debug', 'npm run android:build', 'npm run test:native', '.signing/', 'JAVA_HOME', 'ANDROID_HOME', '4173', '4174']) {
      assert.ok(source.includes(value), `Missing documented value: ${value}`);
    }
  }
  assert.match(english, /uninstalling erases mobile progress/);
  assert.match(chinese, /卸载会清除手机进度/);
});

test('local Markdown links in both README language versions point to existing files', async () => {
  for (const source of [english, chinese]) {
    for (const [, target] of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^https?:\/\//.test(target)) continue;
      await access(new URL(target, root));
    }
  }
});
