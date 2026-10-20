import {configured,validKey,adminCookie,logoutCookie,authorized,sameOrigin,respond} from './_admin-session.mjs';
export default async request=>{
 if(request.method==='GET')return respond({ok:true,authorized:configured()&&authorized(request)});
 if(!['POST','DELETE'].includes(request.method))return respond({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET, POST, DELETE'});
 if(!sameOrigin(request))return respond({ok:false,error:'ORIGIN_DENIED'},403);
 if(request.method==='DELETE')return respond({ok:true,authorized:false},200,{'Set-Cookie':logoutCookie()});
 if(!configured())return respond({ok:false,error:'ADMIN_NOT_CONFIGURED'},503);
 try{const body=await request.json();if(!validKey(body?.key))return respond({ok:false,error:'ADMIN_AUTH_FAILED'},401);
 return respond({ok:true,authorized:true},200,{'Set-Cookie':adminCookie()});}
 catch{return respond({ok:false,error:'INVALID_REQUEST'},400)}
};
