import {generateKeyPairSync,diffieHellman,createPublicKey,createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
// The recipient private key exists only inside the live login worker. If that
// process is killed, a queued command cannot be decrypted from the database.
export function mobileKeys() {
  const {publicKey,privateKey}=generateKeyPairSync('x25519');
  return {publicKey:publicKey.export({type:'spki',format:'der'}).toString('base64'),privateKey};
}
function publicKey(value) {
  if(typeof value!=='string' || value.length>200)throw Error('Invalid login key');
  const key=createPublicKey({key:Buffer.from(value,'base64'),type:'spki',format:'der'});
  if(key.asymmetricKeyType!=='x25519')throw Error('Invalid login key');return key;
}
function shared(privateKey,other) {return createHash('sha256').update(diffieHellman({privateKey,publicKey:publicKey(other)})).digest();}
export function sealCommand(command,recipient,binding) {
  const sender=mobileKeys(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',shared(sender.privateKey,recipient),iv);
  cipher.setAAD(Buffer.from(binding));
  const body=Buffer.concat([cipher.update(JSON.stringify(command),'utf8'),cipher.final()]);
  return JSON.stringify({v:1,pub:sender.publicKey,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),body:body.toString('base64')});
}
export function openCommand(envelope,privateKey,binding) {
  if(typeof envelope!=='string' || envelope.length>24000)throw Error('Invalid command');
  const data=JSON.parse(envelope);if(data.v!==1)throw Error('Invalid command');
  const decipher=createDecipheriv('aes-256-gcm',shared(privateKey,data.pub),Buffer.from(data.iv,'base64'));
  decipher.setAAD(Buffer.from(binding));decipher.setAuthTag(Buffer.from(data.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.body,'base64')),decipher.final()]).toString('utf8'));
}
