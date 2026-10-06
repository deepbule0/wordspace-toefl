const encoder = new TextEncoder(), decoder = new TextDecoder();
const aad = encoder.encode('wordspace-lan-v1');
export const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
export const fromBase64 = text => Uint8Array.from(atob(text),c=>c.charCodeAt(0));
async function keyFrom(secret) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(secret)) throw new Error('连接码格式不正确');
  return crypto.subtle.importKey('raw',fromBase64(secret),'AES-GCM',false,['encrypt','decrypt']);
}
export async function seal(secret,payload) {
  const nonce=crypto.getRandomValues(new Uint8Array(12)), key=await keyFrom(secret);
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:aad},key,encoder.encode(JSON.stringify(payload))));
  // Avoid spreading large payloads into the JS call stack.
  let binary='';for(let i=0;i<encrypted.length;i+=8192)binary+=String.fromCharCode(...encrypted.subarray(i,i+8192));
  return {nonce:toBase64(nonce),data:btoa(binary)};
}
export async function unseal(secret,packet) {
  if (!packet || typeof packet.nonce!=='string' || typeof packet.data!=='string' || packet.data.length>4_000_000) throw new Error('无效加密数据');
  const nonce=fromBase64(packet.nonce);if(nonce.length!==12)throw new Error('无效加密数据');
  const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce,additionalData:aad},await keyFrom(secret),fromBase64(packet.data));
  return JSON.parse(decoder.decode(decrypted));
}
export function privateAddress(address) {
  try {
    const url=new URL(address), parts=url.hostname.split('.').map(Number);
    return url.protocol==='http:' && !url.username && !url.password && url.port==='4174' && (url.pathname==='/' || url.pathname==='') && !url.search && !url.hash && /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) && parts.every(n=>Number.isInteger(n)&&n>=0&&n<=255) && (parts[0]===10 || parts[0]===192&&parts[1]===168 || parts[0]===172&&parts[1]>=16&&parts[1]<=31 || url.hostname==='127.0.0.1');
  }catch{return false;}
}
export function parseConnectionCode(text) {
  const raw=text.trim().replace(/^wordspace:\/\/pair\?code=/,'');
  const data=JSON.parse(new TextDecoder().decode(fromBase64(decodeURIComponent(raw))));
  if(data.version!==1 || !privateAddress(data.address) || !/^[A-Za-z0-9+/]{43}=$/.test(data.key) || typeof data.hub!=='string' || !/^[a-zA-Z0-9-]{8,64}$/.test(data.hub))throw new Error('无效连接码，请从电脑复制完整连接码');
  return data;
}
