import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachLearning, highlightTarget, renderLearning } from '../public/learning-ui.mjs';
import { findTarget, wordForms } from '../scripts/example_tools.mjs';

const vocabulary = JSON.parse(readFileSync(new URL('../public/vocabulary.json', import.meta.url), 'utf8'));
const learning = JSON.parse(readFileSync(new URL('../public/learning.json', import.meta.url), 'utf8'));
const words = new Map(vocabulary.words.map(word => [word.id, word]));

test('all 4264 words in all 48 lists have bilingual examples and usages', () => {
  assert.equal(learning.total, 4264);
  assert.equal(learning.words.length, vocabulary.words.length);
  assert.equal(new Set(learning.words.map(row => row.id)).size, learning.total);
  const lists = new Set();
  for (const row of learning.words) {
    const word = words.get(row.id);
    assert.ok(word, `unknown id ${row.id}`);
    lists.add(word.list);
    assert.ok(findTarget(word.word, row.example.en), `${word.word}: example missing target`);
    assert.ok(row.example.en.includes(row.example.target), `${word.word}: wrong highlighted form`);
    assert.match(row.example.zh, /[\u4e00-\u9fff]/);
    assert.match(row.example.en, /[.!?]["'”’]?$/);
    assert.ok(['dictionary','adapted','original'].includes(row.example.kind));
    assert.ok(row.usage.length >= 1 && row.usage.length <= 3);
    for (const usage of row.usage) {
      assert.ok(findTarget(word.word, usage.en), `${word.word}: usage missing target`);
      assert.ok(usage.en.split(/\s+/).length >= 2, `${word.word}: bare headword is not a usage`);
      assert.match(usage.zh, /[\u4e00-\u9fff]/);
      assert.ok(['dictionary','curated','example-phrase'].includes(usage.type));
    }
  }
  assert.equal(lists.size, 48);
  const measured = learning.words.reduce((counts, row) => { counts[row.example.kind]++; return counts; }, {dictionary:0,adapted:0,original:0});
  assert.deepEqual(learning.counts, measured);
});

test('sidecar enriches words without changing word ids, meanings, lists or audio', () => {
  const enriched = structuredClone(vocabulary);
  attachLearning(enriched, learning);
  for (let i = 0; i < enriched.words.length; i++) {
    const {example, usage, ...base} = enriched.words[i];
    assert.deepEqual(base, vocabulary.words[i]);
    assert.ok(example && usage.length);
  }
  assert.throws(() => attachLearning(structuredClone(vocabulary), {...learning, words:learning.words.slice(1)}));
  const duplicate = structuredClone(learning); duplicate.words[1] = duplicate.words[0];
  assert.throws(() => attachLearning(structuredClone(vocabulary), duplicate));
});

test('Chinese toggle hides both translations and usage notes, not the English sentence', () => {
  const row = learning.words[0], word = {...vocabulary.words[0], ...row};
  const visible = renderLearning(word, true), hidden = renderLearning(word, false);
  assert.ok(visible.includes(row.example.zh));
  assert.ok(visible.includes(row.usage[0].zh));
  assert.ok(!hidden.includes(row.example.zh));
  assert.ok(!hidden.includes(row.usage[0].zh));
  assert.ok(hidden.includes('example-english'));
  assert.ok(hidden.includes('usage-english'));
  assert.ok(hidden.includes('data-action="reveal"'));
  assert.ok(hidden.includes('非托福真题'));
});

test('English highlighting handles actual inflected forms and escapes HTML', () => {
  assert.equal(highlightTarget('Plants perished during the drought.', 'perished'), 'Plants <mark>perished</mark> during the drought.');
  assert.equal(highlightTarget('stress stressful STRESS', 'stress'), '<mark>stress</mark> stressful <mark>STRESS</mark>');
  assert.equal(highlightTarget('<script>alert(1)</script>', 'alert'), '&lt;script&gt;<mark>alert</mark>(1)&lt;/script&gt;');
  assert.equal(highlightTarget('a+b is a+b', 'a+b'), '<mark>a+b</mark> is <mark>a+b</mark>');
  assert.ok(wordForms('flagellum').has('flagella'));
  assert.equal(findTarget('toed', 'A three-toed animal.'), 'three-toed');
});

test('all source kinds are accurately labelled and partial phrases are not called collocations', () => {
  for (const [kind, label] of Object.entries({dictionary:'词库参考',adapted:'短语扩写',original:'学习编写'})) {
    const row = learning.words.find(row => row.example.kind === kind);
    const html = renderLearning({...words.get(row.id), ...row}, true);
    assert.ok(html.includes(label));
  }
  const row = learning.words.find(row => row.usage[0].type === 'example-phrase');
  assert.ok(renderLearning({...words.get(row.id), ...row}, true).includes('例句用法'));
});
