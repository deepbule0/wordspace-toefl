import { favoriteLevel } from './favorites.mjs';
export const LIST_COUNT = 48;
export const DEFAULTS = Object.freeze({ dailyNew: 2, dailyReview: 3, learnedThrough: 24, reviewedThrough: 10, showChinese: true, showPhonetic: true, autoAudio: false });

export function today(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const range = count => Array.from({ length: count }, (_, i) => i + 1);
const integer = (n, fallback, min, max) => Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
const validLists = values => Array.isArray(values) ? [...new Set(values.filter(n => Number.isInteger(n) && n >= 1 && n <= LIST_COUNT))].sort((a, b) => a - b) : [];
export function through(lists) {
  const set = new Set(lists); let n = 0;
  while (set.has(n + 1) && n < LIST_COUNT) n++;
  return n;
}
function planFor(state, date) {
  return {
    date,
    new: range(LIST_COUNT).filter(n => !state.learned.includes(n)).slice(0, state.settings.dailyNew),
    review: range(through(state.learned)).filter(n => !state.reviewed.includes(n)).slice(0, state.settings.dailyReview),
    doneNew: [], doneReview: [],
  };
}
export function initialState(date = today()) {
  const state = { version: 1, settings: { ...DEFAULTS }, learned: range(24), reviewed: range(10), reviewCycle: 1, favorites: [], favoriteLevels: {}, sessions: {}, lastSession: null, plan: null };
  state.plan = planFor(state, date);
  return state;
}
export function sanitizeState(input, date = today()) {
  if (!input || input.version !== 1) return initialState(date);
  const s = input.settings || {};
  const learned = validLists(input.learned);
  const reviewed = validLists(input.reviewed).filter(n => learned.includes(n));
  const state = {
    version: 1,
    settings: { ...DEFAULTS, dailyNew: integer(s.dailyNew, 2, 1, 10), dailyReview: integer(s.dailyReview, 3, 1, 10), showChinese: typeof s.showChinese === 'boolean' ? s.showChinese : true, showPhonetic: typeof s.showPhonetic === 'boolean' ? s.showPhonetic : true, autoAudio: s.autoAudio === true },
    learned, reviewed, reviewCycle: integer(input.reviewCycle, 1, 1, 10000),
    favorites: Array.isArray(input.favorites) ? [...new Set(input.favorites.filter(n => Number.isInteger(n) && n >= 1 && n <= 4264))] : [],
    favoriteLevels: {}, sessions: {}, lastSession: null, plan: null,
  };
  state.favoriteLevels = Object.fromEntries(state.favorites.map(id => [id, favoriteLevel(input.favoriteLevels, id)]));
  for (const [key, session] of Object.entries(input.sessions || {})) {
    if (!/^(new|review):([1-9]|[1-3]\d|4[0-8])$/.test(key) || !session || typeof session !== 'object') continue;
    state.sessions[key] = { index: integer(session.index, 0, 0, 100), seen: Array.isArray(session.seen) ? [...new Set(session.seen.filter(n => Number.isInteger(n) && n >= 1 && n <= 4264))] : [] };
  }
  if (input.lastSession && ['new', 'review'].includes(input.lastSession.mode) && validLists([input.lastSession.list]).length) state.lastSession = { mode: input.lastSession.mode, list: input.lastSession.list };
  const p = input.plan;
  if (p && /^\d{4}-\d{2}-\d{2}$/.test(p.date)) {
    state.plan = { date: p.date, new: validLists(p.new), review: validLists(p.review).filter(n => n <= through(learned)), doneNew: validLists(p.doneNew).filter(n => learned.includes(n)), doneReview: validLists(p.doneReview).filter(n => reviewed.includes(n)) };
    state.plan.doneNew = state.plan.doneNew.filter(n => state.plan.new.includes(n));
    state.plan.doneReview = state.plan.doneReview.filter(n => state.plan.review.includes(n));
  }
  return syncDay(state, date);
}
export function syncDay(state, date = today()) {
  if (state.plan?.date === date) return state;
  if (through(state.reviewed) === LIST_COUNT) { state.reviewed = []; state.reviewCycle++; }
  state.plan = planFor(state, date);
  return state;
}
export function validateSettings(settings) {
  if (![settings.dailyNew, settings.dailyReview].every(n => Number.isInteger(n) && n >= 1 && n <= 10)) return '每天的新学和复习数量请填写 1–10 个 List。';
  if (![settings.learnedThrough, settings.reviewedThrough].every(n => Number.isInteger(n) && n >= 0 && n <= 48)) return '已完成进度请填写 0–48。';
  if (settings.reviewedThrough > settings.learnedThrough) return '复习进度不能超过已学完的 List。';
  return '';
}
export function applySettings(state, settings, date = today()) {
  const error = validateSettings(settings);
  if (error) throw new Error(error);
  const progressChanged = settings.learnedThrough !== through(state.learned) || settings.reviewedThrough !== through(state.reviewed);
  const countsChanged = settings.dailyNew !== state.settings.dailyNew || settings.dailyReview !== state.settings.dailyReview;
  state.settings.dailyNew = settings.dailyNew; state.settings.dailyReview = settings.dailyReview;
  if (progressChanged) { state.learned = range(settings.learnedThrough); state.reviewed = range(settings.reviewedThrough); state.sessions = {}; state.lastSession = null; }
  if (progressChanged || countsChanged) {
    // Keep already completed tasks when only the daily quota is changed.
    const doneNew = progressChanged ? [] : state.plan.doneNew;
    const doneReview = progressChanged ? [] : state.plan.doneReview;
    state.plan = planFor(state, date);
    state.plan.new = [...doneNew, ...state.plan.new.slice(0, Math.max(0, settings.dailyNew - doneNew.length))];
    state.plan.review = [...doneReview, ...state.plan.review.slice(0, Math.max(0, settings.dailyReview - doneReview.length))];
    state.plan.doneNew = [...doneNew]; state.plan.doneReview = [...doneReview];
  }
  return state;
}
export function completeList(state, mode, list) {
  if (!['new', 'review'].includes(mode) || !validLists([list]).length) throw new Error('无效的 List');
  if (mode === 'review' && !state.learned.includes(list)) throw new Error('请先学完这个 List，再标记复习完成。');
  const key = mode === 'new' ? 'learned' : 'reviewed';
  state[key] = validLists([...state[key], list]);
  const doneKey = mode === 'new' ? 'doneNew' : 'doneReview';
  if (state.plan[mode].includes(list)) state.plan[doneKey] = validLists([...state.plan[doneKey], list]);
  return state;
}
export function remaining(state, mode) {
  return state.plan[mode].filter(n => !state.plan[mode === 'new' ? 'doneNew' : 'doneReview'].includes(n));
}
export function planProgress(state) {
  return { done: state.plan.doneNew.length + state.plan.doneReview.length, total: state.plan.new.length + state.plan.review.length };
}
