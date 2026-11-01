import {BlockList,isIP} from 'node:net'

// Cloudflare's published proxy ranges, checked 2026-11-01:
// https://www.cloudflare.com/ips-v4/ and https://www.cloudflare.com/ips-v6/
const cloudflare=new BlockList()
for(const cidr of ['173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22','2400:cb00::/32','2606:4700::/32','2803:f800::/32','2405:b500::/32','2405:8100::/32','2a06:98c0::/29','2c0f:f248::/32']){
  const [ip,bits]=cidr.split('/');cloudflare.addSubnet(ip,Number(bits),isIP(ip)===6?'ipv6':'ipv4')
}
function normalizeIp(value){
  if(typeof value!=='string')return ''
  value=value.trim()
  const kind=isIP(value)
  if(kind===4)return value
  if(kind!==6||value.includes('%'))return ''
  const canonical=new URL('http://['+value+']/').hostname.slice(1,-1)
  const mapped=canonical.match(/^::ffff:([\da-f]+):([\da-f]+)$/)
  if(mapped){const high=parseInt(mapped[1],16),low=parseInt(mapped[2],16);return [high>>8,high&255,low>>8,low&255].join('.')}
  return canonical
}
export function supportClientIp(req,env={}){
  const peer=normalizeIp(req.socket?.remoteAddress || '')
  const mode=env.SUPPORT_CLIENT_IP_HEADER || (env.SUPPORT_TRUST_PROXY==='1'?'cf-connecting-ip':'socket')
  const trusted=peer&&(peer==='::1'||peer.startsWith('127.')||cloudflare.check(peer,isIP(peer)===6?'ipv6':'ipv4'))
  // A loopback origin must be reachable only through the trusted Cloudflare tunnel.
  // X-Forwarded-For is deliberately ignored, including in legacy trust-proxy mode.
  if(mode==='cf-connecting-ip'&&trusted){
    const client=normalizeIp(req.headers?.['cf-connecting-ip'])
    if(client)return client
  }
  return peer
}
