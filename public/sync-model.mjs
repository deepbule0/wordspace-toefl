import { initialState, sanitizeState, today } from './engine.mjs';

export const SYNC_FORMAT = 'wordspace-lan-v1';
export const MAX_SYNC_ENTRIES = 24000;
const settingsKeys = ['dailyNew','dailyReview','showChinese','showPhonetic','autoAudio'];
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const validKey = key => /^(settings\.(dailyNew|dailyReview|showChinese|showPhonetic|autoAudio)|learned\.(?:[1-9]|[1-3]\d|4[0-8])|reviewCycle|reviewed\.\d{1,5}\.(?:[1-9]|[1-3]\d|4[0-8])|favorite\.\d{1,4}|session\.(new|review)\.(?:[1-9]|[1-3]\d|4[0-8])\.(index|seen\.\d{1,4})|lastSession|plan\.\d{4}-\d{2}-\d{2}\.(new|review|doneNew\.(?:[1-9]|[1-3]\d|4[0-8])|doneReview\.(?:[1-9]|[1-3]\d|4[0-8])))$/.test(key);

export function emptyDocument() { return {format:SYNC_FORMAT,clock:0,entries:{}}; }
export function validateDocument(input) {
  if (!input || input.format !== SYNC_FORMAT || !input.entries || typeof input.entries !== 'object' || Array.isArray(input.entries)) throw new Error('无效同步数据');
  const entries = Object.entries(input.entries);
  if (entries.length > MAX_SYNC_ENTRIES) throw new Error('同步数据过大');
  const result = emptyDocument();
  for (const [key,entry] of entries) {
    if (!validKey(key) || !entry || !Array.isArray(entry.stamp) || entry.stamp.length !== 2 || !Number.isSafeInteger(entry.stamp[0]) || entry.stamp[0] < 1 || entry.stamp[0] > 1e12 || !/^[a-zA-Z0-9-]{8,64}$/.test(entry.stamp[1])) throw new Error('同步记录格式错误');
    if (JSON.stringify(entry.value)?.length > 2000 || entry.value === undefined) throw new Error('同步记录格式错误');
    result.entries[key] = {stamp:[...entry.stamp],value:structuredClone(entry.value)};
    result.clock = Math.max(result.clock,entry.stamp[0]);
  }
  return result;
}
const lexical=(a,b)=>a===b?0:a<b?-1:1;
export function canonical(value) {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
function compare(a,b) {
  // Locale-independent ordering is identical in JS and the Android background worker.
  return a.stamp[0] - b.stamp[0] || lexical(a.stamp[1],b.stamp[1]) || lexical(canonical(a.value),canonical(b.value));
}
export function mergeDocuments(a,b) {
  const left = validateDocument(a), right = validateDocument(b), merged = emptyDocument();
  merged.clock = Math.max(left.clock,right.clock);
  for (const key of new Set([...Object.keys(left.entries),...Object.keys(right.entries)])) {
    const x = left.entries[key], y = right.entries[key];
    merged.entries[key] = structuredClone(!x ? y : !y ? x : compare(x,y) >= 0 ? x : y);
  }
  if (Object.keys(merged.entries).length > MAX_SYNC_ENTRIES) throw new Error('同步记录过多，请导出备份并重新配对');
  return merged;
}
export function stateFields(state) {
  const fields = {};
  for (const key of settingsKeys) fields[`settings.${key}`] = state.settings[key];
  for (let n=1;n<=48;n++) fields[`learned.${n}`] = state.learned.includes(n);
  fields.reviewCycle = state.reviewCycle;
  for (let n=1;n<=48;n++) fields[`reviewed.${state.reviewCycle}.${n}`] = state.reviewed.includes(n);
  for (const id of state.favorites) fields[`favorite.${id}`] = state.favoriteLevels?.[id] || 1;
  for (const [key,session] of Object.entries(state.sessions)) {
    const [mode,list] = key.split(':');
    fields[`session.${mode}.${list}.index`] = session.index;
    for (const id of session.seen) fields[`session.${mode}.${list}.seen.${id}`] = true;
  }
  fields.lastSession = state.lastSession;
  if (state.plan) {
    const prefix = `plan.${state.plan.date}.`;
    fields[prefix+'new'] = state.plan.new;
    fields[prefix+'review'] = state.plan.review;
    for (const n of state.plan.doneNew) fields[prefix+`doneNew.${n}`] = true;
    for (const n of state.plan.doneReview) fields[prefix+`doneReview.${n}`] = true;
  }
  return fields;
}
export function updateDocument(document,state,deviceId) {
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(deviceId)) throw new Error('无效设备标识');
  const next = validateDocument(document), fields = stateFields(state), changed = [];
  for (const [key,value] of Object.entries(fields)) if (!next.entries[key] || !same(next.entries[key].value,value)) changed.push([key,value]);
  for (const [key,entry] of Object.entries(next.entries)) {
    // Old daily plans and review cycles are historical, not deletions on rollover.
    if (key.startsWith('plan.') && !key.startsWith(`plan.${state.plan.date}.`)) continue;
    if (key.startsWith('reviewed.') && !key.startsWith(`reviewed.${state.reviewCycle}.`)) continue;
    if (!(key in fields) && entry.value !== null) changed.push([key,null]);
  }
  if (changed.length) {
    next.clock++;
    for (const [key,value] of changed) next.entries[key] = {stamp:[next.clock,deviceId],value:structuredClone(value)};
  }
  return next;
}
export function documentState(document,date=today()) {
  const doc = validateDocument(document), state = initialState(date);
  state.learned=[];state.reviewed=[];state.favorites=[];state.favoriteLevels={};state.sessions={};state.lastSession=null;state.plan=null;
  const value = key => doc.entries[key]?.value;
  for (const key of settingsKeys) if (value(`settings.${key}`) != null) state.settings[key] = value(`settings.${key}`);
  state.reviewCycle = Number.isInteger(value('reviewCycle')) ? value('reviewCycle') : 1;
  for (let n=1;n<=48;n++) {
    if (value(`learned.${n}`) === true) state.learned.push(n);
    if (value(`reviewed.${state.reviewCycle}.${n}`) === true) state.reviewed.push(n);
  }
  for (const [key,entry] of Object.entries(doc.entries)) {
    if (key.startsWith('favorite.')) {
      const id = Number(key.split('.')[1]);
      if (id>=1 && id<=4264 && Number.isInteger(entry.value) && entry.value>=1 && entry.value<=3) {state.favorites.push(id);state.favoriteLevels[id]=entry.value;}
    }
    if (key.startsWith('session.') && entry.value !== null) {
      const [,mode,list,field,id] = key.split('.');
      const session = state.sessions[`${mode}:${list}`] ||= {index:0,seen:[]};
      if (field === 'index') session.index=entry.value;
      if (field === 'seen' && entry.value===true) session.seen.push(Number(id));
    }
  }
  state.lastSession = value('lastSession') || null;
  const prefix=`plan.${date}.`, plannedNew=value(prefix+'new'), plannedReview=value(prefix+'review');
  if (Array.isArray(plannedNew) && Array.isArray(plannedReview)) {
    state.plan={date,new:plannedNew,review:plannedReview,doneNew:[],doneReview:[]};
    for (let n=1;n<=48;n++) {
      if (value(prefix+`doneNew.${n}`)===true) state.plan.doneNew.push(n);
      if (value(prefix+`doneReview.${n}`)===true) state.plan.doneReview.push(n);
    }
  }
  return sanitizeState(state,date);
}
