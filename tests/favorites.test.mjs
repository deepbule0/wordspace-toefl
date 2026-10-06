import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupFavorites, renderFavoriteSections, favoriteLevel, toggleFavorite, renderFavoriteStar, MAX_FAVORITE_LEVEL } from '../public/favorites.mjs';
import { initialState, sanitizeState, applySettings } from '../public/engine.mjs';

const wordMap = new Map([
  [100,{id:100,list:2,word:'two-first'}],
  [110,{id:110,list:2,word:'two-second'}],
  [900,{id:900,list:11,word:'eleven'}],
  [2100,{id:2100,list:25,word:'twenty-five'}],
]);
const DATE = '2026-09-30';

test('successive clicks cycle an individual favorite through three grades and then remove it', () => {
  const state = initialState(DATE);
  toggleFavorite(state, 100); toggleFavorite(state, 110);
  assert.equal(favoriteLevel(state.favoriteLevels, 100), 1);
  toggleFavorite(state, 100); assert.equal(state.favoriteLevels[100], 2);
  toggleFavorite(state, 100); assert.equal(state.favoriteLevels[100], 3);
  assert.equal(favoriteLevel(state.favoriteLevels, 110), 1);
  assert.deepEqual(state.favorites, [100,110]);
  toggleFavorite(state, 100);
  assert.deepEqual(state.favorites, [110]); assert.equal(state.favoriteLevels[100], undefined);
  toggleFavorite(state, 100); assert.equal(state.favoriteLevels[100], 1);
  assert.deepEqual(state.favorites, [110,100]);
});
test('legacy favorites also cycle from one and grades never exceed three or advance List progress', () => {
  const state = initialState(DATE); state.favorites = [100]; delete state.favoriteLevels;
  const progress = JSON.stringify({learned:state.learned,reviewed:state.reviewed,plan:state.plan,sessions:state.sessions});
  assert.equal(MAX_FAVORITE_LEVEL,3);
  for (const expected of [2,3,0,1,2,3,0,1]) {
    toggleFavorite(state, 100);
    assert.equal(state.favorites.includes(100) ? state.favoriteLevels[100] : 0, expected);
  }
  assert.equal(JSON.stringify({learned:state.learned,reviewed:state.reviewed,plan:state.plan,sessions:state.sessions}),progress);
  assert.throws(() => toggleFavorite(state, -1));
});
test('favorite buttons expose grade through color data and accessible labels without visible grade text', () => {
  const state = initialState(DATE), word = {id:100,word:'word & <test>'};
  const icon = '<svg aria-hidden="true"><path/></svg>';
  for (let level = 0; level <= 3; level++) {
    const html = renderFavoriteStar(word, state, icon, 'favorite-toggle');
    assert.ok(html.includes(`data-favorite-level="${level}"`));
    assert.ok(html.includes(`aria-pressed="${level > 0}"`));
    assert.ok(html.includes('word &amp; &lt;test&gt;'));
    assert.equal(html.slice(html.indexOf('>') + 1, html.lastIndexOf('</button>')), icon);
    assert.equal(html.includes('title="取消收藏"'),level === 3);
    assert.equal(html.includes('点击取消收藏'),level === 3);
    toggleFavorite(state,100);
  }
  assert.deepEqual(state.favorites,[]);
});
test('old backups upgrade favorites to level one without losing learning progress or positions', () => {
  const legacy = initialState(DATE); delete legacy.favoriteLevels;
  legacy.favorites = [100,110]; legacy.sessions['new:25'] = {index:1,seen:[2100]};
  const restored = sanitizeState(legacy, DATE);
  assert.deepEqual(restored.favoriteLevels, {100:1,110:1});
  assert.deepEqual(restored.favorites, legacy.favorites);
  assert.deepEqual(restored.learned, legacy.learned);
  assert.deepEqual(restored.reviewed, legacy.reviewed);
  assert.deepEqual(restored.plan, legacy.plan);
  assert.deepEqual(restored.sessions, legacy.sessions);
});
test('levels survive JSON backup restoration and settings changes, and orphan metadata is discarded', () => {
  const state = initialState(DATE); state.favorites = [100,110];
  state.favoriteLevels = {100:3,110:2,900:8};
  const restored = sanitizeState(JSON.parse(JSON.stringify(state)), DATE);
  assert.deepEqual(restored.favoriteLevels, {100:3,110:2});
  applySettings(restored, {dailyNew:2,dailyReview:3,learnedThrough:30,reviewedThrough:15}, DATE);
  assert.deepEqual(restored.favoriteLevels, {100:3,110:2});
  assert.deepEqual(restored.favorites, [100,110]);
  assert.equal(favoriteLevel({100:'3'},100),1);
  assert.equal(favoriteLevel({100:-2},100),1);
  assert.equal(favoriteLevel({100:999},100),MAX_FAVORITE_LEVEL);
  const highGrades = sanitizeState({...state,favoriteLevels:{100:99,110:4}},DATE);
  assert.deepEqual(highGrades.favoriteLevels,{100:3,110:3});
});
test('List and level filters combine without altering saved IDs or their grades', () => {
  const saved = [2100,110,900,100], levels = {100:1,110:2,900:1,2100:3};
  const snapshot = JSON.stringify({saved,levels});
  const result = groupFavorites(saved, wordMap, '2', levels, '2');
  assert.equal(result.activeFilter, '2'); assert.equal(result.activeLevelFilter, '2');
  assert.deepEqual(result.visibleGroups.map(group => group.list), [2]);
  assert.deepEqual(result.visibleGroups[0].words.map(word => word.id), [110]);
  assert.equal(result.total, 4); assert.equal(result.visibleTotal, 1);
  assert.deepEqual(result.levelOptions, [{level:1,count:2},{level:2,count:1},{level:3,count:1}]);
  assert.equal(JSON.stringify({saved,levels}), snapshot);
});
test('empty combinations and promotion out of a filtered grade keep a clearable filter, not a lost favorite', () => {
  const result = groupFavorites([100,900], wordMap, '11', {100:2,900:1}, '2');
  assert.equal(result.total,2); assert.equal(result.visibleTotal,0);
  assert.equal(result.activeFilter,'11'); assert.equal(result.activeLevelFilter,'2');
  const promoted = groupFavorites([100], wordMap, 'all', {100:3}, '2');
  assert.equal(promoted.total,1); assert.equal(promoted.visibleTotal,0);
  assert.equal(promoted.levelOptions.find(tier => tier.level === 2).count,0);
  assert.equal(groupFavorites([100], wordMap, 'all', {100:3}, 'all').visibleTotal,1);
});
test('all grades stay in one List section in original word order, not grade subgroups', () => {
  const result = groupFavorites([110,100,900], wordMap, 'all', {100:3,110:1,900:2});
  assert.deepEqual(result.visibleGroups[0].words.map(word => word.id), [100,110]);
  assert.equal(result.visibleGroups[0].levelGroups, undefined);
  const html = renderFavoriteSections(result.visibleGroups, word => `<p>${word.word}</p>`);
  assert.equal(html.includes('级收藏'),false);
  assert.equal(html.includes('favorite-level-section'),false);
  assert.ok(html.indexOf('two-first') < html.indexOf('two-second'));
  assert.equal((html.match(/class="favorites-list"/g) || []).length,2);
});
test('classification has exactly three selectable grades, even if some have no favorites', () => {
  const result = groupFavorites([100],wordMap,'all',{100:1});
  assert.deepEqual(result.levelOptions,[{level:1,count:1},{level:2,count:0},{level:3,count:0}]);
  assert.equal(groupFavorites([100],wordMap,'all',{100:1},'99').activeLevelFilter,'all');
});

