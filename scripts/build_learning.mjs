import fs from 'node:fs/promises';
import { normalize, eligibleExample, cleanText, findTarget, exampleScore } from './example_tools.mjs';
import { preferredUsage } from './usage_overrides.mjs';

const vocabulary = JSON.parse(await fs.readFile('public/vocabulary.json','utf8'));
const dictionary = new Map();
for (const filename of ['dictionary.jsonl','dictionary_sat.jsonl','dictionary_cet6.jsonl']) {
  for(const line of (await fs.readFile('.sources/'+filename,'utf8')).split(/\r?\n/).filter(Boolean)) {
    const item=JSON.parse(line), key=normalize(item.word);
    const existing=dictionary.get(key) || {sentences:[],phrases:[]};
    existing.sentences.push(...(item.sentences||[])); existing.phrases.push(...(item.phrases||[])); dictionary.set(key,existing);
  }
}
const overrides = new Map();
try {
  const lines=(await fs.readFile('scripts/learning_overrides.tsv','utf8')).split(/\r?\n/).filter(line=>line && !line.startsWith('#'));
  for (const line of lines) {
    const [word,en,zh,usage,usageZh]=line.split('\t');
    if(!word || !en || !zh || !usage || !usageZh || overrides.has(normalize(word))) throw new Error('Invalid override: '+word);
    overrides.set(normalize(word),{example:{en,zh,target:findTarget(word,en),source:'wordspace',kind:'original'},usage:[{en:usage,zh:usageZh,type:'curated'}]});
  }
} catch(error) { if(error.code!=='ENOENT') throw error; }

