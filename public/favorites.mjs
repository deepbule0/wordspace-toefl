export const MAX_FAVORITE_LEVEL = 3;
export function favoriteLevel(levels, id) {
  const level = levels?.[id];
  return Number.isSafeInteger(level) ? Math.min(MAX_FAVORITE_LEVEL, Math.max(1, level)) : 1;
}
export function toggleFavorite(state, id) {
  if (!Number.isInteger(id) || id < 1 || id > 4264) throw new Error('无效收藏词');
  state.favoriteLevels ||= {};
  if (state.favorites.includes(id)) {
    const level = favoriteLevel(state.favoriteLevels, id);
    if (level < MAX_FAVORITE_LEVEL) state.favoriteLevels[id] = level + 1;
    else {
      state.favorites = state.favorites.filter(savedId => savedId !== id);
      delete state.favoriteLevels[id];
    }
  } else {
    state.favorites = [...state.favorites, id];
    state.favoriteLevels[id] = 1;
  }
}
export function renderFavoriteStar(word, state, icon, extraClass = '') {
  const level = state.favorites.includes(word.id) ? favoriteLevel(state.favoriteLevels, word.id) : 0;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label = `${word.word}：${level ? `${level} 级收藏` : '未收藏'}，${level === MAX_FAVORITE_LEVEL ? '点击取消收藏' : `点击设为 ${level + 1} 级收藏`}`;
  const hint = level === MAX_FAVORITE_LEVEL ? '取消收藏' : level ? '加深收藏星颜色' : '收藏';
  return `<button class="icon-button favorite-star ${extraClass}${level ? ' starred' : ''}" data-action="favorite" data-id="${word.id}" data-favorite-level="${level}" aria-label="${escape(label)}" title="${hint}" aria-pressed="${level > 0}">${icon}</button>`;
}

export function groupFavorites(favoriteIds, wordMap, requestedFilter = 'all', levels = {}, requestedLevel = 'all') {
  // List membership comes from the existing vocabulary; saved word IDs and
  // progress stay unchanged, including backups created before grouping existed.
  const words = [...new Set(favoriteIds)].map(id => wordMap.get(id))
    .filter(word => word && Number.isInteger(word.list) && word.list >= 1 && word.list <= 48)
    .sort((a, b) => a.list - b.list || a.id - b.id);
  const byList = new Map();
  for (const word of words) {
    if (!byList.has(word.list)) byList.set(word.list, {list:word.list, words:[]});
    byList.get(word.list).words.push(word);
  }
  const collections = [...byList.values()];
  const requested = String(requestedFilter);
  // Removing the last favorite in a filtered List returns to all remaining Lists.
  const activeFilter = requested === 'all' || collections.some(group => String(group.list) === requested) ? requested : 'all';
  const levelNumber = Number(requestedLevel);
  const activeLevelFilter = requestedLevel !== 'all' && Number.isInteger(levelNumber) && levelNumber >= 1 && levelNumber <= MAX_FAVORITE_LEVEL ? String(levelNumber) : 'all';
  const levelCounts = new Map();
  for (const word of words) { const level = favoriteLevel(levels, word.id); levelCounts.set(level, (levelCounts.get(level) || 0) + 1); }
  const levelOptions = Array.from({length:MAX_FAVORITE_LEVEL}, (_,index) => ({level:index + 1,count:levelCounts.get(index + 1) || 0}));
  const visibleGroups = collections.filter(group => activeFilter === 'all' || String(group.list) === activeFilter).map(group => {
    const filtered = group.words.filter(word => activeLevelFilter === 'all' || String(favoriteLevel(levels, word.id)) === activeLevelFilter);
    return {list:group.list, words:filtered};
  }).filter(group => group.words.length);
  return {collections, visibleGroups, activeFilter, activeLevelFilter, levelOptions, total:words.length, visibleTotal:visibleGroups.reduce((total, group) => total + group.words.length, 0)};
}

export function renderFavoriteSections(collections, renderRow) {
  return collections.map(group => `<section class="favorite-group" aria-labelledby="favorite-list-${group.list}">
    <div class="favorite-group-heading"><div><span class="eyebrow">SAVED WORDS</span><h2 id="favorite-list-${group.list}">List ${String(group.list).padStart(2, '0')}</h2></div><span class="favorite-group-count">${group.words.length} 个收藏词</span></div>
    <div class="favorites-list">${group.words.map(renderRow).join('')}</div>
  </section>`).join('');
}
