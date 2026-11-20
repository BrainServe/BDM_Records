import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {api, authorize, refreshSession, signOut, setupStatus, setToken, downloadPdf} from '../src/api.js';
const oldFetch = globalThis.fetch;
const oldWindow = globalThis.window;
afterEach(() => {globalThis.fetch=oldFetch;globalThis.window=oldWindow;setToken(null);});
const response = (status, data) => new Response(data === undefined ? null : JSON.stringify(data), {
  status, headers: data === undefined ? undefined : {'Content-Type':'application/json'}
});

test('first-time setup status reads response', async () => {
  globalThis.fetch=async (url, options) => {
    assert.equal(url,'/api/auth/status');
    assert.equal(options.credentials,'include');
    return response(200,{setupRequired:true});
  };
  assert.deepEqual(await setupStatus(),{setupRequired:true});
});

test('login stores access token only in memory for protected calls', async () => {
  const calls=[];
  globalThis.fetch=async (url, options) => {
    calls.push({url,options});
    if(url==='/api/auth/login')return response(200,{username:'admin',accessToken:'TEST.JWT.1'});
    return response(200,{ok:true});
  };
  await authorize('login','admin','password');
  assert.deepEqual(await api('/sections'),{ok:true});
  assert.equal(calls[1].options.headers.Authorization,'Bearer TEST.JWT.1');
  assert.equal(calls[1].options.credentials,'include');
});

test('protected request is retried once with a rotated access JWT after 401', async () => {
  const calls=[];
  globalThis.fetch=async (url, options) => {
    calls.push({url,options});
    if(url==='/api/auth/refresh')return response(200,{username:'admin',accessToken:'NEW.JWT'});
    if(url==='/api/sections' && calls.filter(c=>c.url==='/api/sections').length===1)return response(401,{message:'Expired'});
    return response(200,[{name:'IT'}]);
  };
  setToken('OLD.JWT');
  assert.deepEqual(await api('/sections'),[{name:'IT'}]);
  assert.equal(calls.length,3);
  assert.equal(calls[2].options.headers.Authorization,'Bearer NEW.JWT');
});

test('concurrent refresh requests share a single HTTP request',async () => {
  let count=0;
  globalThis.fetch=async () => {count++;await new Promise(resolve=>setTimeout(resolve,5));return response(200,{accessToken:'ROTATED',username:'admin'});};
  const [one,two] = await Promise.all([refreshSession(),refreshSession()]);
  assert.equal(count,1);
  assert.equal(one.accessToken,two.accessToken);
});

test('logout works without an access JWT and clears the in-memory token',async () => {
  let logoutOptions;
  globalThis.fetch=async (url,options)=> {
    if(url==='/api/auth/logout') {logoutOptions=options;return response(204);}
    return response(200,{ok:true});
  };
  setToken('EXPIRED.JWT');
  await signOut();
  assert.equal(logoutOptions.credentials,'include');
  assert.equal(logoutOptions.method,'POST');
  assert.equal(logoutOptions.headers.Authorization,'Bearer EXPIRED.JWT','Backend may use a valid bearer or fall back to the refresh cookie if expired');
  await api('/sections');
});

test('logout errors retain access token for a safe server-side retry',async () => {
  let sawAuthorization;
  globalThis.fetch=async (url,options) => {
    if(url==='/api/auth/logout')return response(503,{message:'Database temporarily unavailable'});
    sawAuthorization=options.headers.Authorization;
    return response(200,{});
  };
  setToken('STALE');
  await assert.rejects(signOut(), /Database temporarily unavailable/);
  await api('/sections');
  assert.equal(sawAuthorization,'Bearer STALE');
});

test('expired refresh signs user out when retry fails',async () => {
  let fired=false;
  globalThis.window={dispatchEvent:()=>{fired=true;}};
  globalThis.fetch=async (url) => url==='/api/sections'
    ? response(401,{message:'Invalid access token'})
    : response(401,{message:'Expired refresh session'});
  await assert.rejects(api('/sections'), /Expired refresh session/);
  assert.equal(fired,true);
});

test('initial administrator setup sends the private key; regular login does not', async () => {
  const submitted=[];
  globalThis.fetch=async (_url,options)=>{submitted.push(JSON.parse(options.body));return response(200,{accessToken:'ABC',username:'admin'});};
  await authorize('setup','admin','Password123456','TEMPORARY_SETUP_KEY');
  await authorize('login','admin','Password123456');
  assert.equal(submitted[0].setupKey,'TEMPORARY_SETUP_KEY');
  assert.equal(Object.hasOwn(submitted[1],'setupKey'),false);
});

test('PDF export sends bearer token and reads a binary PDF without JSON parsing', async () => {
  let gotAuth;
  globalThis.fetch=async (url,options)=>{
    assert.equal(url,'/api/sections/test-id/export/pdf');
    gotAuth=options.headers.Authorization;
    return new Response(new Blob(['%PDF-1.7'],{type:'application/pdf'}),{headers:{'Content-Type':'application/pdf'}});
  };
  setToken('SIGNED.JWT');
  const blob=await downloadPdf('/sections/test-id/export/pdf');
  assert.equal(gotAuth,'Bearer SIGNED.JWT');
  assert.equal(await blob.text(),'%PDF-1.7');
});