function candidateFragment(word, source) {
  const en=cleanText(source.sentence), zh=cleanText(source.translation);
  if(!findTarget(word.word,en) || !/[\u4e00-\u9fff]/.test(zh) || /[=\[\]{}\/]|\bsb\.|\bsth\./.test(en) || en.length>160 || /[.!?]$/.test(en)) return null;
  const count=(en.match(/[A-Za-z]+/g)||[]).length;
  if(count<2 || count>18) return null;
  if(/^(I|We|You|He|She|They|It|There)\b/.test(en)) {
    const sentence=en+'.';
    if(eligibleExample(word.word,{sentence,translation:zh})) return {en:sentence,zh,target:findTarget(word.word,en),source:'open-dictionary',kind:'dictionary'};
  }
  const nominal=/^(a|an|the|this|that|these|those|my|your|his|her|our|their|some|many|several|two|three|four|five|six|ten|much|more|less|no)\b/i.test(en);
  const pos=word.meanings.map(m=>m.pos).join(' ');
  if(!nominal && !/(?:adj\.|n\.)/.test(pos)) return null;
  if(!nominal && /^(in|on|at|to|for|with|by|from|of|as|over|under|through|between|during|without|out|very|so|rather|highly|extremely)\b/i.test(en)) return null;
  if(/\b(is|are|was|were|has|have|had|will|would|should|must|can|could)\b/.test(en)) return null;
  const object=nominal ? en.replace(/^[A-Z]/,letter=>letter.toLowerCase()) : /^[A-Z]/.test(en) ? en : 'the '+en;
  let sentence, translation;
  if(/\b(paint\w*|images?|pictures?|music\w*|art\w*|exhibit\w*|sculpt\w*|design\w*|novels?|portraits?)\b/i.test(en)) {
    sentence=`The art class discussed ${object}.`; translation=`美术课讨论了${zh.replace(/[。.]$/,'')}。`;
  } else if(/\b(plants?|animals?|species|cells?|soil|rocks?|gases?|chemical\w*|carbon|energy|water|science|scientific|climate|solar|geolog\w*|marine|fossil\w*|metals?|light|air|electric\w*)\b/i.test(en)) {
    sentence=`The science lecture examined ${object}.`; translation=`科学讲座探讨了${zh.replace(/[。.]$/,'')}。`;
  } else if(/\b(histor\w*|cultur\w*|societ\w*|politic\w*|ancient|president\w*|government\w*|polic\w*|tradition\w*|explor\w*)\b/i.test(en)) {
    sentence=`The history class discussed ${object}.`; translation=`历史课讨论了${zh.replace(/[。.]$/,'')}。`;
  } else {
    sentence=`The passage describes ${object}.`; translation=`这篇文章描述了${zh.replace(/[。.]$/,'')}。`;
  }
  return {en:sentence,zh:translation,target:findTarget(word.word,sentence),source:'wordspace-adapted',kind:'adapted',basePhrase:{en,zh}};
}
const stopWords=new Set('a an the this that these those my your his her our their he she it we they i you was were is are be been am has have had will would can could should must do does did and but if although when where while which who whom whose that because so very'.split(' '));
function deriveUsage(word, example) {
  if(example.basePhrase) return {en:example.basePhrase.en,zh:example.basePhrase.zh,type:'example-phrase'};
  const tokens=example.en.replace(/[.!?]["'”’]?$/,'').split(/\s+/);
  const i=tokens.findIndex(t=>normalize(t.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g,''))===normalize(example.target));
  const pos=word.meanings.map(m=>m.pos).join(' ');
  const preps=new Set('of in on at to for with from by over under into about against through between within without'.split(' '));
  let start=i, end=i+1;
  const hasVerb=/(?:^|\s|\/)v(?:t|i)?\./.test(pos);
  const nominalContext=/\b(a|an|the|my|your|his|her|our|their|strong|previous)\b/i.test(tokens.slice(Math.max(0,i-2),i).join(' '));
  if(hasVerb && !nominalContext) {
    while(end<tokens.length && end-i<7 && !/[;,]$/.test(tokens[end-1]) && !['and','but','because','although','that','which','when'].includes(tokens[end].toLowerCase())) end++;
    while(end>i+1 && ((stopWords.has(tokens[end-1].toLowerCase()) && !['it','them','him','her','you','us','me'].includes(tokens[end-1].toLowerCase())) || preps.has(tokens[end-1].toLowerCase()))) end--;
  } else {
    while(start>0 && i-start<3 && !stopWords.has(tokens[start-1].toLowerCase()) && !/[;,]$/.test(tokens[start-1])) start--;
    if(end<tokens.length && preps.has(tokens[end].toLowerCase())) { end++; while(end<tokens.length && end-i<6 && !['and','but','because','which','who','that'].includes(tokens[end].toLowerCase()) && !/[;,]$/.test(tokens[end-1])) end++; }
    else if(/adj\./.test(pos)) { while(end<tokens.length && end-i<3 && !stopWords.has(tokens[end].toLowerCase()) && !preps.has(tokens[end].toLowerCase()) && !/[;,]$/.test(tokens[end-1])) end++; }
  }
  // A bare headword is not a usage. Keep neighbouring sentence context when
  // phrase extraction reaches a clause boundary or a sentence end.
  if(end-start<2) {
    if(start>0) start=Math.max(0,start-2);
    else end=Math.min(tokens.length,end+2);
  }
  const en=tokens.slice(Math.max(0,start),end).join(' ').replace(/^[,;:]+|[,;:]+$/g,'');
  // No claim that a mechanically extracted sentence phrase is a frequency-ranked collocation.
  return {en:en || example.target,zh:'例句中的用法片段，请结合整句翻译理解。',type:'example-phrase'};
}
function choosePhrases(word, record) {
  const seen=new Set();
  return (record.phrases||[]).map(p=>({en:cleanText(p.phrase),zh:cleanText(p.translation),type:'dictionary'}))
    .filter(p=>p.en && /[\u4e00-\u9fff]/.test(p.zh) && p.en.split(/\s+/).length>1 && p.en.length<85 && findTarget(word.word,p.en) && !/[<>]|[=\[\]{}]/.test(p.en) && !seen.has(normalize(p.en)) && seen.add(normalize(p.en)))
    .sort((a,b)=> (exampleScore({sentence:b.en})-exampleScore({sentence:a.en})))
    .slice(0,3);
}
const output=[], missing=[];
for(const word of vocabulary.words) {
  const key=normalize(word.word), record=dictionary.get(key) || {sentences:[],phrases:[]};
  let example,usage;
  if(overrides.has(key)) { ({example,usage}=overrides.get(key)); }
  else {
    const candidates=record.sentences.filter(s=>eligibleExample(word.word,s)).sort((a,b)=>exampleScore(b)-exampleScore(a));
    if(candidates.length) { const best=candidates[0]; example={en:cleanText(best.sentence),zh:cleanText(best.translation),target:findTarget(word.word,best.sentence),source:'open-dictionary',kind:'dictionary'}; }
    else {
      const fragments=record.sentences.map(s=>candidateFragment(word,s)).filter(Boolean).sort((a,b)=>exampleScore({sentence:b.en})-exampleScore({sentence:a.en}));
      example=fragments[0];
    }
    usage=choosePhrases(word,record);
    if(!usage.length && example) usage=[deriveUsage(word,example)];
  }
  if(preferredUsage.has(key)) usage=preferredUsage.get(key);
  if(!example) { missing.push({word:word.word,list:word.list,meaning:word.meanings.map(m=>m.pos+' '+m.text).join('；')}); continue; }
  if(!example.target || !usage.length || !usage.every(u=>findTarget(word.word,u.en))) throw new Error('Missing target or usage: '+word.word);
  output.push({id:word.id,example,usage});
}
const counts={dictionary:0,adapted:0,original:0};
for(const row of output) counts[row.example.kind]++;
await fs.writeFile('.sources/learning_report.json',JSON.stringify({covered:output.length,total:vocabulary.total,counts,missing},null,2));
console.log(JSON.stringify({covered:output.length,total:vocabulary.total,counts,missing},null,2));
if(missing.length===0) await fs.writeFile('public/learning.json',JSON.stringify({version:1,total:output.length,counts,words:output}));
