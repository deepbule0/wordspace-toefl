import { initialState, sanitizeState, today, syncDay, through, applySettings, validateSettings, completeList, remaining, planProgress } from './engine.mjs';
import { attachLearning, renderLearning, learningSourceNotes } from './learning-ui.mjs';
import { renderPhonetic, renderPhoneticToggle } from './pronunciation-ui.mjs';
import { groupFavorites, renderFavoriteSections, favoriteLevel, renderFavoriteStar, toggleFavorite } from './favorites.mjs';
import { createSyncClient } from './sync-client.mjs';
import { renderSyncModal,backgroundSummary } from './sync-ui.mjs';
import { parseConnectionCode } from './sync-crypto.mjs';
import { playLocalOrFallback } from './audio-playback.mjs';
import { leafMarkup } from './brand-mark.mjs';
import { renderNetworkPanel } from './network-ui.mjs';
import { preserveStudyViewport } from './study-viewport.mjs';
import { isAndroidApp,copyText,exportNativeBackup,speakNative,stopNativeSpeech,setNativeBackEnabled,scanPairCode,readNetworkInfo,readDesktopNetwork,probeSyncAddress } from './native.mjs';

const STORAGE_KEY = 'wordspace.toefl.v1';
if(isAndroidApp())document.body.classList.add('android-app');
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const toastNode = document.querySelector('#toast');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const svg = (name, extra = '') => {
  const paths = {
    leaf: leafMarkup,
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    book: '<path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
    star: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.5l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z"/>',
    gear: '<path d="m9 3-1 3-3 1-2 3 2 2v3l2 2 3-1 2 2 3-1 1-3 3-1 1-3-2-2V6l-3-1-3 1Z"/><circle cx="12" cy="11" r="3"/>',
    audio: '<path d="m11 4-6 5H2v6h3l6 5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    left: '<path d="m14 6-6 6 6 6"/>',
    right: '<path d="m10 6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    hide: '<path d="m3 3 18 18M10 5a11 11 0 0 1 12 7 17 17 0 0 1-3 4M6 6a19 19 0 0 0-4 6s4 7 10 7a12 12 0 0 0 5-1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    repeat: '<path d="M4 9a8 8 0 0 1 14-4l3 3m0-5v5h-5M20 15a8 8 0 0 1-14 4l-3-3m0 5v-5h5"/>',
  };
  return `<svg class="icon ${extra}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.book}</svg>`;
};
let data, groups, byId;
let state;
let view = 'today';
let active = null;
let revealed = new Set();
let search = '';
let libraryFilter = 'all';
let favoriteListFilter = 'all';
let favoriteLevelFilter = 'all';
let toastTimer, currentAudio, utterance, playingWord;
let storageWorks = true;
let syncClient, syncInfo=null;
let networkInfo=null,networkProbe=null,networkLoading=false,networkRevision=0;
let pendingSyncAddress=null;
try{pendingSyncAddress=localStorage.getItem('wordspace.lan.pending-address.v1');}catch{}
let incomingPairCode=null;
let syncStatus={status:'未连接',connected:false,lastSync:null};
function notify(message) {
  toastNode.textContent = message; toastNode.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastNode.classList.remove('visible'), 3500);
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { storageWorks = false; notify('浏览器无法保存进度，请在设置中导出备份。'); }
  syncClient?.record(state);
}
function currentWord() { return groups[active.list][active.index]; }
function isDone(mode, list) { return state[mode === 'new' ? 'learned' : 'reviewed'].includes(list); }
function visibleMeaning(word) { return state.settings.showChinese || revealed.has(word.id); }
function definitions(word) { return word.meanings.map(m => `<div class="definition"><span class="pos">${escape(m.pos)}</span><span>${escape(m.text)}</span></div>`).join(''); }
function meaningText(word) { return word.meanings.map(m => m.text).join('；'); }
function tag(mode) { return mode === 'new' ? '新学' : '复习'; }
function sessionKey() { return `${active.mode}:${active.list}`; }
function markSeen() {
  const key = sessionKey();
  const session = state.sessions[key] ||= { index: 0, seen: [] };
  session.index = active.index;
  if (!session.seen.includes(currentWord().id)) session.seen.push(currentWord().id);
  state.lastSession = { mode: active.mode, list: active.list };
  save();
}
function stopAudio() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  stopNativeSpeech();
  utterance = null; playingWord = null; updateAudioButtons();
}
function updateAudioButtons() {
  document.querySelectorAll('[data-action="audio"], [data-action="example-audio"]').forEach(button => {
    const key = button.dataset.action === 'example-audio' ? `example:${button.dataset.id}` : Number(button.dataset.id);
    const playing = key === playingWord;
    button.classList.toggle('playing', playing);
    button.setAttribute('aria-pressed', String(playing));
  });
}
function speak(word, text = word.word, requested = word.id) {
  if (speakNative(text)) return;
  if (!('speechSynthesis' in window)) { playingWord = null; updateAudioButtons(); notify('当前浏览器不支持英语朗读，请使用本地单词音频或其他支持朗读的浏览器。'); return; }
  const voices = speechSynthesis.getVoices();
  utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US'; utterance.rate = .85;
  const voice = voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang.startsWith('en'));
  if (voice) utterance.voice = voice;
  utterance.onend = () => { if (playingWord === requested) { playingWord = null; updateAudioButtons(); } };
  utterance.onerror = event => { if (!['canceled', 'interrupted'].includes(event.error)) notify('英语朗读暂不可用，请检查浏览器的语音设置。'); if (playingWord === requested) { playingWord = null; updateAudioButtons(); } };
  speechSynthesis.speak(utterance);
}
function playExample(word) {
  const key = `example:${word.id}`, wasPlaying = playingWord === key;
  stopAudio();
  if (wasPlaying) return;
  playingWord = key; updateAudioButtons();
  speak(word, word.example.en, key);
}
async function play(word) {
  const wasPlaying = playingWord === word.id;
  stopAudio();
  if (wasPlaying) return;
  playingWord = word.id; updateAudioButtons();
  if (!word.audio) { speak(word); return; }
  const audio = new Audio(word.audio); currentAudio = audio;
  audio.onended = () => { if (currentAudio === audio) { currentAudio = null; playingWord = null; updateAudioButtons(); } };
  await playLocalOrFallback(audio,()=>currentAudio===audio,()=>{currentAudio=null;speak(word);});
}
function openList(mode, list, index) {
  stopAudio();
  const session = state.sessions[`${mode}:${list}`];
  active = { mode, list, index: Math.min(Math.max(index ?? session?.index ?? 0, 0), groups[list].length - 1) };
  view = 'study'; search = ''; revealed = new Set();
  markSeen(); render(); window.scrollTo(0, 0);
  if (state.settings.autoAudio) play(currentWord());
}
function changeWord(index) {
  if (index < 0 || index >= groups[active.list].length) return;
  stopAudio(); active.index = index; markSeen();
  renderStudy();
  if (state.settings.autoAudio) play(currentWord());
}
function getContinueTask() {
  const last = state.lastSession;
  if (last && remaining(state, last.mode).includes(last.list)) return last;
  const mode = remaining(state, 'new').length ? 'new' : 'review';
  const list = remaining(state, mode)[0];
  return list ? { mode, list } : null;
}
function shell() {
  const learn = through(state.learned), review = through(state.reviewed);
  const progress = planProgress(state);
  return `<aside class="sidebar">
    <a class="brand" href="#today" data-action="nav" data-view="today"><span class="brand-mark">${svg('leaf')}</span><span>词间<small>WORDSPACE</small></span></a>
    <div class="sidebar-caption">把单词，留在记忆里。</div>
    <nav aria-label="主导航">
      ${[['today','home','今日计划'],['library','book','全部词表'],['favorites','star','收藏词']].map(([key,icon,label]) => `<button class="nav-item ${view === key || (view === 'study' && key === 'today') ? 'active' : ''}" data-action="nav" data-view="${key}">${svg(icon)}<span>${label}</span>${key === 'favorites' ? `<small>${state.favorites.length}</small>` : ''}${key === 'library' ? '<small>48</small>' : ''}</button>`).join('')}
    </nav>
    <div class="sidebar-book"><div class="book-art"><span>TOEFL</span><strong>词汇</strong><em>乱序版</em><div class="book-lines"></div></div><div><span class="eyebrow">当前词库</span><h3>托福词汇 · 48 List</h3><p>公开参考版 · ${data.total.toLocaleString()} 词</p></div></div>
    <div class="sidebar-progress"><div class="spread"><span>词库学习进度</span><strong>${Math.round(learn / 48 * 100)}%</strong></div><div class="meter"><i style="width:${learn / 48 * 100}%"></i></div><p>已学完 ${learn} / 48 个 List</p></div>
    <div class="sidebar-bottom"><button class="nav-item" data-action="settings">${svg('gear')}<span>计划与进度设置</span></button><button class="source-link" data-action="about">词库说明与来源 ${svg('right')}</button><div class="local-note"><span class="status-dot"></span>${storageWorks ? `进度保存在${isAndroidApp()?'这台手机':'这台浏览器'}` : '进度未能保存，请导出备份'}</div></div>
  </aside><div class="main-shell"><header class="topbar"><div><span class="topbar-label">TOEFL VOCABULARY</span><span class="topbar-divider"></span><span>每天一点，慢慢记牢。</span></div><div class="date-chip">${svg('clock')}<span>${state.plan.date.replaceAll('-', '.')}<small>北京时间</small></span></div></header><main id="main"></main><footer class="footer"><span>词间 · 给记忆一点时间</span><span>新学至 List ${pad(learn)} · 复习至 List ${pad(review)} · 今日 ${progress.done}/${progress.total}</span></footer></div>`;
}
function render() {
  document.body.classList.toggle('study-view', view === 'study');
  return view === 'study' ? preserveStudyViewport(window, paint) : paint();
}
function paint() {
  app.innerHTML = shell();
  document.querySelector('.date-chip').insertAdjacentHTML('beforebegin', `<button class="sync-header" data-action="sync-settings" aria-label="手机与电脑同步">${svg('repeat')}<span class="sync-state-label">${escape(syncStatus.connected?syncStatus.status:'手机同步')}</span></button>`);
  if (view === 'today') renderToday();
  if (view === 'library') renderLibrary();
  if (view === 'favorites') renderFavorites();
  if (view === 'study') renderStudy();
  setNativeBackEnabled(view!=='today'||modal.open);
}
window.wordspaceHandleBack=()=>{
  if(modal.open){modal.close();return true;}
  if(view!=='today'){stopAudio();view='today';render();window.scrollTo(0,0);return true;}
  return false;
};
function networkView(){return {info:networkInfo,target:pendingSyncAddress||syncStatus.address,pairedTarget:syncStatus.address,probe:networkProbe,loading:networkLoading};}
function paintNetwork(){
  const panel=document.querySelector('#sync-network-panel');
  if(panel){const markup=renderNetworkPanel(isAndroidApp(),networkView());if(panel.wordspaceMarkup!==markup){panel.innerHTML=markup;panel.wordspaceMarkup=markup;}}
}
async function refreshNetwork(check=false){
  const revision=++networkRevision;
  networkLoading=true;paintNetwork();
  const target=networkView().target;
  try{
    const info=isAndroidApp()?readNetworkInfo():await readDesktopNetwork();
    if(revision!==networkRevision)return;
    networkInfo=info;
    if(check){networkProbe=await probeSyncAddress(isAndroidApp()?target:'http://127.0.0.1:4174');}
  }catch{if(revision===networkRevision)networkProbe={ok:false,message:'未能检查网络，请稍后重试。'};}
  finally{if(revision===networkRevision){networkLoading=false;paintNetwork();}}
}
function setPendingAddress(code){
  try{pendingSyncAddress=parseConnectionCode(code).address;}catch{pendingSyncAddress=null;}
  try{pendingSyncAddress?localStorage.setItem('wordspace.lan.pending-address.v1',pendingSyncAddress):localStorage.removeItem('wordspace.lan.pending-address.v1');}catch{}
  networkRevision++;networkLoading=false;networkProbe=null;paintNetwork();
}
function syncModal() {
  showModal(renderSyncModal(syncStatus,isAndroidApp(),syncInfo,syncClient?.hasPairingBackup(),networkView()));
  void refreshNetwork();
}
function paintSyncStatus(status) {
  syncStatus=status;
  document.querySelectorAll('.sync-state-label').forEach(node=>{node.textContent=status.connected?status.status:'手机同步 · 未连接';});
  const backgroundDetail=document.querySelector('.background-sync-detail');if(backgroundDetail)backgroundDetail.textContent=backgroundSummary(status);
  const backgroundSwitch=document.querySelector('#background-sync-switch');if(backgroundSwitch)backgroundSwitch.checked=status.backgroundEnabled;
  paintNetwork();
}
function applySyncedState(next) {
  state=next;
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{notify('同步已接收，但本地存储失败，请导出备份');}
  if(active&&!state.sessions[sessionKey()]){active=null;view='today';}
  stopAudio();render();
}
function taskCard(mode) {
  const numbers = state.plan[mode];
  const done = state.plan[mode === 'new' ? 'doneNew' : 'doneReview'];
  const count = numbers.reduce((sum, n) => sum + groups[n].length, 0);
  return `<section class="plan-card ${mode}"><div class="plan-card-top"><div class="plan-icon">${svg(mode === 'new' ? 'book' : 'repeat')}</div><span class="eyebrow">${mode === 'new' ? 'BUILD YOUR VOCABULARY' : 'KEEP IT IN MEMORY'}</span><span class="pill">${numbers.length} 个 List</span></div><h2>今天${tag(mode)}</h2><p>${mode === 'new' ? '给记忆添一些新朋友。' : '让学过的词，再熟悉一点。'}<span>${count} 个单词</span></p><div class="task-list">${numbers.length ? numbers.map(n => `<button class="task-row ${done.includes(n) ? 'completed' : ''}" data-action="open" data-mode="${mode}" data-list="${n}"><span class="task-check">${done.includes(n) ? svg('check') : pad(n)}</span><span><strong>List ${pad(n)}</strong><small>${groups[n].length} 个单词${state.sessions[`${mode}:${n}`]?.seen.length && !done.includes(n) ? ` · 已浏览 ${state.sessions[`${mode}:${n}`].seen.length} 词` : ''}</small></span><span class="task-row-status">${done.includes(n) ? '已完成' : '开始'}${svg(done.includes(n) ? 'check' : 'arrow')}</span></button>`).join('') : `<div class="empty-task">${mode === 'new' ? '48 个 List 都已学完，真不错。' : '复习已追上学习进度，下一天会按最新进度安排。'}</div>`}</div><div class="plan-card-footer">${svg('check')}完成后点击标记，进度才会向前。</div></section>`;
}
function renderToday() {
  const progress = planProgress(state);
  const next = getContinueTask();
  const nextNew = remaining(state, 'new')[0];
  const doneAll = progress.total > 0 && progress.done === progress.total;
  document.querySelector('#main').innerHTML = `<div class="page-heading"><div><div class="eyebrow">YOUR DAILY PRACTICE</div><h1>${doneAll ? '今天的计划，完成了。' : nextNew ? `今天，从 List ${pad(nextNew)} 开始。` : next ? '复习一下，记得更牢。' : '学习的每一步，都算数。'}</h1><p>每天新学 ${state.settings.dailyNew} 个 List，复习 ${state.settings.dailyReview} 个 List。节奏由你决定。</p></div><button class="button subtle" data-action="settings">${svg('gear')}调整计划</button></div>
    <section class="daily-banner"><div class="banner-copy"><div class="pill light">${doneAll ? '今日目标已达成' : '今天的小目标'}</div><h2>${doneAll ? '给坚持，画一个小小的勾。' : '认识新词，也别忘了老朋友。'}</h2><p>${doneAll ? '明天会从未完成的进度接着安排。也可以打开词表自由练习。' : `新学 ${state.plan.new.map(n => pad(n)).join('、') || '已完成'}　/　复习 ${state.plan.review.map(n => pad(n)).join('、') || '暂无任务'}`}</p><button class="button lime" data-action="${next ? 'continue' : 'nav'}" ${next ? '' : 'data-view="library"'}>${next ? (state.lastSession?.list === next.list && state.lastSession?.mode === next.mode ? '继续上次练习' : '开始今日练习') : '自由练习词表'}${svg('arrow')}</button></div><div class="daily-ring" style="--progress:${progress.total ? progress.done / progress.total * 100 : 0}%"><div><strong>${progress.done}<span> / ${progress.total}</span></strong><small>今日完成 List</small></div></div><div class="banner-decoration">A<span>a</span></div></section>
    <div class="section-title"><h2>今日清单 <span>一步一步来</span></h2><span>完成 ${progress.done} / ${progress.total}</span></div><div class="plan-grid">${taskCard('new')}${taskCard('review')}</div>
    <section class="practice-tip">${svg('eye')}<div><strong>先看英文，想一想，再看中文。</strong><p>在练习页切换“显示中文释义”，可以整组隐藏中文，也可以单独揭晓一个词。</p></div><button class="text-button" data-action="nav" data-view="library">浏览全部 48 个 List ${svg('arrow')}</button></section>`;
}
function renderLibrary() {
  const learn = through(state.learned);
  const numbers = Array.from({ length: 48 }, (_, i) => i + 1).filter(n => libraryFilter === 'all' || (libraryFilter === 'learned' ? state.learned.includes(n) : !state.learned.includes(n)));
  document.querySelector('#main').innerHTML = `<div class="page-heading"><div><div class="eyebrow">YOUR WORD COLLECTION</div><h1>一个 List，一次积累。</h1><p>48 个 List · ${data.total.toLocaleString()} 个词。随时打开任意一组，新学和复习使用同一套界面。</p></div></div><div class="library-toolbar"><div class="segmented" aria-label="筛选词表">${[['all','全部词表'],['learned','已学完'],['unlearned','待学习']].map(([value,label]) => `<button class="${libraryFilter === value ? 'selected' : ''}" data-action="filter" data-value="${value}" aria-pressed="${libraryFilter === value}">${label}</button>`).join('')}</div><span>已学完 ${learn} / 48 个 List</span></div><div class="list-grid">${numbers.map(n => {
    const learned = state.learned.includes(n), reviewed = state.reviewed.includes(n);
    const scheduledNew = remaining(state, 'new').includes(n), scheduledReview = remaining(state, 'review').includes(n);
    return `<button class="list-tile ${scheduledNew || scheduledReview ? 'scheduled' : ''}" data-action="open" data-mode="${learned ? 'review' : 'new'}" data-list="${n}"><div class="spread"><span class="eyebrow">WORD LIST</span><span class="tile-status ${learned ? 'learned' : ''}">${scheduledNew ? '今日新学' : scheduledReview ? '今日复习' : reviewed ? '已复习' : learned ? '已学完' : '待学习'}</span></div><strong>${pad(n)}</strong><div class="spread"><span>${groups[n].length} 个单词</span>${svg(learned ? 'repeat' : 'arrow')}</div></button>`;
  }).join('')}</div><div class="reference-note">这是公开信息整理的参考词库。List 13、34、43 与另一公开卡组的词数合计相差 4 词，可能存在版本差异。<button class="text-button" data-action="about">查看来源</button></div>`;
}
function renderFavorites() {
  const collection = groupFavorites(state.favorites, byId, favoriteListFilter, state.favoriteLevels, favoriteLevelFilter);
  favoriteListFilter = collection.activeFilter;
  favoriteLevelFilter = collection.activeLevelFilter;
  const renderRow = word => `<div class="favorite-row" data-word-id="${word.id}">
    <button class="favorite-word" data-action="favorite-open" data-id="${word.id}"><strong>${escape(word.word)}</strong><small>List ${pad(word.list)}${state.settings.showPhonetic ? ' · ' + renderPhonetic(word, true) : ''}</small></button>
    <button class="icon-button audio-button" data-action="audio" data-id="${word.id}" aria-label="播放 ${escape(word.word)} 的发音">${svg('audio')}</button>
    <div class="favorite-meaning">${visibleMeaning(word) ? definitions(word) : `<button class="reveal-inline" data-action="reveal" data-id="${word.id}">点击查看释义 ${svg('eye')}</button>`}</div>
    ${renderFavoriteStar(word, state, svg('star'))}
  </div>`;
  document.querySelector('#main').innerHTML = `
    <div class="page-heading"><div><div class="eyebrow">A LITTLE MORE PRACTICE</div><h1>把不熟的词，留在这里。</h1><p>已收藏 ${collection.total} 个词，来自 ${collection.collections.length} 个 List。按组回顾，让记忆更清楚。</p></div>
      <div class="visibility-controls"><label class="switch-control"><input id="chinese-switch" type="checkbox" ${state.settings.showChinese ? 'checked' : ''}><span class="switch"></span>显示中文释义</label>${renderPhoneticToggle(state.settings.showPhonetic)}</div>
    </div>
    <div class="favorites-toolbar"><div class="favorite-filters">
      <label class="favorite-list-filter">按 List 查看<select id="favorite-list-filter" ${collection.total ? '' : 'disabled'}>
        <option value="all" ${favoriteListFilter === 'all' ? 'selected' : ''}>全部 List（${collection.total} 词）</option>
        ${collection.collections.map(group => `<option value="${group.list}" ${favoriteListFilter === String(group.list) ? 'selected' : ''}>List ${pad(group.list)}（${group.words.length} 词）</option>`).join('')}
      </select></label>
      <label class="favorite-list-filter">按等级查看<select id="favorite-level-filter" ${collection.total ? '' : 'disabled'}>
        <option value="all" ${favoriteLevelFilter === 'all' ? 'selected' : ''}>全部等级（${collection.total} 词）</option>
        ${collection.levelOptions.map(tier => `<option value="${tier.level}" ${favoriteLevelFilter === String(tier.level) ? 'selected' : ''}>${tier.level} 级（${tier.count} 词）</option>`).join('')}
      </select></label></div>
      <span class="favorites-summary">当前显示 ${collection.visibleTotal} 词 · ${collection.visibleGroups.length} 个 List</span>
    </div>
    <p class="favorite-level-note">反复点击星星加深颜色，最深色再点一次取消收藏。<span class="favorite-legend" aria-hidden="true">☆ → <span class="row-star" data-favorite-level="1">★</span> → <span class="row-star" data-favorite-level="2">★</span> → <span class="row-star" data-favorite-level="3">★</span> → ☆</span> 默认一起显示，可在分类栏按等级筛选。</p>
    ${collection.total ? (collection.visibleTotal ? `<div class="favorite-groups">${renderFavoriteSections(collection.visibleGroups, renderRow)}</div>` : `<div class="empty-state favorite-filter-empty"><h2>当前筛选下没有收藏词</h2><p>收藏还在其他 List 或等级中，可以切换筛选继续查看。</p><button class="button subtle" data-action="clear-favorite-filters">查看全部收藏</button></div>`) : `<div class="empty-state">${svg('star')}<h2>这里还没有收藏词</h2><p>遇到想再记一次的单词，点击星星就好。</p><button class="button primary" data-action="continue">开始练习 ${svg('arrow')}</button></div>`}
  `;
  updateAudioButtons();
}
function studyRows() {
  const words = groups[active.list];
  const matches = words.map((word, index) => ({ word, index })).filter(({ word }) => word.word.toLowerCase().includes(search.toLowerCase()) || (state.settings.showChinese && meaningText(word).includes(search)));
  return matches.length ? matches.map(({ word, index }) => `<div class="word-row ${index === active.index ? 'selected' : ''}" data-word-id="${word.id}"><button class="word-select" data-action="word" data-index="${index}" ${index === active.index ? 'aria-current="true"' : ''}><small>${pad(index + 1)}</small><span><strong>${escape(word.word)}</strong>${renderPhonetic(word, state.settings.showPhonetic, 'row-phonetic')}</span>${state.favorites.includes(word.id) ? `<span class="row-star" data-favorite-level="${favoriteLevel(state.favoriteLevels, word.id)}" aria-label="${favoriteLevel(state.favoriteLevels, word.id)} 级收藏">★</span>` : ''}</button><button class="icon-button row-audio" data-action="audio" data-id="${word.id}" aria-label="播放 ${escape(word.word)} 的发音">${svg('audio')}</button><div class="row-definition">${visibleMeaning(word) ? definitions(word) : `<button class="reveal-inline" data-action="reveal" data-id="${word.id}" aria-label="查看 ${escape(word.word)} 的中文释义">点击查看释义</button>`}</div></div>`).join('') : '<div class="no-results">没有找到这个词</div>';
}
function renderStudy() {
  return preserveStudyViewport(window, paintStudy);
}
function paintStudy() {
  const words = groups[active.list], word = currentWord();
  const session = state.sessions[sessionKey()];
  const seen = session.seen.filter(id => words.some(w => w.id === id)).length;
  const done = isDone(active.mode, active.list);
  const visible = visibleMeaning(word);
  document.querySelector('#main').innerHTML = `<div class="study-breadcrumb"><button data-action="nav" data-view="today">${svg('left')}今日计划</button><span>/</span><span>${tag(active.mode)}练习</span></div><div class="page-heading study-heading"><div><div class="eyebrow">${active.mode === 'new' ? 'LEARN SOMETHING NEW' : 'MAKE IT STICK'}</div><h1>List ${pad(active.list)} <span class="mode-badge ${active.mode}">${tag(active.mode)}</span></h1><p>${words.length} 个单词 · 已浏览 ${seen} 个${done ? ' · 这个 List 已标记完成' : ''}</p></div><div class="study-options"><div class="segmented compact" aria-label="练习模式"><button data-action="mode" data-mode="new" class="${active.mode === 'new' ? 'selected' : ''}">新学</button><button data-action="mode" data-mode="review" class="${active.mode === 'review' ? 'selected' : ''}">复习</button></div><div class="visibility-controls"><label class="switch-control"><input id="chinese-switch" type="checkbox" ${state.settings.showChinese ? 'checked' : ''}><span class="switch"></span>显示中文释义</label>${renderPhoneticToggle(state.settings.showPhonetic)}</div></div></div>
    <div class="study-layout"><section class="study-focus"><div class="flashcard"><div class="flashcard-top"><span class="eyebrow">WORD ${pad(active.index + 1)} <span>/ ${words.length}</span></span>${renderFavoriteStar(word, state, svg('star'), 'favorite-toggle')}</div><div class="word-hero"><h2>${escape(word.word)}</h2><div class="pronunciation">${renderPhonetic(word, state.settings.showPhonetic)}<button class="pronounce-button" data-action="audio" data-id="${word.id}" aria-label="播放 ${escape(word.word)} 的发音">${svg('audio')}<span>听发音</span></button></div><span class="audio-source">${word.audio ? '本地发音音频' : (isAndroidApp() ? '手机系统英语朗读' : '浏览器英语朗读')}</span></div><div class="meaning-area ${visible ? '' : 'hidden-meaning'}">${visible ? `<div class="meaning-label">词性 · 中文释义${!state.settings.showChinese ? '<button class="text-button" data-action="reveal" data-id="' + word.id + '">收起释义</button>' : ''}</div>${definitions(word)}` : `<button class="reveal-button" data-action="reveal" data-id="${word.id}">${svg('eye')}想一想，点击揭晓释义<span>或按空格键</span></button>`}</div><div class="flashcard-bottom"><span>${svg('leaf')}每一次回想，都在加深记忆。</span><label class="mini-check"><input id="auto-audio" type="checkbox" ${state.settings.autoAudio ? 'checked' : ''}>自动发音</label></div></div><div class="word-navigation"><button class="button subtle" data-action="previous" ${active.index === 0 ? 'disabled' : ''}>${svg('left')}上一个</button><div><strong>${active.index + 1}</strong><span> / ${words.length}</span><div class="meter"><i style="width:${(active.index + 1) / words.length * 100}%"></i></div></div><button class="button primary" data-action="next" ${active.index === words.length - 1 ? 'disabled' : ''}>下一个${svg('right')}</button></div><div class="keyboard-hints"><span><kbd>←</kbd><kbd>→</kbd>切换单词</span><span><kbd>空格</kbd>揭晓释义</span><span><kbd>P</kbd>听发音</span><span><kbd>S</kbd>循环收藏星级</span></div><div class="complete-panel"><div>${svg(done ? 'check' : 'book')}<span><strong>${done ? '已完成这个 List' : '记完这一组了吗？'}</strong><small>${done ? '仍可继续练习，不会重复推进进度。' : '点击完成，更新今天的计划和下次起点。'}</small></span></div><button class="button ${done ? 'subtle' : 'primary'}" data-action="${done ? 'continue' : 'complete'}">${done ? '下一个任务' : '完成这个 List'}${svg(done ? 'arrow' : 'check')}</button></div></section>
    <section class="word-panel"><div class="word-panel-heading"><h2>本组词表 <span>${words.length}</span></h2><span>点击单词定位</span></div><label class="word-search">${svg('search')}<input id="word-search" type="search" value="${escape(search)}" placeholder="搜索本组单词" aria-label="搜索本组单词"></label><div class="word-rows" id="word-rows">${studyRows()}</div></section></div>`;
  document.querySelector('.keyboard-hints').insertAdjacentHTML('afterend', renderLearning(word, visible));
  updateAudioButtons();
}
function confirmComplete() {
  const words = groups[active.list];
  const seen = state.sessions[sessionKey()].seen.filter(id => words.some(w => w.id === id)).length;
  if (active.mode === 'review' && !state.learned.includes(active.list)) { notify('这个 List 还未学完，请切换到新学模式先完成学习。'); return; }
  if (seen < words.length) {
    showModal(`<h2 id="modal-title">标记 List ${pad(active.list)} 完成？</h2><p class="modal-copy">本组共 ${words.length} 个词，你在${tag(active.mode)}模式已浏览 ${seen} 个。标记后会更新计划与进度；只是打开或翻看单词不会自动完成。</p><div class="modal-actions"><button class="button subtle" data-action="close-modal">继续练习</button><button class="button primary" data-action="confirm-complete">仍然标记完成 ${svg('check')}</button></div>`);
  } else finishList();
}
function finishList() {
  try {
    completeList(state, active.mode, active.list); save();
    modal.close(); notify(`List ${pad(active.list)} ${tag(active.mode)}完成，进度已保存。`); render();
  } catch (error) { notify(error.message); }
}
function showModal(content) {
  modal.innerHTML = `<button class="modal-close icon-button" data-action="close-modal" aria-label="关闭">${svg('close')}</button>${content}`;
  if (!modal.open) modal.showModal();
  setNativeBackEnabled(true);
}
function settingsModal() {
  showModal(`<div class="eyebrow">YOUR OWN PACE</div><h2 id="modal-title">计划与进度设置</h2><p class="modal-copy">按你的节奏，安排每天的新词和旧词。</p><form id="settings-form"><fieldset><legend>每天的目标</legend><div class="form-grid"><label>每天新学几个 List<input name="dailyNew" type="number" min="1" max="10" step="1" required value="${state.settings.dailyNew}"><small>1–10 个 List</small></label><label>每天复习几个 List<input name="dailyReview" type="number" min="1" max="10" step="1" required value="${state.settings.dailyReview}"><small>1–10 个 List</small></label></div></fieldset><fieldset><legend>已完成的进度</legend><div class="form-grid"><label>已学完至 List<input name="learnedThrough" type="number" min="0" max="48" step="1" required value="${through(state.learned)}"><small>填 24，接下来从 25 开始</small></label><label>已复习至 List<input name="reviewedThrough" type="number" min="0" max="48" step="1" required value="${through(state.reviewed)}"><small>填 10，接下来从 11 开始</small></label></div></fieldset><div class="settings-note">修改目标会更新今日待办。修改已完成进度会重新生成今日计划，并清空浏览位置；收藏保留。次日按最新进度继续安排，不跳过未完成的 List。</div><p id="settings-error" class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="button subtle" data-action="close-modal">取消</button><button type="submit" class="button primary">保存设置 ${svg('check')}</button></div></form><div class="backup-controls"><span>换浏览器前，记得备份进度</span><button class="text-button" data-action="export">${svg('download')}导出</button><label class="text-button import-label">导入<input id="backup-file" type="file" accept=".json,application/json"></label></div>`);
  modal.querySelector('.backup-controls').insertAdjacentHTML('beforebegin','<div class="sync-settings-entry"><button class="button subtle" data-action="sync-settings">手机与电脑同步</button><span>局域网配对 · 离线可用</span></div>');
}
function aboutModal() {
  showModal(`<div class="eyebrow">ABOUT THIS COLLECTION</div><h2 id="modal-title">词库说明与来源</h2><p class="modal-copy">本系统包含 48 个 List、${data.total.toLocaleString()} 个词，供个人学习使用。公开参考版并非新东方官方应用，也不保证与所有印次完全一致。</p><div class="source-details"><h3>分组与词序</h3><p>沿用已整理的 48 List 词表，并与独立公开词集核对。List 13、34、43 与另一卡组的数量分别相差 2、1、1 词，暂不猜补。</p><a href="https://www.scribd.com/document/915116798/" target="_blank" rel="noopener">公开词表 ${svg('arrow')}</a><a href="https://github.com/Dr-Quan/maimemo-v3.4" target="_blank" rel="noopener">独立词集核对 ${svg('arrow')}</a><h3>释义、音标与发音</h3><p>从公开 Anki 词库整理基础词义与音标，未收录原书例句、记忆法等内容；缺失条目由 BSD-3-Clause 许可的公开词库补充。${data.audioCount.toLocaleString()} 个词带本地音频，剩余 ${data.total - data.audioCount} 个词及例句使用${isAndroidApp()?'手机系统':'浏览器'}英语朗读，是否离线可用取决于已安装的英语语音包。</p><a href="https://ankiweb.net/shared/info/657511105" target="_blank" rel="noopener">Anki 公开托福词库 ${svg('arrow')}</a><a href="https://github.com/KyleBing/english-vocabulary" target="_blank" rel="noopener">补充释义词库与许可 ${svg('arrow')}</a><h3>进度与日期</h3><p>进度保存在当前设备。开启局域网配对后，仅在你的电脑同步服务和已配对设备间加密同步，不上传云端。每日计划按北京时间切换；新学和复习分别记录。清除浏览器或应用数据可能丢失进度，可在设置中导出备份。全部 48 个 List 复习完成后，次日开启下一轮复习。</p></div><div class="modal-actions"><button class="button primary" data-action="close-modal">知道了</button></div>`);
}
function downloadBackup() {
  if(exportNativeBackup(JSON.stringify(state,null,2),`词间进度_${today()}.json`))return;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `词间进度_${today()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); notify('进度备份已导出。');
}
function favorite(id) {
  if (!byId.has(id)) return;
  toggleFavorite(state, id);
  save(); render();
}
async function handleAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (button.tagName === 'A' && action) event.preventDefault();
  const id = Number(button.dataset.id);
  if (action === 'nav') { stopAudio(); view = button.dataset.view; render(); window.scrollTo(0, 0); }
  if (action === 'settings') settingsModal();
  if (action === 'sync-settings') syncModal();
  if (action === 'sync-now') { await syncClient.syncNow(); }
  if (action === 'sync-check-network') { await refreshNetwork(true); }
  if (action === 'sync-scan') scanPairCode();
  if (action === 'sync-disconnect') { syncClient.disconnect();syncInfo=null;setPendingAddress('');syncModal(); }
  if (action === 'sync-host') {
    button.disabled=true;
    try{syncInfo=await syncClient.connectDesktop();syncModal();}
    catch{const error=document.querySelector('#sync-error');if(error)error.textContent='同步服务未启动，请先双击“启动手机同步.cmd”。';button.disabled=false;}
  }
  if (action === 'sync-copy-code') {
    try{await copyText(syncInfo.codes[Number(button.dataset.codeIndex)].code);notify('连接码已复制，请在手机词间 App 中粘贴。');}catch{notify('未能自动复制，可选中连接码手动复制。');}
  }
  if (action === 'sync-export-before-pair') {
    const text=syncClient.pairingBackup();if(text)exportNativeBackup(text,'词间首次配对前进度.json');
  }
  if (action === 'about') aboutModal();
  if (action === 'about') modal.querySelector('.source-details').insertAdjacentHTML('beforeend', learningSourceNotes(data.learningCounts));
  if (action === 'close-modal') modal.close();
  if (action === 'open') openList(button.dataset.mode, Number(button.dataset.list));
  if (action === 'continue') { const task = getContinueTask(); if (task) openList(task.mode, task.list); else { view = 'library'; render(); notify('今日计划已完成，可以自由练习词表。'); } }
  if (action === 'mode') openList(button.dataset.mode, active.list, active.index);
  if (action === 'word') changeWord(Number(button.dataset.index));
  if (action === 'previous') changeWord(active.index - 1);
  if (action === 'next') changeWord(active.index + 1);
  if (action === 'audio' && byId.has(id)) play(byId.get(id));
  if (action === 'example-audio' && byId.has(id)) playExample(byId.get(id));
  if (action === 'toggle-phonetic') { state.settings.showPhonetic = !state.settings.showPhonetic; save(); if (view === 'study') renderStudy(); else renderFavorites(); }
  if (action === 'favorite') favorite(id);
  if (action === 'clear-favorite-filters') { favoriteListFilter = 'all'; favoriteLevelFilter = 'all'; renderFavorites(); }
  if (action === 'favorite-open') { const word = byId.get(id); openList(state.learned.includes(word.list) ? 'review' : 'new', word.list, groups[word.list].findIndex(w => w.id === id)); }
  if (action === 'filter') { libraryFilter = button.dataset.value; renderLibrary(); }
  if (action === 'reveal') { revealed.has(id) ? revealed.delete(id) : revealed.add(id); if (view === 'study') renderStudy(); else renderFavorites(); }
  if (action === 'complete') confirmComplete();
  if (action === 'confirm-complete') finishList();
  if (action === 'export') downloadBackup();
  if (action === 'confirm-import') {
    state = sanitizeState(pendingImport, today()); pendingImport = null; save(); stopAudio(); view = 'today'; active = null; modal.close(); render(); notify('已恢复备份进度。');
  }
}
let pendingImport;
document.addEventListener('click', handleAction);
document.addEventListener('change', async event => {
  if(event.target.id==='background-sync-switch'){try{syncClient.setBackgroundEnabled(event.target.checked);}catch{notify('后台同步设置没有保存成功，请重试。');}return;}
  if (event.target.id === 'favorite-list-filter') { favoriteListFilter = event.target.value; stopAudio(); renderFavorites(); }
  if (event.target.id === 'favorite-level-filter') { favoriteLevelFilter = event.target.value; stopAudio(); renderFavorites(); }
  if (event.target.id === 'chinese-switch') { state.settings.showChinese = event.target.checked; revealed.clear(); save(); if (view === 'study') renderStudy(); else renderFavorites(); }
  if (event.target.id === 'auto-audio') { state.settings.autoAudio = event.target.checked; save(); if (event.target.checked) play(currentWord()); }
  if (event.target.id === 'backup-file') {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('备份文件过大');
      const parsed = JSON.parse(await file.text());
      if (parsed.version !== 1 || !Array.isArray(parsed.learned) || !Array.isArray(parsed.reviewed) || !parsed.settings) throw new Error('无效备份');
      pendingImport = parsed;
      const restored = sanitizeState(parsed, today());
      showModal(`<h2 id="modal-title">恢复这份备份？</h2><p class="modal-copy">已学完至 List ${pad(through(restored.learned))}，已复习至 List ${pad(through(restored.reviewed))}，收藏 ${restored.favorites.length} 个词。恢复会替换当前浏览器进度。</p><div class="modal-actions"><button class="button subtle" data-action="close-modal">取消</button><button class="button primary" data-action="confirm-import">恢复备份</button></div>`);
    } catch { notify('未能读取备份，请选择本系统导出的有效 JSON 文件。'); }
  }
});
document.addEventListener('input', event => {
  if(event.target.id==='sync-code')setPendingAddress(event.target.value);
  if (event.target.id === 'word-search') { search = event.target.value; document.querySelector('#word-rows').innerHTML = studyRows(); updateAudioButtons(); }
});
document.addEventListener('submit', async event => {
  if(event.target.id==='sync-pair-form'){
    event.preventDefault();const code=String(new FormData(event.target).get('code')||'').trim();
    if(!code){event.target.querySelector('details').open=true;document.querySelector('#sync-error').textContent='请先扫描电脑二维码，或粘贴完整连接码。';document.querySelector('#sync-code').focus();return;}
    setPendingAddress(code);
    const button=event.target.querySelector('button[type="submit"]');button.disabled=true;
    try{await syncClient.pairPhone(code);setPendingAddress('');syncModal();notify('已连接电脑，之后会自动同步。');}
    catch(error){document.querySelector('#sync-error').textContent=error.message||'未能连接，请检查同一局域网和完整连接码。';button.disabled=false;}
    return;
  }
  if (event.target.id !== 'settings-form') return;
  event.preventDefault();
  const form = new FormData(event.target);
  const values = Object.fromEntries(['dailyNew','dailyReview','learnedThrough','reviewedThrough'].map(key => [key, Number(form.get(key))]));
  const error = validateSettings(values);
  if (error) { document.querySelector('#settings-error').textContent = error; return; }
  applySettings(state, values); save(); modal.close(); stopAudio(); view = 'today'; active = null; render(); notify('计划已更新。');
});
document.addEventListener('keydown', event => {
  if (view !== 'study' || modal.open || event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(event.target.tagName)) return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); changeWord(active.index - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); changeWord(active.index + 1); }
  if (event.code === 'Space') { event.preventDefault(); if (state.settings.showChinese) { state.settings.showChinese = false; revealed.clear(); save(); } else { const id = currentWord().id; revealed.has(id) ? revealed.delete(id) : revealed.add(id); } renderStudy(); }
  if (event.key.toLowerCase() === 'p') { event.preventDefault(); play(currentWord()); }
  if (event.key.toLowerCase() === 's') { event.preventDefault(); if (!event.repeat) favorite(currentWord().id); }
});
modal.addEventListener('click', event => { if (event.target === modal) { const rect = modal.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) modal.close(); } });
modal.addEventListener('close',()=>setNativeBackEnabled(view!=='today'));
function checkDate() {
  if (state && state.plan.date !== today()) { syncDay(state); save(); render(); notify('新的一天，计划已按当前进度更新。'); }
}
window.addEventListener('focus', checkDate);
// An orientation/viewport change needs a fresh layout, not the old study height.
window.addEventListener('resize',()=>{if(view==='study')document.querySelectorAll('#main, .flashcard, .learning-card, .study-focus').forEach(node=>node.style.removeProperty('min-height'));});
window.addEventListener('wordspace-speech-done',()=>{playingWord=null;updateAudioButtons();});
window.addEventListener('wordspace-native-notice',event=>notify(event.detail));
function receivePairCode(code){
  try{parseConnectionCode(code);}catch{notify('不是有效的词间配对二维码，请扫描电脑词间页面显示的二维码。');return;}
  incomingPairCode=code;
  setPendingAddress(code);
  if(syncClient){syncModal();const input=document.querySelector('#sync-code');if(input)input.value=code;const details=document.querySelector('.manual-pairing');if(details)details.open=true;incomingPairCode=null;notify('二维码已识别，请确认连接这台电脑。');}
}
window.addEventListener('wordspace-paircode',event=>receivePairCode(event.detail));
setInterval(checkDate, 60_000);
try {
  const [response, learningResponse] = await Promise.all([fetch('vocabulary.json'), fetch('learning.json')]);
  if (!response.ok || !learningResponse.ok) throw new Error('词库或例句加载失败');
  const [vocabulary, learning] = await Promise.all([response.json(), learningResponse.json()]);
  data = attachLearning(vocabulary, learning);
  groups = Object.fromEntries(Array.from({ length: 48 }, (_, i) => [i + 1, data.words.filter(w => w.list === i + 1)]));
  byId = new Map(data.words.map(w => [w.id, w]));
  try { const raw = localStorage.getItem(STORAGE_KEY); state = raw ? sanitizeState(JSON.parse(raw)) : initialState(); }
  catch { state = initialState(); notify('未能读取已有进度，已使用初始计划。可在设置中恢复备份。'); }
  save();
  try {syncClient=createSyncClient({getState:()=>state,applyState:applySyncedState,onStatus:paintSyncStatus});}
  catch{notify('同步初始化失败，本地背词仍可正常使用。');}
  render();
  if(incomingPairCode&&syncClient)receivePairCode(incomingPairCode);
} catch (error) {
  app.innerHTML = `<div class="load-error"><h1>词库暂时没有打开</h1><p>请通过启动文件打开本地系统，不要直接双击网页文件。</p><button class="button primary" onclick="location.reload()">重新加载</button><small>${escape(error.message)}</small></div>`;
}
