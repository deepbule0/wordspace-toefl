import qrcode from './vendor/qrcode-generator-v2.0.4.mjs';
import {parseConnectionCode} from './sync-crypto.mjs';

export function pairingPayload(code){parseConnectionCode(code);return 'wordspace://pair?code='+encodeURIComponent(code);}
export function pairingMatrix(code){const qr=qrcode(0,'M');qr.addData(pairingPayload(code),'Byte');qr.make();return Array.from({length:qr.getModuleCount()},(_,y)=>Array.from({length:qr.getModuleCount()},(_,x)=>qr.isDark(y,x)));}
export function pairingSvg(code){
  const matrix=pairingMatrix(code),size=matrix.length+8,parts=[];
  matrix.forEach((row,y)=>row.forEach((dark,x)=>{if(dark)parts.push(`M${x+4} ${y+4}h1v1h-1z`);}));
  // No payload in attributes or external QR API; preserve the four-module quiet zone.
  return `<svg class="pairing-qr" role="img" aria-label="手机配对二维码" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${parts.join('')}" fill="#000"/></svg>`;
}
