'use strict';
const fs=require('node:fs').promises;
const path=require('node:path');
const crypto=require('node:crypto');
const VERSION='TAKY_LOCAL_CHARACTER_OBJECT_STORE_V1';
const clean=v=>typeof v==='string'?v.trim():'';
const nowIso=()=>new Date().toISOString();
const safeName=s=>Buffer.from(String(s),'utf8').toString('base64url');
class LocalCharacterObjectStore{
 constructor(root,{publicBaseUrl='http://127.0.0.1:8787',now=Date.now}={}){this.root=path.resolve(root);this.publicBaseUrl=String(publicBaseUrl).replace(/\/$/,'');this.now=now;this.uploads=new Map();this.reads=new Map()}
 async init(){await fs.mkdir(this.root,{recursive:true});return this}
 _token(){return crypto.randomBytes(24).toString('base64url')}
 _assetPath(assetRef){return path.join(this.root,safeName(assetRef)+'.bin')}
 async createUploadTicket({asset_ref,content_type,byte_size,sha256,expires_in_seconds=300}={}){
  if(!clean(asset_ref)||!clean(content_type)||!Number.isInteger(byte_size)||byte_size<1||!clean(sha256))throw Error('UPLOAD_TICKET_METADATA_REQUIRED');
  const token=this._token(),expires=this.now()+Math.max(30,Math.min(900,Number(expires_in_seconds)||300))*1000;
  this.uploads.set(token,{asset_ref,content_type,byte_size,sha256,expires,uploaded:false});
  return {upload_id:token,upload_url:this.publicBaseUrl+'/_character-assets/upload/'+token,expires_at:new Date(expires).toISOString()};
 }
 async commitUpload({asset_ref,upload_id,sha256}={}){
  const row=this.uploads.get(clean(upload_id));if(!row||row.expires<this.now()||row.asset_ref!==asset_ref||row.sha256!==sha256||!row.uploaded)return{ok:false};
  const file=this._assetPath(asset_ref);let bytes;try{bytes=await fs.readFile(file)}catch{return{ok:false}};
  const actual=crypto.createHash('sha256').update(bytes).digest('hex');if(actual!==sha256)return{ok:false};
  row.committed=true;row.etag=actual;return{ok:true,sha256:actual,etag:actual};
 }
 async createReadTicket({asset_ref,expires_in_seconds=300}={}){
  const committed=[...this.uploads.values()].find(x=>x.asset_ref===asset_ref&&x.committed);if(!committed)return null;
  const token=this._token(),expires=this.now()+Math.max(30,Math.min(900,Number(expires_in_seconds)||300))*1000;
  this.reads.set(token,{asset_ref,content_type:committed.content_type,expires});
  return {read_url:this.publicBaseUrl+'/_character-assets/read/'+token,expires_at:new Date(expires).toISOString()};
 }
 async handleHttp(req,res){
  const url=new URL(req.url,'http://127.0.0.1');
  const upload=url.pathname.match(/^\/_character-assets\/upload\/([A-Za-z0-9_-]{16,128})$/);
  if(upload){
   if(req.method!=='PUT'){res.writeHead(405);res.end();return true}
   const row=this.uploads.get(upload[1]);if(!row||row.expires<this.now()){res.writeHead(410);res.end();return true}
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>row.byte_size){res.writeHead(413);res.end();return true}chunks.push(chunk)}
   if(size!==row.byte_size){res.writeHead(400);res.end();return true}
   const bytes=Buffer.concat(chunks,size),actual=crypto.createHash('sha256').update(bytes).digest('hex');if(actual!==row.sha256){res.writeHead(409);res.end();return true}
   await fs.writeFile(this._assetPath(row.asset_ref),bytes,{flag:'w'});row.uploaded=true;row.uploaded_at=nowIso();res.writeHead(204,{'Cache-Control':'no-store'});res.end();return true;
  }
  const read=url.pathname.match(/^\/_character-assets\/read\/([A-Za-z0-9_-]{16,128})$/);
  if(read){
   if(req.method!=='GET'){res.writeHead(405);res.end();return true}
   const row=this.reads.get(read[1]);if(!row||row.expires<this.now()){res.writeHead(410);res.end();return true}
   let bytes;try{bytes=await fs.readFile(this._assetPath(row.asset_ref))}catch{res.writeHead(404);res.end();return true}
   res.writeHead(200,{'Content-Type':row.content_type,'Content-Length':String(bytes.length),'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'});res.end(bytes);return true;
  }
  return false;
 }
}
module.exports=Object.freeze({VERSION,LocalCharacterObjectStore});
