import { emptyDocument,validateDocument,updateDocument,mergeDocuments,documentState } from './sync-model.mjs';
import { seal,unseal,parseConnectionCode } from './sync-crypto.mjs';
import { sendSync,isAndroidApp,nativeSyncAgent } from './native.mjs';

const CONFIG_KEY='wordspace.lan.config.v1',DOC_KEY='wordspace.lan.document.v1',DEVICE_KEY='wordspace.lan.device.v1',BACKGROUND_KEY='wordspace.lan.background.v1';
export function createSyncClient({getState,applyState,onStatus,storage=localStorage,surface=window,transport=sendSync,nativeAgent=nativeSyncAgent}) {
  let deviceId=storage.getItem(DEVICE_KEY)||crypto.randomUUID();storage.setItem(DEVICE_KEY,deviceId);
  let document=emptyDocument(),config=null,status='未连接',lastSync=null,lastError=null,busy=false,timer,startupTimer,revision=0,storageError=false;
  let backgroundEnabled=storage.getItem(BACKGROUND_KEY)!=='false',backgroundLastSync=null,backgroundStatus='',backgroundScheduled=null;
  try{const raw=storage.getItem(DOC_KEY);if(raw)document=validateDocument(JSON.parse(raw));}catch{}
  try{const raw=storage.getItem(CONFIG_KEY);if(raw)config=parseConnectionCode(btoa(raw));}catch{}
  const getStatus=()=>({status,connected:Boolean(config),address:config?.address||null,lastSync,lastError,storageError,backgroundEnabled,backgroundLastSync,backgroundStatus,backgroundScheduled});
  const changedStatus=message=>{status=message;onStatus?.(getStatus());};
  const applyDocument=()=>{const next=documentState(document);if(JSON.stringify(next)!==JSON.stringify(getState()))applyState(next);};
  function acceptNative(snapshot){
    if(!snapshot)return;
    if(snapshot.document)document=mergeDocuments(document,validateDocument(snapshot.document));
    backgroundLastSync=snapshot.lastSync||null;backgroundStatus=snapshot.backgroundStatus||'';
    if(typeof snapshot.backgroundScheduled==='boolean')backgroundScheduled=snapshot.backgroundScheduled;
  }
  function refreshNative(){
    const snapshot=nativeAgent?.read();if(!snapshot)return;
    // Import background results before recording an old WebView snapshot; otherwise
    // remotely added favorites would be mistaken for intentional local deletions.
    const next=snapshot.config?parseConnectionCode(btoa(JSON.stringify(snapshot.config))):null;
    if(JSON.stringify(config)!==JSON.stringify(next)){config=next;revision++;}
    backgroundEnabled=snapshot.backgroundEnabled!==false;acceptNative(snapshot);applyDocument();
    config?storage.setItem(CONFIG_KEY,JSON.stringify(config)):storage.removeItem(CONFIG_KEY);
    storage.setItem(BACKGROUND_KEY,String(backgroundEnabled));storage.setItem(DOC_KEY,JSON.stringify(document));
  }
  const persist=()=>{
    storage.setItem(DOC_KEY,JSON.stringify(document));
    const snapshot=nativeAgent?.write(config,document,backgroundEnabled);
    if(snapshot){acceptNative(snapshot);storage.setItem(DOC_KEY,JSON.stringify(document));applyDocument();}
  };
  function record(state){try{document=updateDocument(document,state,deviceId);persist();if(config){clearTimeout(timer);timer=setTimeout(syncNow,700);}}catch{storageError=true;changedStatus('同步记录未能保存，请先导出备份');}}
  async function exchange(connection,action,doc){
    const requestId=crypto.randomUUID();
    const packet=await seal(connection.key,{hub:connection.hub,requestId,action,...(doc?{document:doc}:{})});
    const reply=await unseal(connection.key,await transport(connection.address+'/sync',packet));
    if(reply.requestId!==requestId||reply.hub!==connection.hub)throw new Error('同步响应不匹配');
    return reply.document?validateDocument(reply.document):null;
  }
  async function syncNow(){
    if(busy)return;
    if(surface.document.visibilityState==='hidden')return;
    try{refreshNative();}catch{storageError=true;changedStatus('后台记录读取失败，请先导出备份');return;}
    if(!config)return;
    busy=true;changedStatus('正在同步');const currentRevision=revision,connection=config;
    try{
      const remote=await exchange(connection,'merge',document);if(currentRevision!==revision)return;
      if(remote){document=mergeDocuments(document,remote);persist();const next=documentState(document);if(JSON.stringify(next)!==JSON.stringify(getState()))applyState(next);}
      lastSync=new Date().toISOString();lastError=null;changedStatus('已同步');
    }catch(error){if(currentRevision===revision){lastError=error.message||'电脑暂时无法连接';changedStatus(storageError?'同步记录保存失败，请导出备份':'等待电脑连接 · 离线可继续学习');}}
    finally{busy=false;}
  }
  async function desktopInfo(){
    if(isAndroidApp())throw new Error('请在电脑端开启同步');
    const response=await fetch('http://127.0.0.1:4174/local/info',{signal:AbortSignal.timeout(4000)});
    if(!response.ok)throw new Error('电脑同步服务暂未启动');return response.json();
  }
  async function connectDesktop(){
    const info=await desktopInfo();
    config={version:1,address:info.address,key:info.key,hub:info.hub};revision++;
    storage.setItem(CONFIG_KEY,JSON.stringify(config));record(getState());await syncNow();return info;
  }
  async function pairPhone(code){
    const connection=parseConnectionCode(code),remote=await exchange(connection,'pull');
    if(!remote||!Object.keys(remote.entries).length)throw new Error('请先在电脑端点击“开启同步”，再连接手机');
    // First pairing adopts PC history. Reconnecting the same hub (e.g. a new LAN IP)
    // must preserve unsent phone edits instead of overwriting them with the PC copy.
    const sameHub=config?.hub===connection.hub&&config?.key===connection.key;
    storage.setItem('wordspace.before-pairing.v1',JSON.stringify(getState()));
    storage.setItem('wordspace.before-pairing-sync.v1',JSON.stringify(document));
    config=connection;revision++;document=sameHub?mergeDocuments(document,remote):remote;persist();storage.setItem(CONFIG_KEY,JSON.stringify(config));
    applyState(documentState(document));record(getState());await syncNow();
  }
  function disconnect(){config=null;lastError=null;revision++;clearTimeout(timer);storage.removeItem(CONFIG_KEY);persist();changedStatus('未连接');}
  function setBackgroundEnabled(enabled){backgroundEnabled=Boolean(enabled);storage.setItem(BACKGROUND_KEY,String(backgroundEnabled));persist();changedStatus(status);}
  const interval=setInterval(()=>{if(config)syncNow();},10000);
  const visibilityChange=()=>{if(surface.document.visibilityState==='visible')syncNow();};
  surface.addEventListener('online',syncNow);surface.addEventListener('focus',syncNow);surface.addEventListener('wordspace-native-resume',syncNow);
  surface.document.addEventListener('visibilitychange',visibilityChange);
  try{refreshNative();}catch{storageError=true;}
  record(getState());changedStatus(config?'等待电脑连接':'未连接');if(config)startupTimer=setTimeout(syncNow,300);
  return {record,syncNow,desktopInfo,connectDesktop,pairPhone,disconnect,setBackgroundEnabled,getStatus,hasPairingBackup:()=>Boolean(storage.getItem('wordspace.before-pairing.v1')),pairingBackup:()=>storage.getItem('wordspace.before-pairing.v1'),dispose:()=>{clearInterval(interval);clearTimeout(timer);clearTimeout(startupTimer);surface.removeEventListener('online',syncNow);surface.removeEventListener('focus',syncNow);surface.removeEventListener('wordspace-native-resume',syncNow);surface.document.removeEventListener('visibilitychange',visibilityChange);}};
}
