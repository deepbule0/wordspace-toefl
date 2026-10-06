export const normalize = text => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\u00ad\u200b]/g,'').replace(/[-‐‑–]/g,'');
const irregular = {
  freeze:['froze','frozen'], sting:['stung'], awake:['awoke','awoken'], overrun:['overran'], oversleep:['overslept'], arise:['arose','arisen'],
  bind:['bound'], dig:['dug'], creep:['crept'], flee:['fled'], shrink:['shrank','shrunk'], swing:['swung'], grind:['ground'], strive:['strove','striven'],
  breed:['bred'], seek:['sought'], feed:['fed'], forbid:['forbade','forbidden'], burst:['burst'], cling:['clung'], weave:['wove','woven'], withdraw:['withdrew','withdrawn'],
  shed:['shed'], tread:['trod','trodden'], tear:['tore','torn'], leap:['leapt'], kneel:['knelt'], undergo:['underwent','undergone'], lead:['led'],
  withstand:['withstood'], swing:['swung'], wring:['wrung'], slit:['slit'], lend:['lent'], swallow:['swallowed'],
  fungus:['fungi'], criterion:['criteria'], phenomenon:['phenomena'], genus:['genera'], bacterium:['bacteria'], curriculum:['curricula'],
  thesis:['theses'], axis:['axes'], synthesis:['syntheses'], hypothesis:['hypotheses'], diagnosis:['diagnoses'], analysis:['analyses'], crisis:['crises'],
  flagellum:['flagella'], cilium:['cilia'], appendix:['appendices'], stimulus:['stimuli'], alumnus:['alumni'], larva:['larvae'], cortex:['cortices'],
};
export function wordForms(word) {
  const w = normalize(word);
  const forms = new Set([w, w+'s',w+'es',w+'ed',w+'ing',w+'d',...(irregular[w] || [])]);
  if(w.endsWith('e')) { forms.add(w.slice(0,-1)+'ing'); forms.add(w.slice(0,-1)+'ed'); }
  if(w.endsWith('y')) { forms.add(w.slice(0,-1)+'ies'); forms.add(w.slice(0,-1)+'ied'); }
  if(/[^aeiou][aeiou][bcdfghjklmnpqrstvwxyz]$/.test(w)) { forms.add(w+w.at(-1)+'ed'); forms.add(w+w.at(-1)+'ing'); }
  if(w.endsWith('ie')) forms.add(w.slice(0,-2)+'ying');
  if(w.endsWith('ic')) { forms.add(w+'king'); forms.add(w+'ked'); }
  if(w.endsWith('f')) forms.add(w.slice(0,-1)+'ves');
  if(w.endsWith('fe')) forms.add(w.slice(0,-2)+'ves');
  if(w.includes('ize')) { const british=w.replace('ize','ise'); forms.add(british); forms.add(british+'d'); forms.add(british.slice(0,-1)+'ing'); forms.add(british+'s'); }
  if(w.includes('ization')) forms.add(w.replace('ization','isation'));
  return forms;
}
export function findTarget(word, sentence) {
  const forms = wordForms(word);
  const tokens = sentence.match(/[A-Za-zÀ-ž]+(?:[\u00ad'’‐‑–-][A-Za-zÀ-ž]+)*/g) || [];
  return tokens.find(token => forms.has(normalize(token)) || token.split(/[-‐‑–]/).some(part=>forms.has(normalize(part)))) || '';
}
export function cleanText(text) {
  return String(text || '').replace(/<[^>]*>/g,'').replace(/[\u00ad\u200b]/g,'').replace(/\s+/g,' ').replace(/\s+([.,;!?])/g,'$1').trim();
}
export function eligibleExample(word, example) {
  const en = cleanText(example.sentence), zh = cleanText(example.translation);
  return en.length <= 280 && (en.match(/[A-Za-z]+/g) || []).length >= 4 && /[.!?]["'”’]?$/.test(en) && /[\u4e00-\u9fff]/.test(zh) && !!findTarget(word, en);
}
const academic = /\b(research\w*|scient\w*|universit\w*|students?|professors?|experiment\w*|species|fossils?|plants?|animals?|geolog\w*|history|historical|climate|environment\w*|archae\w*|econom\w*|culture|evolution|ecosystems?|lectures?|library|campus|courses?|museums?|cells?|organisms?|theory|hypothes\w*|evidence|data|ancient|soil|ocean|earth|solar|energy|language|learning)\b/i;
export function exampleScore(example) {
  const en = cleanText(example.sentence);
  const length = (en.match(/[A-Za-z]+/g) || []).length;
  return (academic.test(en) ? 100 : 0) + (length >= 7 && length <= 22 ? 20 : 0) - Math.abs(length-12) / 10;
}
