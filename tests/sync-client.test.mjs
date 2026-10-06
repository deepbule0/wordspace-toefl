import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {initialState,today} from '../public/engine.mjs';
import {toggleFavorite} from '../public/favorites.mjs';
import {emptyDocument,updateDocument,mergeDocuments,documentState} from '../public/sync-model.mjs';
import {seal,unseal} from '../public/sync-crypto.mjs';

// A DOM-free harness runs the actual client with isolated device storage and the
// same encrypted request/response protocol. It never touches the user's browser.
globalThis.window=new EventTarget();
const {createSyncClient}=await import('../public/sync-client.mjs');
const CONFIG='wordspace.lan.config.v1',DOC='wordspace.lan.document.v1';
function memoryStorage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
function fixture(){
  const key=randomBytes(32).toString('base64'),hub=randomUUID();
  let online=true,remote=updateDocument(emptyDocument(),initialState(),'computer-device');
  const connection=address=>({version:1,key,hub,address});
  const code=address=>Buffer.from(JSON.stringify(connection(address))).toString('base64');
  const transport=async(url,packet)=>{
    if(!online)throw new Error('offline');
    const request=await unseal(key,packet);assert.equal(request.hub,hub);
    if(request.action==='merge')remote=mergeDocuments(remote,request.document);
    return seal(key,{hub,requestId:request.requestId,document:remote});
  };
  const device=(storage=memoryStorage(),initial=initialState(),nativeAgent)=>{
    let state=structuredClone(initial);const surface=new EventTarget();surface.document=new EventTarget();surface.document.visibilityState='visible';
    const client=createSyncClient({storage,surface,transport,nativeAgent,getState:()=>state,applyState:next=>{state=next;}});
    return {client,storage,surface,get state(){return state;}};
  };
  return {device,connection,code,setOnline:value=>{online=value;},get remote(){return remote;},setRemote:doc=>{remote=doc;}};
}
test('first pairing keeps a backup and adopts PC progress instead of phone defaults',async()=>{
  const f=fixture(),pc=documentState(f.remote);toggleFavorite(pc,101);f.setRemote(updateDocument(f.remote,pc,'computer-device'));
  const initial=initialState();toggleFavorite(initial,202);const phone=f.device(undefined,initial);
  try{
    await phone.client.pairPhone(f.code('http://192.168.1.2:4174'));
    assert.deepEqual(phone.state.favorites,[101]);assert.deepEqual(JSON.parse(phone.client.pairingBackup()).favorites,[202]);
    assert.equal(phone.client.getStatus().status,'已同步');assert.equal(phone.state.learned.at(-1),24);assert.equal(phone.state.reviewed.at(-1),10);
  }finally{phone.client.dispose();}
});

