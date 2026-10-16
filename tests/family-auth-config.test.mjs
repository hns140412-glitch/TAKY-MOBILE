import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/family-auth-config.mjs';
const names=['TAKY_FAMILY_LOGIN_ALLOWED_ORIGINS','TAKY_GOOGLE_WEB_CLIENT_ID','TAKY_CENTRAL_API_BASE_URL'];
const saved=Object.fromEntries(names.map(n=>[n,process.env[n]]));
const clear=()=>{for(const n of names)delete process.env[n]};
const call=(url='https://taky-mobile.example.netlify.app/.netlify/functions/family-auth-config',method='GET')=>handler(new Request(url,{method}));
const client='15791067602-lvao9ohkbj3l5s3clbfb9n106uqssaol.apps.googleusercontent.com';
try{
 clear();
 await test('no configured central deployment is fail-closed',async()=>{
  const res=await call();assert.equal(res.status,503);
  assert.deepEqual(await res.json(),{ok:false,state:'FAMILY_LOGIN_NOT_CONFIGURED'});
  assert.match(res.headers.get('cache-control'),/no-store/);
 });
 await test('only GET is accepted',async()=>{
  const r=await call(undefined,'POST');assert.equal(r.status,405);
 });
 await test('explicit mobile origin and trusted HTTPS central origin yield public config only',async()=>{
  process.env.TAKY_FAMILY_LOGIN_ALLOWED_ORIGINS='https://taky-mobile.example.netlify.app';
  process.env.TAKY_GOOGLE_WEB_CLIENT_ID=client;
  process.env.TAKY_CENTRAL_API_BASE_URL='https://central.example.test/';
  const res=await call();assert.equal(res.status,200);
  const b=await res.json();
  assert.deepEqual(b,{ok:true,googleClientId:client,apiBaseUrl:'https://central.example.test',
   loginOrigin:'https://taky-mobile.example.netlify.app',identity:'GOOGLE_OIDC_ID_TOKEN'});
  assert.equal(JSON.stringify(b).includes('secret'),false);
 });
 await test('other host cannot read configured login bootstrap',async()=>{
  const r=await call('https://attacker.example/.netlify/functions/family-auth-config');
  assert.equal(r.status,503);
 });
 await test('public http central service is rejected',async()=>{
  process.env.TAKY_CENTRAL_API_BASE_URL='http://central.example.test/';
  const r=await call();assert.equal(r.status,503);
 });
 await test('client secret or invalid Google client id cannot be used',async()=>{
  process.env.TAKY_CENTRAL_API_BASE_URL='https://central.example.test/';
  process.env.TAKY_GOOGLE_WEB_CLIENT_ID='secret-not-an-id';
  const r=await call();assert.equal(r.status,503);
 });
}finally{for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
