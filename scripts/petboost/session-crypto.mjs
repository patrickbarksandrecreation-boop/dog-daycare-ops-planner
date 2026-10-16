import { createCipheriv,createDecipheriv,randomBytes } from 'node:crypto';
function key(value) {
  if(typeof value!=='string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('Invalid session encryption key');
  const bytes=Buffer.from(value,'base64');
  if(bytes.length!==32) throw new Error('Invalid session encryption key');
  return bytes;
}
export function seal(state,secret,binding) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key(secret),iv);
  cipher.setAAD(Buffer.from(binding));
  const body=Buffer.concat([cipher.update(JSON.stringify(state),'utf8'),cipher.final()]);
  return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),body:body.toString('base64')});
}
export function unseal(envelope,secret,binding) {
  const data=JSON.parse(envelope);
  if(data.v!==1 || typeof data.body!=='string' || data.body.length>2000000) throw new Error('Invalid session envelope');
  const decipher=createDecipheriv('aes-256-gcm',key(secret),Buffer.from(data.iv,'base64'));
  decipher.setAAD(Buffer.from(binding));decipher.setAuthTag(Buffer.from(data.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.body,'base64')),decipher.final()]).toString('utf8'));
}