function nativeMirror(){
  let snapshot=null;
  return {read:()=>structuredClone(snapshot),write:(config,document,backgroundEnabled)=>{
    const same=snapshot?.config&&config&&snapshot.config.hub===config.hub&&snapshot.config.key===config.key;
    const merged=same?mergeDocuments(snapshot.document,document):document;
    snapshot={...snapshot,config:structuredClone(config),document:structuredClone(merged),backgroundEnabled,backgroundScheduled:Boolean(config&&backgroundEnabled)};
    return structuredClone(snapshot);
  },backgroundReceive:document=>{snapshot.document=mergeDocuments(snapshot.document,document);snapshot.lastSync=Date.now();snapshot.backgroundStatus='后台已同步';}};
}
test('native background results are applied before stale UI state can delete them on restart',async()=>{
  const f=fixture(),mirror=nativeMirror(),storage=memoryStorage(),first=f.device(storage,initialState(),mirror);let second;
  try{
    await first.client.pairPhone(f.code('http://192.168.1.2:4174'));first.client.dispose();
    const remoteState=documentState(f.remote);toggleFavorite(remoteState,606);const remote=updateDocument(f.remote,remoteState,'computer-device');mirror.backgroundReceive(remote);f.setRemote(remote);
    second=f.device(storage,first.state,mirror);
    assert.deepEqual(second.state.favorites,[606]);await second.client.syncNow();assert.deepEqual(documentState(f.remote).favorites,[606]);
  }finally{first.client.dispose();second?.client.dispose();}
});
test('returning to foreground reads background changes and preserves distinct local edits',async()=>{
  const f=fixture(),mirror=nativeMirror(),phone=f.device(undefined,initialState(),mirror);
  try{
    await phone.client.pairPhone(f.code('http://192.168.1.2:4174'));
    const remoteState=documentState(f.remote);toggleFavorite(remoteState,707);mirror.backgroundReceive(updateDocument(f.remote,remoteState,'computer-device'));
    toggleFavorite(phone.state,808);phone.client.record(phone.state);
    assert.deepEqual(new Set(phone.state.favorites),new Set([707,808]));await phone.client.syncNow();assert.deepEqual(new Set(documentState(f.remote).favorites),new Set([707,808]));
  }finally{phone.client.dispose();}
});
test('background toggle is device-local, persistent and cancelled by disconnect',async()=>{
  const f=fixture(),mirror=nativeMirror(),phone=f.device(undefined,initialState(),mirror);
  try{
    await phone.client.pairPhone(f.code('http://192.168.1.2:4174'));assert.equal(mirror.read().backgroundScheduled,true);
    phone.client.setBackgroundEnabled(false);assert.equal(mirror.read().backgroundScheduled,false);assert.equal(phone.client.getStatus().backgroundEnabled,false);
    assert.equal('settings.backgroundEnabled' in f.remote.entries,false);
    phone.client.setBackgroundEnabled(true);phone.client.disconnect();assert.equal(mirror.read().config,null);assert.equal(mirror.read().backgroundScheduled,false);
  }finally{phone.client.dispose();}
});
test('offline edits on two clients converge after reconnection without losing either favorite',async()=>{
  const f=fixture(),left=f.device(),right=f.device();
  try{
    await left.client.pairPhone(f.code('http://192.168.1.2:4174'));await right.client.pairPhone(f.code('http://192.168.1.2:4174'));
    f.setOnline(false);toggleFavorite(left.state,111);left.client.record(left.state);toggleFavorite(right.state,222);toggleFavorite(right.state,222);right.client.record(right.state);
    await left.client.syncNow();assert.match(left.client.getStatus().status,/离线/);
    f.setOnline(true);await left.client.syncNow();await right.client.syncNow();await left.client.syncNow();
    assert.deepEqual(new Set(left.state.favorites),new Set([111,222]));assert.deepEqual(new Set(right.state.favorites),new Set([111,222]));assert.equal(left.state.favoriteLevels[222],2);
  }finally{left.client.dispose();right.client.dispose();}
});
test('changing the same hub LAN address preserves and uploads unsent phone edits',async()=>{
  const f=fixture(),phone=f.device();
  try{
    await phone.client.pairPhone(f.code('http://192.168.1.2:4174'));
    f.setOnline(false);toggleFavorite(phone.state,303);phone.client.record(phone.state);
    f.setOnline(true);await phone.client.pairPhone(f.code('http://192.168.1.20:4174'));
    assert.deepEqual(phone.state.favorites,[303]);assert.deepEqual(documentState(f.remote).favorites,[303]);
    assert.equal(JSON.parse(phone.storage.getItem(CONFIG)).address,'http://192.168.1.20:4174');
  }finally{phone.client.dispose();}
});
test('offline status retains safe target IP and reason, but never exposes pairing keys',async()=>{
  const f=fixture(),phone=f.device();
  try{
    await phone.client.pairPhone(f.code('http://10.42.1.20:4174'));
    f.setOnline(false);await phone.client.syncNow();
    const status=phone.client.getStatus();assert.equal(status.address,'http://10.42.1.20:4174');assert.equal(status.lastError,'offline');assert.equal('key' in status,false);assert.equal(JSON.stringify(status).includes(f.connection(status.address).key),false);
    f.setOnline(true);await phone.client.syncNow();assert.equal(phone.client.getStatus().lastError,null);
    phone.client.disconnect();assert.equal(phone.client.getStatus().address,null);
  }finally{phone.client.dispose();}
});
test('restarting the app recovers pending offline sync records from its own storage',async()=>{
  const f=fixture(),storage=memoryStorage(),first=f.device(storage);let second;
  try{
    await first.client.pairPhone(f.code('http://192.168.1.2:4174'));f.setOnline(false);toggleFavorite(first.state,404);first.client.record(first.state);first.client.dispose();
    assert.ok(JSON.parse(storage.getItem(DOC)).entries['favorite.404']);second=f.device(storage,first.state);
    f.setOnline(true);await second.client.syncNow();assert.deepEqual(documentState(f.remote).favorites,[404]);
  }finally{first.client.dispose();second?.client.dispose();}
});
test('disconnect retains local progress and stops sending records',async()=>{
  const f=fixture(),phone=f.device();
  try{
    await phone.client.pairPhone(f.code('http://192.168.1.2:4174'));phone.client.disconnect();toggleFavorite(phone.state,505);phone.client.record(phone.state);await phone.client.syncNow();
    assert.deepEqual(phone.state.favorites,[505]);assert.deepEqual(documentState(f.remote).favorites,[]);assert.equal(phone.client.getStatus().connected,false);
  }finally{phone.client.dispose();}
});
