import crypto from 'node:crypto';
const COOKIE='taky_admin_session';
const MAX_AGE=12*60*60;
const env=n=>globalThis.Netlify?.env?.get?.(n)??process.env[n];
const mac=(s,k)=>crypto.createHmac('sha256',k).update(s).digest('base64url');
const same=(a,b)=>crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(),crypto.createHash('sha256').update(String(b)).digest());
export const configured=()=>Boolean(env('TAKY_ADMIN_ACCESS_KEY')&&env('TAKY_ADMIN_SESSION_SECRET'));
export const validKey=k=>typeof k==='string'&&k.length<1024&&configured()&&same(k,env('TAKY_ADMIN_ACCESS_KEY'));
export function adminCookie(){const ms=Date.now()+MAX_AGE*1000,n=crypto.randomBytes(16).toString('hex'),p=ms+'.'+n,s=p+'.'+mac(p,env('TAKY_ADMIN_SESSION_SECRET'));return COOKIE+'='+encodeURIComponent(s)+'; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age='+MAX_AGE}
export const logoutCookie=()=>COOKIE+'=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0';
export function authorized(request){
 const secret=env('TAKY_ADMIN_SESSION_SECRET');if(!secret)return false;
 const v=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));
 if(!v||v.length>512)return false;
 let token;try{token=decodeURIComponent(v.slice(COOKIE.length+1))}catch{return false}
 const [ms,n,s,...extra]=token.split('.');const x=Number(ms);
 if(extra.length||!/^\d{13}$/.test(ms||'')||!/^[0-9a-f]{32}$/.test(n||'')||!/^[A-Za-z0-9_-]{43}$/.test(s||''))return false;
 if(!Number.isFinite(x)||x<=Date.now()||x>Date.now()+MAX_AGE*1000)return false;
 return same(s,mac(ms+'.'+n,secret));
}
export function sameOrigin(req){const o=req.headers.get('origin');if(!o)return false;try{return new URL(o).origin===new URL(req.url).origin}catch{return false}}
export function respond(v,status=200,extra={}){return new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra}})}
export const adminEnv=env;
