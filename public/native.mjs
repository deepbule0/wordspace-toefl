import {privateAddress} from './sync-crypto.mjs';
export const isAndroidApp = () => Boolean(window.WordspaceNative);
let nextRequest=0;
const requests=new Map();
window.addEventListener('wordspace-native-result',event=>{
  const result=event.detail,pending=requests.get(result.id);if(!pending)return;
  clearTimeout(pending.timer);requests.delete(result.id);
  try{result.ok?pending.resolve(JSON.parse(result.body)):pending.reject(new Error(result.error||'电脑暂时无法连接'));}
  catch{pending.reject(new Error('同步响应格式错误'));}
});
export async function sendSync(url,body) {
  if(!isAndroidApp()){
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error('同步请求未通过验证');return response.json();
  }
  return new Promise((resolve,reject)=>{
    const id=String(++nextRequest),timer=setTimeout(()=>{requests.delete(id);reject(new Error('电脑暂时无法连接'));},10000);
    requests.set(id,{resolve,reject,timer});window.WordspaceNative.request(id,url,JSON.stringify(body));
  });
}
export function readNetworkInfo(){
  try{
    if(typeof window.WordspaceNative?.networkInfo!=='function')return {interfaces:[],error:'此版本暂不支持读取 IP，请更新 App，或查看系统 Wi‑Fi 详情。'};
    return JSON.parse(window.WordspaceNative.networkInfo());
  }catch{return {interfaces:[],error:'手机未能读取网络信息，可在系统 Wi‑Fi 详情中查看。'};}
}
export async function readDesktopNetwork(){
  try{
    const response=await fetch('http://127.0.0.1:4174/local/network',{signal:AbortSignal.timeout(4000)});
    if(response.ok)return response.json();
    // An already-running older desktop service can still report its addresses.
    if(response.status===404){
      const old=await fetch('http://127.0.0.1:4174/local/info',{signal:AbortSignal.timeout(4000)});
      if(old.ok){const info=await old.json();return {interfaces:(info.codes||[]).filter(item=>privateAddress(item.address)).map(item=>({ip:new URL(item.address).hostname,name:'局域网'}))};}
    }
  }catch{}
  return {interfaces:[],error:'电脑同步服务暂未响应，请双击“启动手机同步.cmd”。'};
}
export async function probeSyncAddress(address){
  if(!privateAddress(address))return {ok:false,message:'请先扫描有效的电脑连接码，确定目标 IP。'};
  if(isAndroidApp()){
    if(new URL(address).hostname==='127.0.0.1')return {ok:false,message:'连接码指向手机自身，请扫描电脑局域网 IP 的二维码。'};
    if(typeof window.WordspaceNative.probeConnection!=='function')return {ok:false,message:'请更新 App 后使用连接检查。'};
    return new Promise((resolve,reject)=>{
      const id=String(++nextRequest),timer=setTimeout(()=>{requests.delete(id);resolve({ok:false,message:'连接检查超时；请核对电脑 IP、服务和网络互访限制。',checkedAt:new Date().toISOString()});},7000);
      requests.set(id,{resolve,reject,timer});
      try{window.WordspaceNative.probeConnection(id,address);}catch{clearTimeout(timer);requests.delete(id);resolve({ok:false,message:'手机未能启动连接检查，请重试。'});}
    });
  }
  let result;
  try{
    const response=await fetch(address+'/hello',{signal:AbortSignal.timeout(4000)});
    const hello=response.ok?await response.json():null;
    result=hello?.service==='wordspace-lan'&&hello.version===1?{ok:true,message:'电脑本机可访问同步服务；手机能否访问仍需在手机端检查。'}:{ok:false,message:'目标没有返回有效的词间同步服务，请检查端口 4174。'};
  }catch{result={ok:false,message:'电脑本机无法访问同步服务，请先启动“启动手机同步.cmd”。'};}
  return {...result,checkedAt:new Date().toISOString()};
}
export function copyText(text){
  if(isAndroidApp()){window.WordspaceNative.copyText(text);return Promise.resolve();}
  return navigator.clipboard.writeText(text);
}
export function exportNativeBackup(text,name){if(!isAndroidApp())return false;window.WordspaceNative.exportBackup(text,name);return true;}
export function speakNative(text){if(!isAndroidApp())return false;window.WordspaceNative.speak(text);return true;}
export function stopNativeSpeech(){if(isAndroidApp())window.WordspaceNative.stopSpeech();}
export function setNativeBackEnabled(enabled){if(isAndroidApp())window.WordspaceNative.setBackEnabled(enabled);}
export function scanPairCode(){if(isAndroidApp())window.WordspaceNative.scanPairCode();}
const checkedSnapshot=text=>{const snapshot=JSON.parse(text);if(snapshot?.error)throw new Error(snapshot.error);return snapshot;};
export const nativeSyncAgent={
  read:()=>isAndroidApp()?checkedSnapshot(window.WordspaceNative.readSyncSnapshot()):null,
  write:(config,document,enabled)=>isAndroidApp()?checkedSnapshot(window.WordspaceNative.writeSyncSnapshot(JSON.stringify(config),JSON.stringify(document),enabled)):null,
};
