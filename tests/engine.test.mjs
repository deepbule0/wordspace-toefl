import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { initialState, syncDay, sanitizeState, applySettings, completeList, remaining, through, planProgress, today, validateSettings } from '../public/engine.mjs';

const DATE = '2026-09-30';
test('phonetic visibility is persisted independently and old backups default to visible', () => {
  const state = initialState(DATE);
  assert.equal(state.settings.showPhonetic, true);
  state.settings.showPhonetic = false;
  state.settings.showChinese = true;
  state.sessions['new:25'] = {index:3,seen:[2100]};
  const restored = sanitizeState(JSON.parse(JSON.stringify(state)), DATE);
  assert.equal(restored.settings.showPhonetic, false);
  assert.equal(restored.settings.showChinese, true);
  assert.deepEqual(restored.plan, state.plan);
  assert.deepEqual(restored.learned, state.learned);
  assert.deepEqual(restored.reviewed, state.reviewed);
  assert.deepEqual(restored.sessions, state.sessions);
  delete state.settings.showPhonetic;
  assert.equal(sanitizeState(state, DATE).settings.showPhonetic, true);
});
test('default plan starts new 25/26 and review 11/12/13', () => {
  const state = initialState(DATE);
  assert.deepEqual(state.plan.new, [25,26]);
  assert.deepEqual(state.plan.review, [11,12,13]);
  assert.deepEqual(planProgress(state), {done:0,total:5});
});
test('opening and saving sessions cannot complete a list', () => {
  const state = initialState(DATE);
  state.sessions['new:25'] = { index: 12, seen: [2145] };
  const restored = sanitizeState(JSON.parse(JSON.stringify(state)), DATE);
  assert.equal(through(restored.learned), 24);
  assert.deepEqual(restored.plan.doneNew, []);
  assert.equal(restored.sessions['new:25'].index, 12);
});
test('completion is explicit, idempotent, and learns and reviews independently', () => {
  const state = initialState(DATE);
  completeList(state, 'new', 25); completeList(state, 'new', 25);
  assert.equal(through(state.learned), 25);
  assert.equal(through(state.reviewed), 10);
  assert.deepEqual(remaining(state, 'new'), [26]);
  completeList(state, 'review', 11);
  assert.equal(through(state.reviewed), 11);
  assert.deepEqual(planProgress(state), {done:2,total:5});
});
test('out of order completion does not skip unfinished earlier lists', () => {
  const state = initialState(DATE);
  completeList(state, 'new', 26);
  assert.equal(through(state.learned), 24);
  syncDay(state, '2026-10-01');
  assert.deepEqual(state.plan.new, [25,27]);
  completeList(state, 'new', 25);
  assert.equal(through(state.learned), 26);
});
test('out of order review completion survives reload without skipping earlier lists', () => {
  const state = initialState(DATE);
  completeList(state,'new',26); completeList(state,'review',26);
  const restored = sanitizeState(state, DATE);
  assert.ok(restored.reviewed.includes(26));
  assert.equal(through(restored.reviewed),10);
});
test('new day retains incomplete work and moves on from completed lists', () => {
  const state = initialState(DATE);
  completeList(state, 'new', 25);
  completeList(state, 'review', 11);
  syncDay(state, '2026-10-01');
  assert.deepEqual(state.plan.new, [26,27]);
  assert.deepEqual(state.plan.review, [12,13,14]);
  const snapshot = JSON.stringify(state.plan);
  syncDay(state, '2026-10-01');
  assert.equal(JSON.stringify(state.plan), snapshot);
});
test('daily goals can be changed without losing completed work or favorites', () => {
  const state = initialState(DATE);
  state.favorites = [30]; completeList(state, 'new', 25);
  applySettings(state, {dailyNew:3,dailyReview:1,learnedThrough:25,reviewedThrough:10}, DATE);
  assert.deepEqual(state.plan.new, [25,26,27]);
  assert.deepEqual(state.plan.doneNew, [25]);
  assert.deepEqual(state.plan.review, [11]);
  assert.deepEqual(state.favorites, [30]);
});
test('editing progress rebuilds daily tasks and clears positions only', () => {
  const state = initialState(DATE); state.favorites = [19]; state.sessions['new:25'] = {index:2,seen:[20]};
  applySettings(state, {dailyNew:2,dailyReview:3,learnedThrough:30,reviewedThrough:15}, DATE);
  assert.deepEqual(state.plan.new, [31,32]);
  assert.deepEqual(state.plan.review, [16,17,18]);
  assert.deepEqual(state.favorites, [19]); assert.deepEqual(state.sessions, {});
});
test('end of book and review cannot exceed learned material', () => {
  const state = initialState(DATE);
  applySettings(state, {dailyNew:2,dailyReview:3,learnedThrough:47,reviewedThrough:46}, DATE);
  assert.deepEqual(state.plan.new, [48]); assert.deepEqual(state.plan.review, [47]);
  assert.throws(() => completeList(state,'review',48));
  assert.ok(validateSettings({dailyNew:2,dailyReview:3,learnedThrough:10,reviewedThrough:11}));
  assert.ok(validateSettings({dailyNew:0,dailyReview:3,learnedThrough:24,reviewedThrough:10}));
});
test('a completed review book starts a new cycle on the following day', () => {
  const state = initialState(DATE);
  applySettings(state,{dailyNew:2,dailyReview:3,learnedThrough:48,reviewedThrough:48}, DATE);
  syncDay(state,'2026-10-01');
  assert.equal(state.reviewCycle,2); assert.deepEqual(state.plan.new, []);
  assert.deepEqual(state.plan.review,[1,2,3]);
});
test('restoration validates ranges, duplicates, and old dates', () => {
  const state = initialState(DATE);
  state.learned.push(25,25,999); state.favorites = [1,1,5000,-3];
  const restored = sanitizeState(state,'2026-10-01');
  assert.deepEqual(restored.plan.new,[26,27]);
  assert.deepEqual(restored.favorites,[1]);
  assert.equal(restored.learned.length,25);
});
test('date rolls over using Beijing time rather than UTC', () => {
  assert.equal(today(new Date('2026-09-30T15:59:00Z')), '2026-09-30');
  assert.equal(today(new Date('2026-09-30T16:00:00Z')), '2026-10-01');
});
test('all 4264 words have meanings, POS, IPA and a safe local audio or fallback', () => {
  const data = JSON.parse(readFileSync(new URL('../public/vocabulary.json', import.meta.url),'utf8'));
  assert.equal(data.words.length,4264);
  assert.equal(new Set(data.words.map(w=>w.word.toLowerCase())).size,4264);
  assert.equal(new Set(data.words.map(w=>w.list)).size,48);
  assert.equal(data.words.filter(w=>w.audio).length,4108);
  for (const word of data.words) {
    assert.ok(word.phonetic,word.word);
    assert.ok(word.meanings.length,word.word);
    for (const m of word.meanings) { assert.ok(m.pos,word.word); assert.ok(m.text,word.word); }
    if (word.audio) { assert.match(word.audio,/^audio\/\d{4}\.(mp3|ogg|wav)$/); assert.ok(statSync(new URL('../public/'+word.audio,import.meta.url)).size > 100); }
  }
  for (const word of ['essential','Gothic','pale','sleek']) {
    assert.ok(data.words.find(w=>w.word===word).meanings.some(m=>m.pos.includes('adj.')),word);
  }
});
