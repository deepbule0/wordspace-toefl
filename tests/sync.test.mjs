import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes,randomUUID } from 'node:crypto';
import http from 'node:http';
import { initialState,sanitizeState,completeList,applySettings,syncDay } from '../public/engine.mjs';
import { toggleFavorite } from '../public/favorites.mjs';
import { emptyDocument,updateDocument,mergeDocuments,documentState,validateDocument } from '../public/sync-model.mjs';
import { seal,unseal,parseConnectionCode,privateAddress } from '../public/sync-crypto.mjs';
import { createSyncServer } from '../sync-server.mjs';
const DAY='2026-10-01',A='device-aaaaaaaa',B='device-bbbbbbbb';
const base=()=>updateDocument(emptyDocument(),sanitizeState(initialState(DAY),DAY),A);
const clone=state=>structuredClone(state);
test('initial sync round-trips all data without advancing study progress',()=>{
  const state=sanitizeState(initialState(DAY),DAY);toggleFavorite(state,100);toggleFavorite(state,100);state.sessions['new:25']={index:1,seen:[2100,2101]};state.lastSession={mode:'new',list:25};
  assert.deepEqual(documentState(updateDocument(emptyDocument(),state,A),DAY),state);
});
test('independent offline favorites are merged rather than replacing the whole list',()=>{
  const doc=base(),left=documentState(doc,DAY),right=clone(left);
  toggleFavorite(left,100);toggleFavorite(left,100);toggleFavorite(right,200);
  const x=updateDocument(doc,left,A),y=updateDocument(doc,right,B),result=documentState(mergeDocuments(x,y),DAY);
  assert.deepEqual(new Set(result.favorites),new Set([100,200]));assert.equal(result.favoriteLevels[100],2);assert.equal(result.favoriteLevels[200],1);
  assert.deepEqual(mergeDocuments(x,y),mergeDocuments(y,x));
});
test('deletion tombstones prevent an older favorite from returning',()=>{
  const state=documentState(base(),DAY);for(let i=0;i<3;i++)toggleFavorite(state,100);
  const saved=updateDocument(base(),state,A);toggleFavorite(state,100);const removed=updateDocument(saved,state,A);
  assert.equal(removed.entries['favorite.100'].value,null);
  assert.deepEqual(documentState(mergeDocuments(removed,saved),DAY).favorites,[]);
});
test('simultaneous completion of different Lists preserves both tasks',()=>{
  const doc=base(),left=documentState(doc,DAY),right=clone(left);
  completeList(left,'new',25);completeList(right,'new',26);completeList(left,'review',11);completeList(right,'review',12);
  const result=documentState(mergeDocuments(updateDocument(doc,left,A),updateDocument(doc,right,B)),DAY);
  assert.ok(result.learned.includes(25)&&result.learned.includes(26));assert.deepEqual(result.plan.doneNew,[25,26]);assert.deepEqual(result.plan.doneReview,[11,12]);
});
test('seen words merge while browse position is deterministic',()=>{
  const doc=base(),left=documentState(doc,DAY),right=clone(left);
  left.sessions['new:25']={index:1,seen:[2100]};right.sessions['new:25']={index:2,seen:[2101]};
  const result=documentState(mergeDocuments(updateDocument(doc,left,A),updateDocument(doc,right,B)),DAY);
  assert.deepEqual(result.sessions['new:25'].seen.sort(),[2100,2101]);assert.equal(result.sessions['new:25'].index,2);
});
test('explicit progress resets and session clears are not undone by stale devices',()=>{
  const state=documentState(base(),DAY);completeList(state,'new',25);state.sessions['new:25']={index:1,seen:[2100]};
  const old=updateDocument(base(),state,A);applySettings(state,{dailyNew:2,dailyReview:3,learnedThrough:15,reviewedThrough:8},DAY);
  const reset=updateDocument(old,state,A),result=documentState(mergeDocuments(reset,old),DAY);
  assert.equal(result.learned.at(-1),15);assert.equal(result.reviewed.at(-1),8);assert.deepEqual(result.sessions,{});
});
test('review rollover separates cycles and a stale plan cannot undo the new day',()=>{
  const state=initialState(DAY);state.learned=Array.from({length:48},(_,i)=>i+1);state.reviewed=[...state.learned];
  const old=updateDocument(emptyDocument(),state,A);syncDay(state,'2026-10-02');
  const current=updateDocument(old,state,A),result=documentState(mergeDocuments(old,current),'2026-10-02');
  assert.equal(result.reviewCycle,2);assert.deepEqual(result.reviewed,[]);assert.equal(result.plan.date,'2026-10-02');
});
test('documents reject unsafe keys, counters and oversized values',()=>{
  assert.throws(()=>validateDocument({format:'wordspace-lan-v1',entries:{__proto__:null,evil:{stamp:[1,A],value:1}}}));
  assert.throws(()=>validateDocument({format:'wordspace-lan-v1',entries:{lastSession:{stamp:[Infinity,A],value:null}}}));
  assert.throws(()=>validateDocument({format:'wordspace-lan-v1',entries:{lastSession:{stamp:[1,A],value:'x'.repeat(3000)}}}));
});
test('AES-GCM encrypts and authenticates sync payloads',async()=>{
  const key=randomBytes(32).toString('base64'),payload={favorites:[100],secretText:'private-learning-record'},packet=await seal(key,payload);
  assert.deepEqual(await unseal(key,packet),payload);assert.equal(JSON.stringify(packet).includes('private-learning-record'),false);
  await assert.rejects(()=>unseal(randomBytes(32).toString('base64'),packet));
  packet.data=packet.data.slice(0,-4)+'AAAA';await assert.rejects(()=>unseal(key,packet));
});
test('connection codes restrict requests to literal private addresses and sync port',()=>{
  const key=randomBytes(32).toString('base64'),hub=randomUUID();
  for(const address of ['http://10.1.2.3:4174','http://192.168.1.2:4174','http://172.16.1.2:4174'])assert.equal(privateAddress(address),true);
  for(const address of ['http://8.8.8.8:4174','https://192.168.1.2:4174','http://172.32.1.2:4174','http://192.168.1.2:80','http://user:pass@10.1.2.3:4174','http://example.com:4174','http://10.1.2.3:4174/evil'])assert.equal(privateAddress(address),false);
  const code=Buffer.from(JSON.stringify({version:1,address:'http://192.168.1.2:4174',key,hub})).toString('base64');
  assert.equal(parseConnectionCode(code).hub,hub);assert.equal(parseConnectionCode('wordspace://pair?code='+encodeURIComponent(code)).hub,hub);
  assert.throws(()=>parseConnectionCode('garbage'));
});
test('LAN service protects pairing secrets and merges only encrypted authorized requests',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'wordspace-sync-test-'));
  const {server}=await createSyncServer({directory,port:0});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`,origin='http://127.0.0.1:4173';
  try{
    assert.equal((await fetch(url+'/local/info')).status,403);
    assert.equal((await fetch(url+'/local/info',{headers:{Origin:'https://evil.example'}})).status,403);
    const info=await (await fetch(url+'/local/info',{headers:{Origin:origin}})).json();
    const hello=await (await fetch(url+'/hello')).json();assert.equal('key' in hello,false);
    assert.equal((await fetch(url+'/local/network')).status,403);
    assert.equal((await fetch(url+'/local/network',{headers:{Origin:'https://evil.example'}})).status,403);
    const wrongHostStatus=await new Promise((resolve,reject)=>{const request=http.get(url+'/local/network',{headers:{Origin:origin,Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);});
    assert.equal(wrongHostStatus,403);
    const network=await (await fetch(url+'/local/network',{headers:{Origin:origin}})).json();
    assert.ok(Array.isArray(network.interfaces));assert.equal(network.port,4174);assert.equal(network.lastPeer,null);
    assert.equal(JSON.stringify(network).includes(info.key),false);assert.equal('document' in network,false);
    const requestId=randomUUID(),packet=await seal(info.key,{hub:info.hub,requestId,action:'merge',document:base()});
    const response=await fetch(url+'/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(packet)});
    assert.equal(response.status,200);const reply=await unseal(info.key,await response.json());assert.equal(reply.requestId,requestId);assert.deepEqual(documentState(reply.document,DAY).learned,initialState(DAY).learned);
    assert.equal((await fetch(url+'/sync',{method:'POST',body:JSON.stringify({key:info.key,document:base()})})).status,400);
    assert.equal((await fetch(url+'/sync',{method:'POST',body:JSON.stringify(await seal(randomBytes(32).toString('base64'),{hub:info.hub,requestId,action:'pull'}))})).status,400);
    assert.equal(JSON.parse(await readFile(path.join(directory,'hub.json'),'utf8')).document.format,'wordspace-lan-v1');
    const after=await (await fetch(url+'/local/network',{headers:{Origin:origin}})).json();assert.equal(after.lastPeer,null); // PC loopback isn't a phone.
  }finally{await new Promise(resolve=>server.close(resolve));}
});