test('favorites group by numeric List and preserve original vocabulary order within a group', () => {
  const saved = [2100,110,900,100];
  const snapshot = structuredClone(saved);
  const result = groupFavorites(saved, wordMap);
  assert.deepEqual(result.collections.map(group => group.list), [2,11,25]);
  assert.deepEqual(result.collections[0].words.map(word => word.id), [100,110]);
  assert.equal(result.total, 4);
  assert.equal(result.visibleTotal, 4);
  assert.equal(result.activeFilter, 'all');
  assert.deepEqual(saved, snapshot);
});
test('filtering a List changes the view, not the saved collection', () => {
  const result = groupFavorites([2100,110,900,100], wordMap, '2');
  assert.equal(result.activeFilter, '2');
  assert.equal(result.total, 4);
  assert.equal(result.visibleTotal, 2);
  assert.deepEqual(result.visibleGroups.map(group => group.list), [2]);
  assert.equal(result.collections.length, 3);
});
test('removing the last word of a filtered List returns to the remaining collection', () => {
  const result = groupFavorites([100,110], wordMap, '25');
  assert.equal(result.activeFilter, 'all');
  assert.equal(result.total, 2);
  assert.equal(result.visibleTotal, 2);
});
test('empty collections, duplicate ids and stale ids are handled safely', () => {
  const empty = groupFavorites([], wordMap, '25');
  assert.equal(empty.activeFilter, 'all');
  assert.deepEqual(empty.visibleGroups, []);
  assert.equal(empty.visibleTotal, 0);
  assert.equal(renderFavoriteSections(empty.visibleGroups, () => ''), '');
  assert.equal(groupFavorites([100,100,999], wordMap).total, 1);
});
test('each rendered group has its own List heading, count and associated rows', () => {
  const result = groupFavorites([2100,110,900,100], wordMap);
  const html = renderFavoriteSections(result.visibleGroups, word => `<p>${word.word}</p>`);
  assert.ok(html.includes('List 02'));
  assert.ok(html.includes('List 11'));
  assert.ok(html.includes('List 25'));
  assert.ok(html.includes('2 个收藏词'));
  assert.equal((html.match(/class="favorite-group"/g) || []).length, 3);
  assert.ok(html.indexOf('two-first') < html.indexOf('two-second'));
  assert.ok(html.indexOf('two-second') < html.indexOf('List 11'));
});
test('existing saved word IDs in all 48 real Lists can be grouped without a migration', () => {
  const vocabulary = JSON.parse(readFileSync(new URL('../public/vocabulary.json', import.meta.url), 'utf8'));
  const realMap = new Map(vocabulary.words.map(word => [word.id,word]));
  const saved = Array.from({length:48}, (_,index) => vocabulary.words.find(word => word.list === index + 1).id).reverse();
  const result = groupFavorites(saved, realMap);
  assert.equal(result.total, 48);
  assert.deepEqual(result.collections.map(group => group.list), Array.from({length:48}, (_,index) => index + 1));
  assert.ok(result.collections.every(group => group.words.length === 1 && group.words[0].list === group.list));
});