test('PDF export retries once after expired access token and succeeds', async () => {
  let attempts=0;
  globalThis.fetch=async (url,opts)=>{
    if(url.endsWith('/refresh'))return response(200,{accessToken:'ROTATED'});
    if(attempts++===0)return response(401,{message:'Expired'});
    assert.equal(opts.headers.Authorization,'Bearer ROTATED');
    return new Response(new Blob(['%PDF-1.7'],{type:'application/pdf'}),{headers:{'Content-Type':'application/pdf'}});
  };
  setToken('OLD');
  assert.equal((await downloadPdf('/sections/abc/export/pdf')).size,8);
  assert.equal(attempts,2);
});

test('PDF export rejects HTML responses and empty files', async () => {
  globalThis.fetch=async ()=>new Response('This is not a PDF',{headers:{'Content-Type':'text/html'}});
  await assert.rejects(downloadPdf('/sections/abc/export/pdf'),/unexpected file type/);
  globalThis.fetch=async ()=>new Response('',{headers:{'Content-Type':'application/pdf'}});
  await assert.rejects(downloadPdf('/sections/abc/export/pdf'),/empty/);
});

test('PDF export rejects corrupt files even if server sets application/pdf',async()=>{
 globalThis.fetch=async()=>new Response('not a pdf',{headers:{'Content-Type':'application/pdf'}});
 await assert.rejects(downloadPdf('/sections/id/export/pdf'),/valid PDF file/);
});


test('refresh collision retries after the rotated-token 409',async () => {
  let calls=0;
  globalThis.fetch=async (url)=>{
    assert.equal(url,'/api/auth/refresh');
    calls++;
    return calls===1?response(409,{message:'Session rotated'}):response(200,{username:'admin',accessToken:'NEWER.JWT'});
  };
  const result=await refreshSession();
  assert.equal(calls,2);
  assert.equal(result.accessToken,'NEWER.JWT');
});

test('a failed refresh never retries without a bounded limit',async () => {
  let calls=0;
  globalThis.fetch=async()=>{calls++;return response(409,{message:'Rotated'});};
  await assert.rejects(refreshSession(),/Rotated/);
  assert.equal(calls,2);
});


test('PDF 401 + refresh 401 reports expired session without navigating away', async () => {
  let events=0;
  globalThis.window={dispatchEvent:()=>{events++;}};
  const requested=[];
  globalThis.fetch=async (url)=>{
    requested.push(url);
    return url.endsWith('/refresh')
      ? response(401,{message:'Refresh token missing'})
      : response(401,{message:'Invalid PDF authentication'});
  };
  setToken('OLD.JWT');
  await assert.rejects(downloadPdf('/sections/a/export/pdf'), /PDF download could not authenticate/);
  assert.equal(events,0,'A failed PDF request must not issue a global logout event');
  assert.deepEqual(requested,['/api/sections/a/export/pdf','/api/auth/refresh']);
});

test('PDF 401 + temporary refresh outage does not clear login session', async () => {
  let events=0, retainedAuthorization;
  globalThis.window={dispatchEvent:()=>{events++;}};
  globalThis.fetch=async (url,opts)=>{
    if(url.endsWith('/refresh'))return response(503,{message:'Temporary auth server failure'});
    if(url==='/api/sections'){
      retainedAuthorization=opts.headers.Authorization;
      return response(200,[]);
    }
    return response(401,{message:'PDF token rejected'});
  };
  setToken('CURRENT.JWT');
  await assert.rejects(downloadPdf('/sections/a/export/pdf'), /Temporary auth server failure/);
  assert.equal(events,0);
  await api('/sections');
  assert.equal(retainedAuthorization,'Bearer CURRENT.JWT');
});

test('PDF response 401 after successful refresh stays on dashboard and reports failure',async()=>{
  let events=0, calls=0;
  globalThis.window={dispatchEvent:()=>{events++;}};
  globalThis.fetch=async (url,opts)=>{
    if(url.endsWith('/refresh'))return response(200,{accessToken:'NEW.JWT'});
    calls++;
    if(calls===2)assert.equal(opts.headers.Authorization,'Bearer NEW.JWT');
    return response(401,{message:'Access denied to PDF'});
  };
  setToken('OLD.JWT');
  await assert.rejects(downloadPdf('/sections/a/export/pdf'), /Access denied to PDF/);
  assert.equal(calls,2);
  assert.equal(events,0);
});

test('Temporary refresh-server failure does not log out standard API requests',async()=>{
  let events=0;
  globalThis.window={dispatchEvent:()=>{events++;}};
  globalThis.fetch=async (url)=> url.endsWith('/refresh')
    ? response(503,{message:'Service unavailable'})
    : response(401,{message:'Access JWT expired'});
  await assert.rejects(api('/sections'),/Service unavailable/);
  assert.equal(events,0);
});
