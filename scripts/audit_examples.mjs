import fs from 'node:fs/promises';
import { normalize, eligibleExample, cleanText, findTarget } from './example_tools.mjs';
const vocab = JSON.parse(await fs.readFile('public/vocabulary.json','utf8'));
const dictionary = new Map();
for (const filename of ['dictionary.jsonl','dictionary_sat.jsonl','dictionary_cet6.jsonl']) {
  for(const line of (await fs.readFile('.sources/'+filename,'utf8')).split(/\r?\n/).filter(Boolean)) {
    const item=JSON.parse(line), key=normalize(item.word);
    const existing=dictionary.get(key) || {sentences:[],phrases:[]};
    existing.sentences.push(...(item.sentences||[])); existing.phrases.push(...(item.phrases||[]));
    dictionary.set(key,existing);
  }
}
const missing = [], missingUsage = [];
for (const word of vocab.words) {
  const record = dictionary.get(normalize(word.word)) || {};
  const ss = (record.sentences || []).filter(s => eligibleExample(word.word, s));
  const phrases = (record.phrases || []).filter(p => cleanText(p.phrase) && cleanText(p.translation) && findTarget(word.word,p.phrase));
  if (!ss.length) missing.push({word:word.word,list:word.list,pos:word.meanings.map(m=>m.pos).join('/'),meaning:word.meanings[0].text});
  if (!phrases.length) missingUsage.push({word:word.word,list:word.list,pos:word.meanings.map(m=>m.pos).join('/'),meaning:word.meanings[0].text});
}
await fs.writeFile('.sources/example_audit.json',JSON.stringify({missing,missingUsage},null,2));
console.log(JSON.stringify({words:vocab.total,missingExample:missing.length,missingUsage:missingUsage.length,missingSample:missing.slice(0,10),missingUsageSample:missingUsage.slice(0,10)},null,2));
