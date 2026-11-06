'use strict';
/*
 * SIEZEALL account Google Drive REST adapter.
 * Transport ONLY: no user tokens, no browser credentials, no ACL changes.
 * An authorized server-owned access-token provider must be injected.
 * Google Drive files.list uses appProperties for archive-id lookup.
 */
const VERSION='TAKY_SIEZEALL_DRIVE_REST_TRANSPORT_V1';
const API='https://www.googleapis.com/drive/v3/files';
const UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
const ID=/^[A-Za-z0-9_-]{10,160}$/;
const ARCHIVE=/^u_[a-f0-9]{48}$/;
const FIELD='id,name,mimeType,parents,appProperties,permissions(id,type,role,emailAddress)';
const string=x=>String(x??'').trim();
function assertToken(token){
 if(typeof token!=='string'||token.length<16||/\s/.test(token))
   throw Error('SIEZEALL_SERVER_BEARER_UNAVAILABLE');
 return token;
}
function create({getAccessToken,fetchImpl=globalThis.fetch}={}){
 if(typeof getAccessToken!=='function'||typeof fetchImpl!=='function')
   throw Error('SIEZEALL_AUTHENTICATED_SERVICE_TRANSPORT_REQUIRED');
 async function call(method,url,{json=null,body=null,contentType=null}={}){
  const token=assertToken(await getAccessToken());
  const headers={Authorization:'Bearer '+token,Accept:'application/json'};
  if(contentType)headers['Content-Type']=contentType;
  else if(json!==null)headers['Content-Type']='application/json; charset=utf-8';
  const res=await fetchImpl(url,{method,headers,
    ...(json!==null?{body:JSON.stringify(json)}:body!==null?{body}:{}),
    redirect:'error',cache:'no-store'});
  if(!res||typeof res.status!=='number')throw Error('SIEZEALL_DRIVE_INVALID_HTTP_RESPONSE');
  if(!res.ok)throw Object.assign(Error('SIEZEALL_DRIVE_HTTP_'+res.status),{status:res.status});
  return res;
 }
 async function getMetadata(id){
  if(!ID.test(string(id)))throw Error('SIEZEALL_DRIVE_FILE_ID_INVALID');
  const u=new URL(API+'/'+encodeURIComponent(id));
  u.searchParams.set('fields',FIELD);
  const res=await call('GET',u.href);
  const result=await res.json();
  if(!result||result.id!==id)throw Error('SIEZEALL_DRIVE_METADATA_SCOPE_INVALID');
  return result;
 }
 async function findImmutable({folder_id,archive_id}={}){
  if(!ID.test(string(folder_id))||!ARCHIVE.test(string(archive_id)))
   throw Error('SIEZEALL_ARCHIVE_LOOKUP_SCOPE_INVALID');
  const q="'"+folder_id+"' in parents and trashed = false and appProperties has { key='taky_archive_id' and value='"+archive_id+"' }";
  const u=new URL(API);
  u.searchParams.set('q',q);
  u.searchParams.set('fields','nextPageToken,files('+FIELD+')');
  u.searchParams.set('pageSize','100');
  const res=await call('GET',u.href);
  const result=await res.json();
  if(result?.nextPageToken)throw Error('SIEZEALL_ARCHIVE_AMBIGUOUS_PAGINATION');
  if(!Array.isArray(result?.files)||result.files.length>1)
   throw Error('SIEZEALL_ARCHIVE_AMBIGUOUS_MATCH');
  const found=result.files[0];
  if(!found)return null;
  if(found.appProperties?.taky_archive_id!==archive_id ||
     !Array.isArray(found.parents)||!found.parents.includes(folder_id))
   throw Error('SIEZEALL_ARCHIVE_RESULT_SCOPE_INVALID');
  return found;
 }
 async function createImmutable({folder_id,archive_id,name,mime_type,bytes}={}){
  if(!ID.test(string(folder_id))||!ARCHIVE.test(string(archive_id))||
     name!==archive_id+'.encrypted.json'||mime_type!=='application/json'||
     !Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>15_000_000)
    throw Error('SIEZEALL_ARCHIVE_UPLOAD_VALIDATION_FAILED');
  const boundary='taky-'+require('node:crypto').randomBytes(16).toString('hex');
  const metadata={
   name,mimeType:mime_type,parents:[folder_id],
   appProperties:{taky_archive_id:archive_id,taky_scope:'PRIVATE_USER_DATA_BACKUP'}
  };
  const prefix=Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+
   JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n');
  const suffix=Buffer.from('\r\n--'+boundary+'--\r\n');
  const url=new URL(UPLOAD);
  url.searchParams.set('uploadType','multipart');
  url.searchParams.set('fields',FIELD);
  const response=await call('POST',url.href,{
   body:Buffer.concat([prefix,bytes,suffix]),
   contentType:'multipart/related; boundary='+boundary
  });
  const result=await response.json();
  if(!result?.id||!ID.test(result.id)||
     !result.parents?.includes(folder_id)||result.appProperties?.taky_archive_id!==archive_id)
    throw Error('SIEZEALL_ARCHIVE_CREATE_READBACK_REQUIRED');
  return result;
 }
 async function readFileBytes(id){
  if(!ID.test(string(id)))throw Error('SIEZEALL_ARCHIVE_FILE_ID_INVALID');
  const u=new URL(API+'/'+encodeURIComponent(id));
  u.searchParams.set('alt','media');
  const response=await call('GET',u.href);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>15_000_000)throw Error('SIEZEALL_ARCHIVE_READ_SIZE_EXCEEDED');
  return bytes;
 }
 return Object.freeze({version:VERSION,getMetadata,findImmutable,createImmutable,readFileBytes});
}
module.exports=Object.freeze({VERSION,create});
