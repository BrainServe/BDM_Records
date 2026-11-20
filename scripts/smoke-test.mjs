/**
 * OPTIONAL destructive smoke test for a DEVELOPMENT or TEST database only.
 * Creates uniquely prefixed temporary records, verifies core CRUD, security,
 * PDF export, refresh rotation and logout, then deletes its temporary section.
 *
 * Required: SMOKE_USERNAME, SMOKE_PASSWORD
 * Optional: API_BASE (default http://localhost:8080/api)
 * Run: node scripts/smoke-test.mjs
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const API=(process.env.API_BASE||'http://localhost:8080/api').replace(/\/$/,'');
const USER=process.env.SMOKE_USERNAME, PASSWORD=process.env.SMOKE_PASSWORD;
if(!USER||!PASSWORD)throw new Error('Provide SMOKE_USERNAME and SMOKE_PASSWORD for a test-only database.');
if(!/localhost|127\.0\.0\.1/.test(new URL(API).hostname)&&process.env.ALLOW_REMOTE_TEST!=='YES')
 throw new Error('Refusing to modify a remote server. To explicitly allow test infrastructure, set ALLOW_REMOTE_TEST=YES.');
let accessToken='',refreshCookie='',sectionId=null,checks=0;
const unique=`Smoke ${randomUUID().slice(0,12)}`;
async function request(method,path,{body,cookie=refreshCookie,token=accessToken}={}){
 const headers={...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})};
 if(cookie)headers.Cookie=cookie;
 const response=await fetch(API+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
 const mime=response.headers.get('content-type')||'';
 const data=mime.includes('application/json')?await response.json():mime.includes('application/pdf')?await response.arrayBuffer():await response.text();
 return {response,data};
}
async function expect(method,path,options={},status=200){
 const output=await request(method,path,options);
 assert.equal(output.response.status,status,`${method} ${path} returned ${output.response.status}: ${JSON.stringify(output.data).slice(0,400)}`);
 checks++;return output;
}
const log=(message)=>console.log(`PASS  ${message}`);
try{
 const login=await expect('POST','/auth/login',{body:{username:USER,password:PASSWORD}});
 accessToken=login.data.accessToken;
 assert(accessToken?.length>20);
 refreshCookie=(login.response.headers.get('set-cookie')||'').split(';')[0];
 assert(refreshCookie.startsWith('directory_refresh='));log('Login and HttpOnly refresh cookie');
 const me=await expect('GET','/auth/me');assert.equal(me.data.username,USER.toLowerCase());log('Authenticated profile');
 await expect('GET','/sections',{token:'INVALID_TOKEN',cookie:''},401);log('Invalid JWT rejected');
 const section=(await expect('POST','/sections',{body:{name:unique,recordLabel:'Institute',itemLabel:'Course',amountUnit:'INR'}},201)).data;
 sectionId=section.id;
 assert(sectionId);log('Create section');
 const allSections=(await expect('GET','/sections')).data;
 assert(allSections.some(s=>s.id===sectionId));log('List sections');
 const sectionPath=`/sections/${sectionId}`;
 const a=(await expect('POST',sectionPath+'/items',{body:{name:'Java'}},201)).data.id;
 const b=(await expect('POST',sectionPath+'/items',{body:{name:'Python'}},201)).data.id;
 const temp=(await expect('POST',sectionPath+'/items',{body:{name:'Temporary'}},201)).data.id;
 log('Create multiple columns');
 const record=(await expect('POST',sectionPath+'/records/with-values',{body:{name:'Temporary Institute',values:[{itemId:a,amount:125},{itemId:b,amount:100.25}]}},201)).data.id;
 const second=(await expect('POST',sectionPath+'/records',{body:{name:'Extra Institute'}},201)).data.id;
 const third=(await expect('POST',sectionPath+'/records',{body:{name:'Third Institute'}},201)).data.id;
 log('Create row with values and additional rows');
 let matrix=(await expect('GET',sectionPath+'/matrix')).data;
 assert.equal(matrix.rows.length,3);assert.equal(matrix.columns.length,3);
 assert.equal(Number(matrix.rows.find(x=>x.id===record).values[a]),125);
 log('Matrix lists correct rows, columns, and amounts');
 await expect('PUT',sectionPath+'/cell',{body:{recordId:record,itemId:a,amount:140,expectedAmount:125}});
 matrix=(await expect('GET',sectionPath+'/matrix')).data;
 assert.equal(Number(matrix.rows.find(x=>x.id===record).values[a]),140);log('Single-cell edit');
 await expect('PATCH',sectionPath+'/cells',{body:{updates:[{recordId:record,itemId:a,amount:151.50,expectedAmount:140},{recordId:record,itemId:b,amount:null,expectedAmount:100.25}]}});
 matrix=(await expect('GET',sectionPath+'/matrix')).data;
 assert.equal(Number(matrix.rows.find(x=>x.id===record).values[a]),151.5);
 assert.equal(matrix.rows.find(x=>x.id===record).values[b],undefined);log('Bulk edit and clear cell');
 await expect('PUT',sectionPath+'/cell',{body:{recordId:record,itemId:a,amount:111,expectedAmount:140}},409);
 matrix=(await expect('GET',sectionPath+'/matrix')).data;assert.equal(Number(matrix.rows.find(x=>x.id===record).values[a]),151.5);log('Conflicting stale cell update rejected');
 await expect('PATCH',sectionPath+'/cells',{body:{updates:[{recordId:record,itemId:a,amount:222,expectedAmount:151.5},{recordId:record,itemId:b,amount:1,expectedAmount:10}]}},409);
 matrix=(await expect('GET',sectionPath+'/matrix')).data;assert.equal(Number(matrix.rows.find(x=>x.id===record).values[a]),151.5);log('Failed multi-cell edit rolled back atomically');
 await expect('PATCH',sectionPath+`/records/${record}/with-values`,{body:{name:'Updated Institute',values:[{itemId:a,amount:160,expectedAmount:151.5}],expectedName:'Temporary Institute'}});
 await expect('PATCH',sectionPath+`/items/${a}`,{body:{name:'Java Full Stack',expectedName:'Java'}});
 await expect('PATCH',sectionPath,{body:{name:unique+' Updated',recordLabel:'Institution',itemLabel:'Training',amountUnit:'USD',expectedName:unique}});
 matrix=(await expect('GET',sectionPath+'/matrix')).data;
 assert.equal(matrix.section.recordLabel,'Institution');
 assert.equal(matrix.rows.find(r=>r.id===record).name,'Updated Institute');
 assert(matrix.columns.some(c=>c.name==='Java Full Stack'));
 log('Rename section, row, and column');
 await expect('POST',sectionPath+'/records/clear-values',{body:{ids:[record]}});
 matrix=(await expect('GET',sectionPath+'/matrix')).data;
 assert.deepEqual(matrix.rows.find(r=>r.id===record).values,{});log('Clear values in selected rows');
 await expect('POST',sectionPath+'/items/bulk-delete',{body:{ids:[b,temp]}});
 matrix=(await expect('GET',sectionPath+'/matrix')).data;
 assert.equal(matrix.columns.length,1);log('Bulk delete columns');
 await expect('POST',sectionPath+'/records/bulk-delete',{body:{ids:[second,third]}});
 matrix=(await expect('GET',sectionPath+'/matrix')).data;
 assert.equal(matrix.rows.length,1);log('Bulk delete rows');
 await expect('PUT',sectionPath+'/cell',{body:{recordId:record,itemId:a,amount:10,expectedAmount:null}});
 await expect('DELETE',sectionPath+'/values',{},204);
 matrix=(await expect('GET',sectionPath+'/matrix')).data;
 assert.deepEqual(matrix.rows[0].values,{});log('Clear all amounts without deleting rows');
 const pdf=await expect('GET',sectionPath+'/export/pdf');
 const signature=Buffer.from(pdf.data).subarray(0,5).toString('ascii');
 assert.equal(signature,'%PDF-');
 assert(pdf.response.headers.get('content-disposition')?.includes('.pdf'));
 assert(pdf.response.headers.get('cache-control')?.includes('no-store'));
 log('Authenticated PDF export, valid PDF header, download headers');
 await expect('DELETE',sectionPath+`/records/${record}`,{},204);
 await expect('DELETE',sectionPath+`/items/${a}`,{},204);
 matrix=(await expect('GET',sectionPath+'/matrix')).data;
 assert.equal(matrix.rows.length,0);assert.equal(matrix.columns.length,0);log('Delete individual row and column');
 const oldCookie=refreshCookie;
 const rotate=await expect('POST','/auth/refresh',{cookie:refreshCookie,token:''});
 accessToken=rotate.data.accessToken;
 refreshCookie=(rotate.response.headers.get('set-cookie')||'').split(';')[0];
 assert(refreshCookie&&refreshCookie!==oldCookie);log('Refresh token rotation');
 await expect('POST','/auth/refresh',{cookie:oldCookie,token:''},409);log('Old refresh token refused during rotation grace period');
 await expect('DELETE',sectionPath,{},204);sectionId=null;
 const checkMissing=await request('GET',sectionPath+'/matrix');assert.equal(checkMissing.response.status,404);checks++;
 log('Delete section with cascading data deletion');
 await expect('POST','/auth/logout',{cookie:refreshCookie,token:''},204);
 await expect('POST','/auth/refresh',{cookie:refreshCookie,token:''},401);log('Logout revokes refresh session');
 console.log(`\nSUCCESS: ${checks} live HTTP checks passed. Test records were removed.`);
}catch(e){console.error(`FAIL: ${e.stack||e}`);process.exitCode=1;}
finally{
 if(sectionId){
  try{const r=await request('DELETE',`/sections/${sectionId}`);console.log(`Cleanup temporary section: HTTP ${r.response.status}`);}
  catch(e){console.error(`WARNING: cleanup failed (${e.message}); manually delete section ${sectionId}`);}
 }
}
