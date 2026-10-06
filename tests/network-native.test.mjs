import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window=new EventTarget();
const {readNetworkInfo,probeSyncAddress,readDesktopNetwork}=await import('../public/native.mjs');
test('phone metadata can be read offline and older bridges degrade safely',()=>{
  window.WordspaceNative={};assert.match(readNetworkInfo().error,/更新 App/);
  window.WordspaceNative.networkInfo=()=>JSON.stringify({interfaces:[{type:'wifi',ip:'10.42.0.10',prefix:16}]});
  assert.equal(readNetworkInfo().interfaces[0].ip,'10.42.0.10');
  window.WordspaceNative.networkInfo=()=>'{broken';assert.deepEqual(readNetworkInfo().interfaces,[]);
});
test('native probe does not use encrypted sync, rejects public/loopback targets, and sends only address',async()=>{
  let called=0;
  window.WordspaceNative={request(){throw new Error('must not send learning data');},probeConnection:(id,address)=>{called++;assert.equal(address,'http://10.42.1.20:4174');window.dispatchEvent(new CustomEvent('wordspace-native-result',{detail:{id,ok:true,body:JSON.stringify({ok:true,code:'reachable',message:'已连通'})}}));}};
  assert.equal((await probeSyncAddress('http://8.8.8.8:4174')).ok,false);
  assert.equal((await probeSyncAddress('http://127.0.0.1:4174')).ok,false);
  assert.equal(called,0);assert.equal((await probeSyncAddress('http://10.42.1.20:4174')).ok,true);assert.equal(called,1);
});
test('desktop fallback strips private pairing keys and local probes never imply phone reachability',async()=>{
  delete window.WordspaceNative;const original=globalThis.fetch;let sent=[];
  try{
    globalThis.fetch=async(url,options)=>{sent.push([url,options]);if(url.endsWith('/local/network'))return {ok:false,status:404};if(url.endsWith('/local/info'))return {ok:true,json:async()=>({key:'private-key',codes:[{address:'http://10.42.1.20:4174',code:'private-pair-code'}]})};return {ok:true,json:async()=>({service:'wordspace-lan',version:1})};};
    assert.deepEqual(await readDesktopNetwork(),{interfaces:[{ip:'10.42.1.20',name:'局域网'}]});
    const result=await probeSyncAddress('http://127.0.0.1:4174');assert.equal(result.ok,true);assert.match(result.message,/手机.*仍需/);
    assert.equal(sent.length,3);assert.ok(sent.every(([,options])=>!options.body&&!options.method));
  }finally{globalThis.fetch=original;}
});
