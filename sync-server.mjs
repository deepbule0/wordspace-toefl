import http from 'node:http';
import { randomBytes,randomUUID } from 'node:crypto';
import { readFile,writeFile,mkdir,rename } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mergeDocuments,validateDocument } from './public/sync-model.mjs';
import { seal,unseal } from './public/sync-crypto.mjs';
import {lanInterfaces} from './network-info.mjs';

const origins=new Set(['http://127.0.0.1:4173','http://localhost:4173']);
const loopback=ip=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip);
export async function createSyncServer({directory=fileURLToPath(new URL('./.wordspace-sync/',import.meta.url)),port=4174}={}) {
  await mkdir(directory,{recursive:true});
  const filename=path.join(directory,'hub.json');let hub;
  try {hub=JSON.parse(await readFile(filename,'utf8'));if(typeof hub.key!=='string'||typeof hub.id!=='string')throw new Error('同步配置损坏');if(hub.document)hub.document=validateDocument(hub.document);}
  catch(error) {if(error.code!=='ENOENT')throw error;hub={id:randomUUID(),key:randomBytes(32).toString('base64'),document:null};await writeFile(filename,JSON.stringify(hub),{mode:0o600});}
  let writes=Promise.resolve(),lastPeer=null;
  const store=()=>{writes=writes.catch(()=>{}).then(async()=>{await writeFile(filename+'.tmp',JSON.stringify(hub),{mode:0o600});await rename(filename+'.tmp',filename);});return writes;};
  const addresses=()=>lanInterfaces(networkInterfaces()).map(item=>`http://${item.ip}:4174`);
  const json=(res,status,data,origin)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(origins.has(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})});res.end(JSON.stringify(data));};
  const readBody=async req=>{let text='';for await(const chunk of req){text+=chunk;if(text.length>3_000_000)throw new Error('请求过大');}return JSON.parse(text);};
  const server=http.createServer(async(req,res)=>{
    const origin=req.headers.origin;
    try {
      if(origin&&!origins.has(origin))return json(res,403,{error:'不允许此页面访问同步服务'});
      if(req.method==='OPTIONS'){res.writeHead(origins.has(origin)?204:403,{'Access-Control-Allow-Origin':origin||'null','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'});res.end();return;}
      if(req.url==='/hello'&&req.method==='GET')return json(res,200,{service:'wordspace-lan',version:1,hub:hub.id},origin);
      if(req.url==='/local/network'&&req.method==='GET'){
        if(!loopback(req.socket.remoteAddress)||!origins.has(origin)||!['127.0.0.1','localhost'].includes((req.headers.host||'').split(':')[0]))return json(res,403,{error:'只能从电脑上的词间页面检查网络'},origin);
        return json(res,200,{interfaces:lanInterfaces(networkInterfaces()),port:4174,lastPeer},origin);
      }
      if(req.url==='/local/info'&&req.method==='GET'){
        if(!loopback(req.socket.remoteAddress)||!origins.has(origin)||!['127.0.0.1','localhost'].includes((req.headers.host||'').split(':')[0]))return json(res,403,{error:'只能从电脑上的词间页面配对'},origin);
        const codes=addresses().map(address=>({address,code:Buffer.from(JSON.stringify({version:1,address,key:hub.key,hub:hub.id})).toString('base64')}));
        return json(res,200,{hub:hub.id,key:hub.key,address:'http://127.0.0.1:4174',codes},origin);
      }
      if(req.url!=='/sync'||req.method!=='POST')return json(res,404,{error:'无此接口'},origin);
      const message=await unseal(hub.key,await readBody(req));
      if(message.hub!==hub.id||!/^[-a-zA-Z0-9]{8,64}$/.test(message.requestId))return json(res,403,{error:'配对信息不匹配'},origin);
      if(message.action==='merge'){
        const incoming=validateDocument(message.document);
        hub.document=hub.document?mergeDocuments(hub.document,incoming):incoming;
        await store();
      }else if(message.action!=='pull')return json(res,400,{error:'无效同步操作'},origin);
      if(!loopback(req.socket.remoteAddress))lastPeer={ip:req.socket.remoteAddress.replace(/^::ffff:/,''),seenAt:new Date().toISOString()};
      return json(res,200,await seal(hub.key,{requestId:message.requestId,hub:hub.id,document:hub.document}),origin);
    }catch(error){return json(res,error.message==='请求过大'?413:400,{error:'未能验证同步请求，检查连接码或数据格式'},origin);}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  return {server,hubId:hub.id,port};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {server}=await createSyncServer();
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'同步服务已经运行，或 4174 端口被其他程序占用。':error.message);process.exitCode=1;});
  server.listen(4174,'0.0.0.0',()=>console.log('词间局域网同步已启动（端口 4174）。连接码仅在电脑词间页面中显示，请勿分享给他人。'));
}
