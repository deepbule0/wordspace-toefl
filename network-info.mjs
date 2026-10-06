import {privateAddress} from './public/sync-crypto.mjs';
export function lanInterfaces(interfaces){
  return Object.entries(interfaces).flatMap(([name,items])=>(items||[])
    .filter(item=>item.family==='IPv4'&&!item.internal&&privateAddress(`http://${item.address}:4174`))
    .map(item=>({name,ip:item.address,prefix:Number.isInteger(Number(item.cidr?.split('/')[1]))?Number(item.cidr.split('/')[1]):null,virtual:/vpn|tap|tun|clash|virtual|vethernet|vmware|zerotier|tailscale/i.test(name)})))
    .sort((a,b)=>Number(a.virtual)-Number(b.virtual)||a.name.localeCompare(b.name));
}
