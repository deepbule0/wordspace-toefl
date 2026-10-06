// Isolated browser-only UI fixture. It contains a synthetic pairing key and never
// uses .wordspace-sync or the real browser origin. Not bundled in the Android app.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../public/',import.meta.url));
const fixture=`<div style="position:fixed;bottom:4px;left:4px;z-index:1000;font-size:10px;background:#fff4d7;color:#735d1d;padding:5px;border-radius:5px">手机界面预览 · 测试数据 · 非真机</div><script type="module">
import {initialState} from './engine.mjs';
import {emptyDocument,updateDocument,mergeDocuments} from './sync-model.mjs';
import {seal,unseal} from './sync-crypto.mjs';
const key=btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),config={version:1,address:'http://192.168.1.2:4174',key,hub:'fixture-only-hub'};
const code=btoa(JSON.stringify(config));let snapshot=null,remote=updateDocument(emptyDocument(),initialState(),'fixture-pc-device');
window.WordspaceNative={setBackEnabled(){},stopSpeech(){},speak(){window.dispatchEvent(new Event('wordspace-speech-done'));},copyText(){},exportBackup(){},
networkInfo:()=>JSON.stringify({interfaces:[{type:'wifi',ip:'192.168.1.86',prefix:24,gateway:'192.168.1.1'}],vpn:false}),
probeConnection:(id)=>window.dispatchEvent(new CustomEvent('wordspace-native-result',{detail:{id,ok:true,body:JSON.stringify({ok:true,message:'测试电脑服务可达（模拟结果，非真实手机网络）',checkedAt:Date.now()})}})),
readSyncSnapshot:()=>JSON.stringify(snapshot),writeSyncSnapshot:(raw,doc,enabled)=>{const next=JSON.parse(raw),incoming=JSON.parse(doc);snapshot={config:next,document:snapshot?.config&&next?.hub===snapshot.config.hub?mergeDocuments(snapshot.document,incoming):incoming,backgroundEnabled:enabled,backgroundScheduled:Boolean(next&&enabled)};return JSON.stringify(snapshot);},
scanPairCode:()=>window.dispatchEvent(new CustomEvent('wordspace-paircode',{detail:'wordspace://pair?code='+encodeURIComponent(code)})),
request:async(id,url,body)=>{const request=await unseal(key,JSON.parse(body));if(request.action==='merge')remote=mergeDocuments(remote,request.document);const packet=await seal(key,{hub:config.hub,requestId:request.requestId,document:remote});window.dispatchEvent(new CustomEvent('wordspace-native-result',{detail:{id,ok:true,body:JSON.stringify(packet)}}));}}
await import('./app.mjs');document.title='手机界面预览（测试数据）';
</script>`;
const server=http.createServer(async(req,res)=>{
  try{
    const name=new URL(req.url,'http://localhost').pathname,filename=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!filename.startsWith(root)||!['GET','HEAD'].includes(req.method)){res.writeHead(403).end();return;}
    let content=await readFile(filename);if(name==='/')content=content.toString().replace('<script type="module" src="app.mjs"></script>',fixture);
    const mime={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.mp3':'audio/mpeg','.txt':'text/plain'}[path.extname(filename)]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:content);
  }catch{res.writeHead(404).end();}
});
server.listen(4175,'127.0.0.1',()=>console.log('Isolated phone UI fixture: http://127.0.0.1:4175/'));
