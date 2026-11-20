import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowRight, Check, CheckCheck, ChevronRight,
  Columns3, Database, FileDown, FileText, FolderKanban, GraduationCap, LayoutDashboard, Landmark, LockKeyhole,
  LogOut, MoreHorizontal, Pencil, Plus, Printer, Save, Search, Settings2, ShieldCheck, 
  Trash2, Users, X, Eye, EyeOff, Menu, Layers3, AlertTriangle, RefreshCw
} from 'lucide-react';
import {api, authorize, refreshSession, setupStatus, signOut, downloadPdf, setToken} from './api.js';
import {sectionInput, validAmount, csvCell, downloadName, parsedAmount, displayAmount} from './directoryUtils.js';
import {paginateRows, PAGE_SIZE_OPTIONS} from './pagination.js';
const STARTERS = [
  {name:'IT',recordLabel:'Institute',itemLabel:'Course',amountUnit:'₹'},
  {name:'Government',recordLabel:'Institute',itemLabel:'Course',amountUnit:'₹'},
  {name:'Higher Education',recordLabel:'Country',itemLabel:'Consultant',amountUnit:'₹'},
];
function BrandIdentity({variant='default'}) {
 return <span className={`brand-identity brand-identity-${variant}`} aria-label="Brain Serve">
   <img className="brainserve-mark" src="/brainserve-mark.png" alt="" />
   <img className="brainserve-wordmark" src="/brainserve-wordmark.png" alt="Brain Serve" />
 </span>;
}
function labelPlural(text='Record') {if(/[^aeiou]y$/i.test(text))return text.slice(0,-1)+'ies'; if(/(s|x|ch|sh)$/i.test(text))return text+'es';return text+'s';}
function amountString(value) {return value==null?'':String(value);}
function exportCSV(matrix) {
  if(!matrix)return;
  const header=[matrix.section.recordLabel,...matrix.columns.map(c=>c.name)];
  const rows=matrix.rows.map(r=>[r.name,...matrix.columns.map(c=>r.values[c.id]??'')]);
  const csv='\ufeff'+[header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=downloadName(matrix.section.name,'csv');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function Modal({title,subtitle,children,onClose,wide=false}) {
  const backdropRef=useRef(null);
  useEffect(()=>{
    const esc=e=>{
      if([...document.querySelectorAll('.modal-backdrop')].at(-1)!==backdropRef.current)return;
      if(e.key==='Escape'){e.preventDefault();onClose();return;}
      if(e.key==='Tab'){
        const focusable=[...backdropRef.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length>0);
        if(!focusable.length)return;
        const first=focusable[0],last=focusable.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    };
    const previous=document.activeElement;
    const timer=requestAnimationFrame(()=>{
      if(backdropRef.current&&!backdropRef.current.contains(document.activeElement))backdropRef.current.querySelector('button')?.focus();
    });
    window.addEventListener('keydown',esc);
    return()=>{cancelAnimationFrame(timer);window.removeEventListener('keydown',esc);if(previous?.isConnected)previous.focus();};
  },[onClose]);
  return <div ref={backdropRef} className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}} role="presentation">
    <div className={`modal ${wide?'modal-wide':''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-top"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20}/></button></div>
      {children}
    </div>
  </div>;
}
function Button({children,icon:Icon,variant='primary',className='',...props}) {
  return <button className={`btn btn-${variant} ${className}`} {...props}>{Icon&&<Icon size={17}/>}<span>{children}</span></button>;
}
function AuthPage({setupRequired,onSignedIn}) {
  const [username,setUsername]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [setupKey,setSetupKey]=useState('');
  const [show,setShow]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function submit(e){e.preventDefault();setError('');if(setupRequired&&(password.length<12||password!==confirm)) {setError('Password must have at least 12 characters and both entries must match.');return;}
    setBusy(true);try{const r=await authorize(setupRequired?'setup':'login',username,password,setupKey);onSignedIn(r.username);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <div className="auth-page">
    <section className="auth-showcase">
      <div className="showcase-brand"><BrandIdentity variant="showcase"/></div>
      <div className="showcase-copy"><div className="auth-tag"><span className="live-dot"/>INSTITUTION DATA MANAGEMENT</div><h1>One clear view.<br/><em>Every opportunity.</em></h1><p>Organize institutes, courses, countries and consultants in one thoughtfully designed workspace.</p><div className="showcase-footer"><span><ShieldCheck size={17}/> Access protected</span><span><Database size={17}/> Your data, not demo data</span></div></div>
    </section>
    <section className="auth-panel"><div className="auth-panel-head"><BrandIdentity variant="login"/><span className="secure-label"><LockKeyhole size={15}/> SECURE WORKSPACE</span></div>
      <div className="auth-content"><div className="auth-eyebrow">BRAIN SERVE · DIRECTORY PORTAL</div><h2>{setupRequired?'Set up your workspace':'Welcome back'}</h2><p>{setupRequired?'Create the first administrator using the private setup key provided by your deployment administrator.':'Sign in to manage your institution data and course amounts.'}</p>
        <form onSubmit={submit} className="auth-form"><label htmlFor="username">Username</label><input id="username" autoComplete="username" placeholder="Enter your username" value={username} onChange={e=>setUsername(e.target.value)} required maxLength={80} autoFocus/>
          <div className="field-heading"><label htmlFor="password">Password</label><span className="subtle-small">{setupRequired?'At least 12 characters':'Protected sign in'}</span></div>
          <div className="password-field"><input id="password" type={show?'text':'password'} autoComplete={setupRequired?'new-password':'current-password'} placeholder="Enter your password" value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" onClick={()=>setShow(!show)} aria-label={show?'Hide password':'Show password'}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>
          {setupRequired&&<><label htmlFor="setup-key">Administrator setup key</label><input id="setup-key" type="password" autoComplete="off" placeholder="Enter your private initial setup key" value={setupKey} onChange={e=>setSetupKey(e.target.value)} required/><label htmlFor="confirm">Confirm password</label><input id="confirm" type="password" autoComplete="new-password" placeholder="Repeat your password" value={confirm} onChange={e=>setConfirm(e.target.value)} required/></>}
          {error&&<div className="form-alert" role="alert"><AlertTriangle size={16}/>{error}</div>}
          <Button type="submit" disabled={busy} icon={ArrowRight} className="auth-submit">{busy?'Please wait…':setupRequired?'Create admin account':'Sign in to workspace'}</Button>
        </form><div className="auth-security"><ShieldCheck size={19}/><span>JWT access tokens · Rotating refresh session · BCrypt password hashing</span></div>
      </div><div className="auth-bottom">© {new Date().getFullYear()} Brain Serve · Private directory</div>
    </section>
  </div>;
}
function SectionForm({initial,onSubmit,onClose}) {
 const [data,setData]=useState(sectionInput(initial));const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const field=(name,value)=>setData(p=>({...p,[name]:value}));
 async function submit(e){e.preventDefault();setBusy(true);setError('');try{await onSubmit(data);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <form onSubmit={submit} className="modal-body"><div className="field"><label htmlFor="section-name">Section name</label><input id="section-name" autoFocus value={data.name} maxLength={100} onChange={e=>field('name',e.target.value)} placeholder="e.g. IT, Government, Higher Education" required/></div>
    <div className="form-grid"><div className="field"><label htmlFor="record-type">Record type (singular)</label><input id="record-type" value={data.recordLabel} maxLength={60} onChange={e=>field('recordLabel',e.target.value)} placeholder="Institute / Country" required/><small>The row name in your table</small></div>
      <div className="field"><label htmlFor="column-type">Column type (singular)</label><input id="column-type" value={data.itemLabel} maxLength={60} onChange={e=>field('itemLabel',e.target.value)} placeholder="Course / Consultant" required/><small>The columns you can add</small></div></div>
    <div className="field"><label htmlFor="amount-unit">Amount unit (optional)</label><input id="amount-unit" value={data.amountUnit} maxLength={16} onChange={e=>field('amountUnit',e.target.value)} placeholder="₹, $, K, or blank"/><small>Displayed beside every entered amount; amounts remain numeric in the database.</small></div>
    {error&&<div className="form-alert">{error}</div>}<div className="modal-actions"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" icon={Check} disabled={busy}>{busy?'Saving…':initial?.id?'Save section':'Create section'}</Button></div>
 </form>;
}
function RecordForm({mode,initial,sections,activeSectionId,activeMatrix,onClose,onSaved}) {
 const [sectionId,setSectionId]=useState(activeSectionId);const [name,setName]=useState(initial?.name||'');
 const [columns,setColumns]=useState(activeMatrix?.columns||[]);
 const [values,setValues]=useState(Object.fromEntries(Object.entries(initial?.values||{}).map(([k,v])=>[k,amountString(v)])));
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[loadFailed,setLoadFailed]=useState(false);
 const section=sections.find(s=>s.id===sectionId);const lastLoad=useRef(0);
 useEffect(()=>{if(mode==='edit')return; const req=++lastLoad.current;
   if(sectionId===activeSectionId&&activeMatrix){setColumns(activeMatrix.columns);setValues({});setError('');setLoadFailed(false);setLoading(false);return;}
   setLoading(true);setColumns([]);setError('');setLoadFailed(false);setValues({});
   api(`/sections/${sectionId}/matrix`).then(data=>{if(req===lastLoad.current)setColumns(data.columns);})
     .catch(e=>{if(req===lastLoad.current){setLoadFailed(true);setError(`Could not load this section: ${e.message}`);}})
     .finally(()=>{if(req===lastLoad.current)setLoading(false);});
 },[sectionId,mode,activeSectionId]);
 async function submit(e){e.preventDefault();if(loadFailed||loading)return;setError('');if(!columns.every(c=>validAmount(values[c.id]??''))){setError('Amounts must be nonnegative numbers with at most two decimal places.');return;}
   setBusy(true);try{const payload={name:name.trim(),values:columns.map(c=>({itemId:c.id,amount:parsedAmount(values[c.id]??''),expectedAmount:mode==='edit'?(initial?.values?.[c.id]??null):null}))};
     if(mode==='edit')await api(`/sections/${sectionId}/records/${initial.id}/with-values`,{method:'PATCH',body:{...payload,expectedName:initial.name}});
     else await api(`/sections/${sectionId}/records/with-values`,{method:'POST',body:payload});
     await onSaved(sectionId);
   }catch(e){setError(e.message);}finally{setBusy(false);}}
 return <form className="modal-body" onSubmit={submit}><div className="field"><label htmlFor="target-section">Section</label><select id="target-section" value={sectionId} disabled={mode==='edit'} onChange={e=>setSectionId(e.target.value)}>{sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
   <div className="field"><label htmlFor="record-name">{section?.recordLabel||'Record'} name</label><input id="record-name" autoFocus required maxLength={180} value={name} onChange={e=>setName(e.target.value)} placeholder={`Enter ${section?.recordLabel?.toLowerCase()||'record'} name`}/></div>
   <div className="form-section-divider"><span>{labelPlural(section?.itemLabel||'Item')} &amp; amounts</span><span className="subtle-small">Optional · leave empty when unknown</span></div>
   {loading?<p className="muted">Loading columns…</p>:columns.length===0?<div className="light-note"><Columns3 size={18}/>No columns in this section yet. You can add {labelPlural(section?.itemLabel||'item').toLowerCase()} later.</div>:<div className="amount-input-list">{columns.map(c=><div className="amount-input-row" key={c.id}><label htmlFor={`val-${c.id}`}>{c.name}</label><div className="prefix-input"><span>{section?.amountUnit||'#'}</span><input id={`val-${c.id}`} maxLength={22} inputMode="decimal" placeholder="—" value={values[c.id]??''} onChange={e=>setValues(p=>({...p,[c.id]:e.target.value}))}/></div></div>)}</div>}
   {error&&<div className="form-alert">{error}</div>}<div className="modal-actions"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button icon={Check} disabled={busy||loading||loadFailed}>{busy?'Saving…':mode==='edit'?'Save changes':`Add ${section?.recordLabel||'record'}`}</Button></div>
 </form>;
}
function NameForm({label='Name',initial='',onSubmit,onClose}){
 const [name,setName]=useState(initial);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function submit(e){e.preventDefault();setBusy(true);setError('');try{await onSubmit(name.trim());}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <form className="modal-body" onSubmit={submit}><div className="field"><label htmlFor="item-name">{label}</label><input id="item-name" autoFocus required maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder={`Enter ${label.toLowerCase()}`}/></div>
 {error&&<div className="form-alert">{error}</div>}<div className="modal-actions"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button icon={Check} disabled={busy}>{busy?'Saving…':'Save'}</Button></div></form>;
}
function InlineCell({value,unit,onSave}) {
 const [editing,setEditing]=useState(false),[input,setInput]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState(false);
 const done=useRef(false);
 function start(){setInput(amountString(value));setEditing(true);setError(false);done.current=false;}
 async function save(){if(done.current)return; if(!validAmount(input)){setError(true);return;}
   done.current=true;setSaving(true);try{await onSave(parsedAmount(input));setEditing(false);}catch{setError(true);done.current=false;}finally{setSaving(false);}}
 if(editing)return <div className={`cell-edit-wrap ${error?'cell-error':''}`}><input aria-label="Edit amount" autoFocus maxLength={22} inputMode="decimal" value={input} onChange={e=>setInput(e.target.value)} onBlur={save} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();save();}if(e.key==='Escape'){done.current=true;setEditing(false);}}} disabled={saving}/></div>;
 return <button className="cell-value" onClick={start} title="Click to edit this amount"><span>{value==null?<span className="cell-empty">—</span>:<><b>{displayAmount(value)}</b><small>{unit}</small></>}</span><Pencil className="cell-pencil" size={12}/></button>;
}
function ManageColumns({matrix,onEdit,onRemove,onRemoveMultiple,onAdd}) {
 const [selected,setSelected]=useState([]);const cols=matrix.columns;
 return <div className="modal-body"><div className="list-heading"><span>{cols.length} {labelPlural(matrix.section.itemLabel).toLowerCase()}</span><Button variant="secondary" icon={Plus} onClick={onAdd}>Add {matrix.section.itemLabel}</Button></div>
  <div className="manage-list">{cols.length===0?<p className="light-note">No columns yet. Add the first one.</p>:cols.map(c=><div className="manage-row" key={c.id}>
   <input type="checkbox" checked={selected.includes(c.id)} aria-label={`Select ${c.name}`} onChange={e=>setSelected(s=>e.target.checked?[...s,c.id]:s.filter(x=>x!==c.id))}/><span>{c.name}</span>
   <button className="icon-btn" title="Rename" aria-label={`Rename ${c.name}`} onClick={()=>onEdit(c)}><Pencil size={16}/></button><button className="icon-btn danger-text" title="Delete" aria-label={`Delete ${c.name}`} onClick={()=>onRemove(c)}><Trash2 size={16}/></button>
  </div>)}</div>
  {selected.length>0&&<div className="bulk-footer"><span>{selected.length} selected</span><Button variant="danger" icon={Trash2} onClick={()=>onRemoveMultiple(selected)}>Delete selected columns</Button></div>}
 </div>;
}
function formatCount(n) {return n.toLocaleString('en-IN');}
function Dashboard({username,onLogout}){
 const [sections,setSections]=useState([]),[selectedId,setSelectedId]=useState(null),[matrix,setMatrix]=useState(null);
 const [loading,setLoading]=useState(true),[matrixLoading,setMatrixLoading]=useState(false),[search,setSearch]=useState('');
 const [sectionsError,setSectionsError]=useState(''),[matrixError,setMatrixError]=useState(''),[pdfBusy,setPdfBusy]=useState(false);
 const currentSectionRef=useRef(null);
 const matrixRequestRef=useRef(0);
 const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 const [printAll,setPrintAll]=useState(false);
 const [modal,setModal]=useState(null),[confirm,setConfirm]=useState(null),[toast,setToast]=useState(null);
 const [multiSelected,setMultiSelected]=useState([]),[bulkEdit,setBulkEdit]=useState(false),[drafts,setDrafts]=useState({}),[gridSaving,setGridSaving]=useState(false);
 const gridSavingRef=useRef(false);
 const [mobileNav,setMobileNav]=useState(false),[sort,setSort]=useState('name'),[showMenu,setShowMenu]=useState(false);
 const notify=(message,type='success')=>setToast({message,type,key:Date.now()});
 useEffect(()=>{if(!showMenu)return;const onOutside=e=>{if(e.key==='Escape'||(e.type==='pointerdown'&&!e.target.closest('.menu-parent')))setShowMenu(false);};document.addEventListener('pointerdown',onOutside);document.addEventListener('keydown',onOutside);return()=>{document.removeEventListener('pointerdown',onOutside);document.removeEventListener('keydown',onOutside);};},[showMenu]);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),4400);return()=>clearTimeout(t);},[toast]);
 async function reloadSections(preferred=null){const items=await api('/sections');setSections(items);setSectionsError('');setSelectedId(prev=>{
   const next=(preferred && items.some(s=>s.id===preferred))?preferred:items.some(s=>s.id===prev)?prev:items[0]?.id||null;
   currentSectionRef.current=next;return next;});return items;}
 useEffect(()=>{reloadSections().catch(e=>{setSectionsError(e.message);notify(e.message,'error');}).finally(()=>setLoading(false));},[]);
 async function reloadMatrix(id=selectedId){
   const request=++matrixRequestRef.current;
   if(!id){setMatrix(null);setMatrixLoading(false);return;}
   if(currentSectionRef.current===id)setMatrixLoading(true);
   try {
     const m=await api(`/sections/${id}/matrix`);
     if(currentSectionRef.current===id && matrixRequestRef.current===request){
       setMatrix(m);setMatrixError('');
       const known=new Set(m.rows.map(row=>row.id));
       setMultiSelected(previous=>previous.filter(value=>known.has(value)));
     }
     return m;
   }catch(e){
     if(currentSectionRef.current===id && matrixRequestRef.current===request)setMatrixError(e.message);
     throw e;
   }finally {
     if(currentSectionRef.current===id && matrixRequestRef.current===request)setMatrixLoading(false);
   }
 }
 useEffect(()=>{
   currentSectionRef.current=selectedId;
   const request=++matrixRequestRef.current;
   setMatrix(null);setMatrixError('');setSearch('');setMultiSelected([]);setBulkEdit(false);setDrafts({});setPage(1);
   if(!selectedId)return;
   let alive=true;setMatrixLoading(true);
   api(`/sections/${selectedId}/matrix`).then(v=>{if(alive&&matrixRequestRef.current===request)setMatrix(v);})
     .catch(e=>{if(alive&&matrixRequestRef.current===request){setMatrixError(e.message);notify(e.message,'error');}})
     .finally(()=>{if(alive&&matrixRequestRef.current===request)setMatrixLoading(false);});
   return()=>{alive=false;};
 },[selectedId]);
 const section=sections.find(s=>s.id===selectedId);
 const filtered=useMemo(()=>{
   const term=search.trim().toLocaleLowerCase();
   let rows=(matrix?.rows||[]).filter(r=>r.name.toLocaleLowerCase().includes(term));
   if(sort==='name')rows=[...rows].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
   return rows;
 },[matrix,search,sort]);
 const pagination=useMemo(()=>paginateRows(filtered,page,pageSize),[filtered,page,pageSize]);
 const shownRows=printAll?filtered:pagination.rows;
 useEffect(()=>{setPage(current=>Math.min(current,pagination.pageCount));},[pagination.pageCount]);
 useEffect(()=>{if(!printAll)return;const reset=()=>setPrintAll(false);window.addEventListener('afterprint',reset);return()=>window.removeEventListener('afterprint',reset);},[printAll]);
 const populated=matrix?.rows.reduce((sum,r)=>sum+Object.keys(r.values).length,0)||0;
 const selectedCount=multiSelected.length;
 const changes=useMemo(()=>{if(!bulkEdit||!matrix)return[];return matrix.rows.flatMap(r=>matrix.columns.flatMap(c=>{
   const key=`${r.id}:${c.id}`;const cur=amountString(r.values[c.id]);const raw=drafts[key]??cur;
   return raw!==cur?[{recordId:r.id,itemId:c.id,amount:parsedAmount(raw),expectedAmount:r.values[c.id]??null,raw}]:[];
 }));},[bulkEdit,drafts,matrix]);
 function beginBulk(){const values={};matrix.rows.forEach(r=>matrix.columns.forEach(c=>values[`${r.id}:${c.id}`]=amountString(r.values[c.id])));setDrafts(values);setBulkEdit(true);}
 async function saveBulk(){
   if(gridSavingRef.current)return;
   if(changes.some(c=>!validAmount(c.raw))){notify('Amounts must be nonnegative with no more than two decimals.','error');return;}
   if(changes.length===0){setBulkEdit(false);return;}
   if(changes.length>5000){notify('A grid save supports at most 5,000 cells. Split this edit into smaller changes.','error');return;}
   const sectionAtStart=selectedId;
   gridSavingRef.current=true;setGridSaving(true);
   try{
     // One request = one database transaction. A 409 rejects all submitted changes.
     await api(`/sections/${sectionAtStart}/cells`,{method:'PATCH',body:{updates:changes.map(({recordId,itemId,amount,expectedAmount})=>({recordId,itemId,amount,expectedAmount}))}});
     if(currentSectionRef.current===sectionAtStart){setBulkEdit(false);setDrafts({});}
     await reloadMatrix(sectionAtStart);
     notify(`${changes.length} amounts saved`);
   }catch(e){
     // Retain the drafts on errors. A failed subsequent reload is not a failed save.
     notify(`Grid save or refresh failed: ${e.message}`,'error');
   }finally {gridSavingRef.current=false;setGridSaving(false);}
 }
 function exportCurrentCSV(){
   if(bulkEdit&&changes.length){notify('Save or discard grid edits before exporting CSV.','error');return;}
   if(matrix){exportCSV(matrix);notify('CSV export created');}
 }
 function printDirectory(){
   if(bulkEdit){notify('Exit grid editing before printing.','error');return;}
   // Render every filtered row before invoking the browser print dialog.
   // Normal browsing still shows only the current page.
   setPrintAll(true);
   requestAnimationFrame(()=>requestAnimationFrame(()=>window.print()));
 }
 async function exportPDF(){
   if(!selectedId||pdfBusy)return;
   if(bulkEdit&&changes.length){notify('Save or discard grid edits before exporting the PDF.','error');return;}
   setPdfBusy(true);
   try{
     const blob=await downloadPdf(`/sections/${selectedId}/export/pdf`);
     const url=URL.createObjectURL(blob);
     const link=document.createElement('a');link.href=url;link.download=downloadName(section.name);
     document.body.appendChild(link);link.click();link.remove();
     setTimeout(()=>URL.revokeObjectURL(url),30000);
     notify('PDF export created');
   }catch(e){notify(`PDF export failed: ${e.message}`,'error');}
   finally{setPdfBusy(false);}
 }
 function switchSection(id){
   if(gridSavingRef.current){notify('Finish saving the grid before switching sections.','error');return;}
   if(id===selectedId){setMobileNav(false);return;}
   if(bulkEdit&&changes.length){
     ask('Discard unsaved grid edits?',`You have ${changes.length} unsaved amount changes. Switching sections will discard them.`,async()=>{currentSectionRef.current=id;setSelectedId(id);setMobileNav(false);setShowMenu(false);},'Discard changes');
     return;
   }
   currentSectionRef.current=id;setSelectedId(id);setMobileNav(false);setShowMenu(false);
 }
 function ask(title,message,action,destructiveLabel='Delete'){
   if(bulkEdit && title!=='Discard unsaved grid edits?'){
     notify('Finish or cancel grid editing before changing records, columns, or section settings.','error');return;
   }
   setConfirm({title,message,action,destructiveLabel});
 }
 async function confirmAction(){const item=confirm;setConfirm(null);try{await item.action();}catch(e){notify(e.message,'error');}}
 async function saveSection(values){let id;
   if(modal?.initial?.id){await api(`/sections/${modal.initial.id}`,{method:'PATCH',body:{...values,expectedName:modal.initial.name}});id=modal.initial.id;notify('Section updated');}
   else {const result=await api('/sections',{method:'POST',body:values});id=result.id;notify('New section created');}
   setModal(null);await reloadSections(id);if(id===selectedId)await reloadMatrix();}
 async function addItem(name){await api(`/sections/${selectedId}/items`,{method:'POST',body:{name}});setModal(null);await reloadMatrix();await reloadSections();notify(`${section.itemLabel} added`);}
 async function renameItem(name){await api(`/sections/${selectedId}/items/${modal.column.id}`,{method:'PATCH',body:{name,expectedName:modal.column.name}});setModal(null);await reloadMatrix();notify(`${section.itemLabel} renamed`);}
 async function singleCell(r,c,amount){try{await api(`/sections/${selectedId}/cell`,{method:'PUT',body:{recordId:r.id,itemId:c.id,amount,expectedAmount:r.values[c.id]??null}});await reloadMatrix();notify('Amount updated');}catch(e){notify(e.message,'error');throw e;}}
 function deleteRow(row){ask(`Delete ${section.recordLabel.toLowerCase()}?`,`“${row.name}” and all of its amounts will be permanently deleted.`,async()=>{await api(`/sections/${selectedId}/records/${row.id}`,{method:'DELETE'});await reloadMatrix();await reloadSections();notify(`${section.recordLabel} deleted`);});}
 function deleteColumn(col){ask(`Delete ${section.itemLabel.toLowerCase()}?`,`“${col.name}” and all values in this column will be deleted.`,async()=>{await api(`/sections/${selectedId}/items/${col.id}`,{method:'DELETE'});setModal(null);await reloadMatrix();await reloadSections();notify('Column deleted');});}
 function deleteColumns(ids){ask(`Delete ${ids.length} columns?`,'The selected columns and all values inside them will be permanently deleted.',async()=>{if(ids.length>5000)throw new Error('Maximum 5,000 columns per delete.');await api(`/sections/${selectedId}/items/bulk-delete`,{method:'POST',body:{ids}});setModal(null);await reloadMatrix();await reloadSections();notify(`${ids.length} columns deleted`);},'Delete columns');}
 function deleteSelected(){ask(`Delete ${selectedCount} records?`,'The selected rows and their amounts will be permanently removed.',async()=>{if(multiSelected.length>5000)throw new Error('Maximum 5,000 records per delete.');await api(`/sections/${selectedId}/records/bulk-delete`,{method:'POST',body:{ids:multiSelected}});setMultiSelected([]);await reloadMatrix();await reloadSections();notify(`${selectedCount} rows deleted`);},'Delete selected');}
 function deleteSection(){ask(`Delete “${section.name}” section?`,`This deletes the entire section, ${section.recordCount} records, ${section.itemCount} columns, and every associated amount. This cannot be undone.`,async()=>{await api(`/sections/${selectedId}`,{method:'DELETE'});setModal(null);await reloadSections();notify('Section deleted');},'Delete entire section');}
 function clearAllValues(){ask('Clear all amounts?','Every amount in this section will be removed. Record names and column names will remain.',async()=>{await api(`/sections/${selectedId}/values`,{method:'DELETE'});setModal(null);await reloadMatrix();notify('All amounts cleared');},'Clear amounts');}
 function clearSelectedValues(){ask('Clear amounts for selected rows?',`All amount values for ${selectedCount} selected rows will be removed, but those records will remain.`,async()=>{
    if(multiSelected.length>5000)throw new Error('Maximum 5,000 records per operation.');
    await api(`/sections/${selectedId}/records/clear-values`,{method:'POST',body:{ids:multiSelected}});
    await reloadMatrix();notify('Selected row amounts cleared');
  },'Clear selected values');}
 async function logout(){try{await onLogout();}catch(e){notify('Sign-out request failed. Please try again.','error');}}
 const busy=loading||matrixLoading;
 return <div className="workspace">
   <aside className={`sidebar ${mobileNav?'sidebar-open':''}`}><div className="sidebar-heading"><BrandIdentity variant="sidebar"/><button className="icon-btn mobile-close" aria-label="Close menu" onClick={()=>setMobileNav(false)}><X size={20}/></button></div>
     <div className="nav-label">WORKSPACE</div><button className="nav-item nav-active" onClick={()=>{setMobileNav(false);}}><LayoutDashboard size={18}/> Directory <span className="nav-active-dot"/></button>
     <div className="nav-label nav-space">YOUR SECTIONS</div><div className="nav-sections">{sections.map(s=><button key={s.id} className={`nav-item ${s.id===selectedId?'nav-section-active':''}`} onClick={()=>switchSection(s.id)}><FolderKanban size={17}/><span className="nav-name">{s.name}</span><span className="nav-count">{s.recordCount}</span></button>)}</div>
     <button className="nav-create" disabled={bulkEdit} onClick={()=>{setModal({type:'section'});setMobileNav(false);}}><Plus size={17}/> New section</button>
     <div className="sidebar-bottom"><div className="sidebar-help"><span><ShieldCheck size={17}/></span><div><strong>Private workspace</strong><p>Protected with secure sign-in</p></div></div>
       <button className="profile-row" onClick={logout} title="Sign out" aria-label="Sign out"><div className="avatar">{(username||'A')[0].toUpperCase()}</div><div><strong>{username}</strong><small>Administrator</small></div><LogOut size={17}/></button>
     </div>
   </aside>
   <main className="main-content"><div className="mobile-overlay" onClick={()=>setMobileNav(false)} style={{display:mobileNav?'block':'none'}}/>
     <header className="topbar"><div className="crumb"><button className="icon-btn mobile-menu" aria-label="Open menu" onClick={()=>setMobileNav(true)}><Menu size={22}/></button><span className="desktop-breadcrumb">Workspace <ChevronRight size={15}/> <b>Directory</b></span><span className="mobile-home-brand"><BrandIdentity variant="mobile"/></span></div><div className="topbar-right"><span className="session-pill"><LockKeyhole size={14}/> Administrator</span><span className="mini-avatar">{(username||'A')[0].toUpperCase()}</span></div></header>
     <div className="page-content">
       <div className="page-head"><div><div className="eyebrow">DIRECTORY MANAGEMENT</div><h1>Institutions &amp; Courses</h1><p>Manage institutes, training courses, consultants and pricing.</p></div><Button icon={Plus} className="new-section-cta" disabled={bulkEdit} onClick={()=>setModal({type:'section'})}>New section</Button></div>
       {loading?<div className="loading-panel"><RefreshCw className="spin" size={23}/>Loading workspace…</div>:sectionsError?<div className="loading-panel error-panel"><AlertTriangle size={19}/>Could not load sections: {sectionsError}<Button variant="secondary" icon={RefreshCw} onClick={()=>{setLoading(true);reloadSections().catch(e=>setSectionsError(e.message)).finally(()=>setLoading(false));}}>Retry</Button></div>:sections.length===0?<div className="empty-workspace"><div className="empty-icon"><Layers3 size={29}/></div><h2>Build your first directory</h2><p>Your database starts completely empty. Create a section and choose what its records and columns represent.</p><Button icon={Plus} onClick={()=>setModal({type:'section'})}>Create a section</Button><div className="starter-heading">QUICK START — CUSTOMIZABLE FORM PRESETS</div><div className="starter-cards">{STARTERS.map((s,i)=>{const Icon=[Database,Landmark,GraduationCap][i];return <button key={s.name} className="starter-card" onClick={()=>setModal({type:'section',initial:{...s}})}><Icon size={23}/><div><b>{s.name}</b><span>{s.recordLabel} · {s.itemLabel}</span></div><ArrowRight size={17}/></button>;})}</div><small>Templates only fill the form; no example data is inserted.</small></div>:<>
         <div className="section-switcher"><div className="section-tabs">{sections.map(s=><button key={s.id} className={`section-tab ${s.id===selectedId?'selected':''}`} onClick={()=>switchSection(s.id)}>{s.name}</button>)}</div><button className="tab-add" disabled={bulkEdit} onClick={()=>setModal({type:'section'})} title="Add section"><Plus size={18}/></button></div>
         {section&&<>
           <div className="section-overview"><div><div className="section-kicker"> CURRENT SECTION</div><h2>{section.name}</h2><p>Manage {labelPlural(section.recordLabel).toLowerCase()}, {labelPlural(section.itemLabel).toLowerCase()}, and their associated amounts.</p></div><div className="overview-actions"><Button variant="secondary" icon={Settings2} disabled={bulkEdit} onClick={()=>setModal({type:'manageSection'})}>Section settings</Button></div></div>
           <div className="stats-grid"><div className="stat"><div className="stat-icon blue"><Users size={20}/></div><div><span>{labelPlural(section.recordLabel)}</span><strong>{formatCount(matrix?.rows.length ?? section.recordCount)}</strong></div></div><div className="stat"><div className="stat-icon amber"><Columns3 size={20}/></div><div><span>{labelPlural(section.itemLabel)}</span><strong>{formatCount(matrix?.columns.length ?? section.itemCount)}</strong></div></div><div className="stat"><div className="stat-icon emerald"><CheckCheck size={20}/></div><div><span>Amounts recorded</span><strong>{formatCount(populated)}</strong></div></div></div>
           <div className="directory-panel"><div className="panel-head"><div><h3>{section.recordLabel} directory</h3><p>Edit individual amounts or switch to full-table editing.</p></div><div className="panel-actions"><Button icon={Plus} disabled={bulkEdit} onClick={()=>setModal({type:'record',mode:'add'})}>Add {section.recordLabel}</Button><Button variant="secondary" icon={Plus} disabled={bulkEdit} onClick={()=>setModal({type:'item'})}>Add {section.itemLabel}</Button></div></div>
             <div className="grid-toolbar"><div className="search-wrap"><Search size={17}/><input placeholder={`Search ${labelPlural(section.recordLabel).toLowerCase()}…`} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} aria-label="Search records"/></div>
               <div className="grid-toolbar-right"><select className="sort-select" value={sort} aria-label="Sort rows" onChange={e=>{setSort(e.target.value);setPage(1);}}><option value="name">Name A–Z</option><option value="created">Creation order</option></select><Button variant="toolbar" icon={FileText} onClick={exportPDF} disabled={pdfBusy||!matrix}>{pdfBusy?'Exporting…':'Export PDF'}</Button><span className="record-indicator">{filtered.length} {filtered.length===1?'record':'records'}</span><div className="toolbar-divider"/>
               {bulkEdit?<><Button variant="ghost" disabled={gridSaving} onClick={()=>{setBulkEdit(false);setDrafts({});}}>Cancel edit</Button><Button icon={Save} disabled={gridSaving||changes.length===0} onClick={saveBulk}>{gridSaving?'Saving grid…':`Save ${changes.length} change${changes.length===1?'':'s'}`}</Button></>:<><Button variant="toolbar" icon={Pencil} disabled={!matrix?.rows.length||!matrix?.columns.length} onClick={beginBulk}>Edit grid</Button><Button variant="toolbar" icon={Columns3} onClick={()=>setModal({type:'columns'})}>Columns</Button></>}
               <div className="menu-parent"><button className="toolbar-icon" aria-label="More actions" onClick={()=>setShowMenu(s=>!s)}><MoreHorizontal size={20}/></button>{showMenu&&<div className="action-menu"><button onClick={()=>{exportCurrentCSV();setShowMenu(false);}}><FileDown size={16}/> Export CSV</button><button onClick={()=>{exportPDF();setShowMenu(false);}}><FileText size={16}/> Export PDF</button><button onClick={()=>{printDirectory();setShowMenu(false);}}><Printer size={16}/> Print table</button><button disabled={bulkEdit} onClick={()=>{setModal({type:'manageSection'});setShowMenu(false);}}><Settings2 size={16}/> Manage section</button></div>}</div>
               </div></div>
             {selectedCount>0&&<div className="selection-bar"><span><CheckCheck size={18}/>{selectedCount} selected</span><div><Button variant="toolbar" icon={X} onClick={()=>setMultiSelected([])}>Deselect</Button><Button variant="toolbar" icon={Trash2} disabled={bulkEdit} onClick={clearSelectedValues}>Clear values</Button><Button variant="danger" icon={Trash2} disabled={bulkEdit} onClick={deleteSelected}>Delete rows</Button></div></div>}
             {matrixError?<div className="table-loading load-error"><AlertTriangle size={19}/>Could not load table: {matrixError}<Button variant="secondary" icon={RefreshCw} onClick={()=>reloadMatrix().catch(e=>notify(e.message,'error'))}>Retry</Button></div>:busy||!matrix?<div className="table-loading"><RefreshCw className="spin"/> Loading directory…</div>:matrix.rows.length===0?<div className="table-empty"><div className="table-empty-icon"><Users size={23}/></div><h4>No {labelPlural(section.recordLabel).toLowerCase()} yet</h4><p>Add your first {section.recordLabel.toLowerCase()} to get started. No sample records are preloaded.</p><Button icon={Plus} onClick={()=>setModal({type:'record',mode:'add'})}>Add {section.recordLabel}</Button></div>:<div className="table-scroll"><table className="matrix-table"><thead><tr>
                 <th className="select-col"><input type="checkbox" aria-label="Select all records on this page" checked={pagination.rows.length>0&&pagination.rows.every(r=>multiSelected.includes(r.id))} onChange={e=>setMultiSelected(prev=>e.target.checked?[...new Set([...prev,...pagination.rows.map(r=>r.id)])]:prev.filter(id=>!pagination.rows.some(r=>r.id===id)))}/></th><th className="number-col">#</th><th className="name-col">{section.recordLabel}</th>
                 {matrix.columns.map(c=><th key={c.id} className="amount-col"><span>{c.name}</span></th>)}<th className="actions-col">Actions</th></tr></thead>
               <tbody>{filtered.length===0?<tr><td colSpan={matrix.columns.length+4} className="search-empty">No records match “{search}”.</td></tr>:shownRows.map((r,i)=><tr key={r.id} className={multiSelected.includes(r.id)?'row-selected':''}>
                 <td className="select-col"><input type="checkbox" aria-label={`Select ${r.name}`} checked={multiSelected.includes(r.id)} onChange={e=>setMultiSelected(p=>e.target.checked?[...p,r.id]:p.filter(x=>x!==r.id))}/></td><td className="number-col">{(printAll?0:pagination.start)+i+1}</td><td className="name-col"><div className="record-name"><span className="record-avatar">{r.name.charAt(0).toUpperCase()}</span><span title={r.name}>{r.name}</span></div></td>
                 {matrix.columns.map(c=><td key={c.id} className="amount-col">{bulkEdit?<input className="bulk-cell-input" disabled={gridSaving} maxLength={22} aria-label={`${r.name} ${c.name} amount`} value={drafts[`${r.id}:${c.id}`]??''} inputMode="decimal" onChange={e=>setDrafts(p=>({...p,[`${r.id}:${c.id}`]:e.target.value}))}/>:<InlineCell value={r.values[c.id]} unit={section.amountUnit} onSave={v=>singleCell(r,c,v)}/>}</td>)}
                 <td className="actions-col"><div className="row-actions"><button title={`Edit ${r.name}`} aria-label={`Edit ${r.name}`} disabled={bulkEdit} onClick={()=>setModal({type:'record',mode:'edit',row:r})}><Pencil size={16}/></button><button className="danger-text" title={`Delete ${r.name}`} aria-label={`Delete ${r.name}`} disabled={bulkEdit} onClick={()=>deleteRow(r)}><Trash2 size={16}/></button></div></td></tr>)}</tbody>
               </table></div>}
             <div className="panel-footer directory-footer">
               <div className="pagination-summary"><span>Showing {pagination.total===0?0:pagination.start+1}–{pagination.end} of {pagination.total} matching {labelPlural(section.recordLabel).toLowerCase()}</span><span className="total-records">· {matrix?.rows.length||0} total</span></div>
               <div className="pagination-toolbar" role="navigation" aria-label="Table pagination">
                 <label className="rows-per-page">Rows per page <select aria-label="Rows per page" value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}>{PAGE_SIZE_OPTIONS.map(size=><option key={size} value={size}>{size}</option>)}</select></label>
                 <button className="pager-btn" aria-label="First page" disabled={pagination.page===1} onClick={()=>setPage(1)}>«</button>
                 <button className="pager-btn" aria-label="Previous page" disabled={pagination.page===1} onClick={()=>setPage(pagination.page-1)}>‹</button>
                 <span className="page-current" aria-live="polite">Page {pagination.page} of {pagination.pageCount}</span>
                 <button className="pager-btn" aria-label="Next page" disabled={pagination.page>=pagination.pageCount} onClick={()=>setPage(pagination.page+1)}>›</button>
                 <button className="pager-btn" aria-label="Last page" disabled={pagination.page>=pagination.pageCount} onClick={()=>setPage(pagination.pageCount)}>»</button>
               </div>
               <span className="save-status"><span className="status-dot"/>{bulkEdit?"Unsaved edits in progress":"All displayed amounts are saved"}</span>
             </div>
           </div>
         </>}
       </>}
       <footer className="page-footer">Brain Serve <span>·</span> Institution &amp; Course Directory</footer>
     </div>
   </main>
   {modal?.type==='section'&&<Modal title={modal.initial?.id?'Edit section':'Create new section'} subtitle="Define a category and choose how rows and columns are named." onClose={()=>setModal(null)}><SectionForm initial={modal.initial} onClose={()=>setModal(null)} onSubmit={saveSection}/></Modal>}
   {modal?.type==='record'&&matrix&&<Modal wide title={modal.mode==='edit'?`Edit ${section.recordLabel.toLowerCase()}`:`Add ${section.recordLabel.toLowerCase()}`} subtitle="All amounts are optional and can be changed at any time." onClose={()=>setModal(null)}><RecordForm key={`${modal.mode}-${modal.row?.id||'new'}`} mode={modal.mode} initial={modal.row} activeSectionId={selectedId} activeMatrix={matrix} sections={sections} onClose={()=>setModal(null)} onSaved={async id=>{setModal(null);if(id===selectedId){await reloadMatrix();await reloadSections();}else{await reloadSections(id);}notify('Record saved successfully');}}/></Modal>}
   {modal?.type==='item'&&<Modal title={`Add ${section.itemLabel.toLowerCase()}`} subtitle="Create a new column for every record in this section." onClose={()=>setModal(null)}><NameForm label={`${section.itemLabel} name`} onClose={()=>setModal(null)} onSubmit={addItem}/></Modal>}
   {modal?.type==='renameItem'&&<Modal title={`Rename ${section.itemLabel.toLowerCase()}`} subtitle="Existing amounts will be preserved." onClose={()=>setModal(null)}><NameForm label={`${section.itemLabel} name`} initial={modal.column.name} onSubmit={renameItem} onClose={()=>setModal(null)}/></Modal>}
   {modal?.type==='columns'&&matrix&&<Modal title={`Manage ${labelPlural(section.itemLabel).toLowerCase()}`} subtitle="Add, rename, or delete the columns of this table." onClose={()=>setModal(null)}><ManageColumns matrix={matrix} onAdd={()=>setModal({type:'item'})} onEdit={column=>setModal({type:'renameItem',column})} onRemove={deleteColumn} onRemoveMultiple={deleteColumns}/></Modal>}
   {modal?.type==='manageSection'&&section&&<Modal title="Section settings" subtitle={`Manage the “${section.name}” section.`} onClose={()=>setModal(null)}><div className="modal-body settings-body"><div className="settings-row"><div><b>Section details</b><p>Change its name, row and column labels, and amount unit.</p></div><Button variant="secondary" icon={Pencil} onClick={()=>setModal({type:'section',initial:section})}>Edit</Button></div>
      <div className="settings-row"><div><b>Clear table values</b><p>Remove all amounts, but keep rows and columns.</p></div><Button variant="secondary" onClick={clearAllValues}>Clear values</Button></div>
      <div className="settings-row danger-setting"><div><b>Delete entire section</b><p>Remove this section and all its records, columns, and values.</p></div><Button variant="danger" icon={Trash2} onClick={deleteSection}>Delete section</Button></div></div></Modal>}
   {confirm&&<Modal title={confirm.title} subtitle="Confirm this action before proceeding." onClose={()=>setConfirm(null)}><div className="modal-body confirm-body"><div className="confirm-icon"><AlertTriangle size={24}/></div><p>{confirm.message}</p><div className="modal-actions"><Button variant="ghost" onClick={()=>setConfirm(null)}>Cancel</Button><Button variant="danger" icon={Trash2} onClick={confirmAction}>{confirm.destructiveLabel}</Button></div></div></Modal>}
   {toast&&<div className={`toast ${toast.type==='error'?'toast-error':''}`} role="status"><span>{toast.type==='error'?<AlertTriangle size={17}/>:<Check size={17}/>}</span>{toast.message}<button aria-label="Dismiss" onClick={()=>setToast(null)}><X size={16}/></button></div>}
 </div>;
}
export default function App(){
 const [status,setStatus]=useState('loading');const [setup,setSetup]=useState(false);const [username,setUsername]=useState('');
 async function bootstrap(){try{const user=await refreshSession();setUsername(user.username);setStatus('dashboard');}
  catch{try{const s=await setupStatus();setSetup(s.setupRequired);setStatus('auth');}catch{setStatus('offline');}}}
 useEffect(()=>{bootstrap();const expire=()=>{setToken(null);setUsername('');setSetup(false);setStatus('auth');};const channel=typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('brainserve-auth') : null;if(channel)channel.onmessage=e=>{if(e.data?.type==='logout')expire();};window.addEventListener('session-expired',expire);return()=>{window.removeEventListener('session-expired',expire);channel?.close();};},[]);
 async function logout(){await signOut();setUsername('');setSetup(false);setStatus('auth');}
 if(status==='loading')return <div className="boot-screen"><BrandIdentity variant="loading"/><div className="spin"><RefreshCw/></div><span>Opening workspace…</span></div>;
 if(status==='offline')return <div className="boot-screen"><BrandIdentity variant="loading"/><h2>Cannot connect to the backend</h2><p>Start the Spring Boot server on port 8080 and PostgreSQL, then retry.</p><Button icon={RefreshCw} onClick={()=>{setStatus('loading');bootstrap();}}>Retry connection</Button></div>;
 if(status==='auth')return <AuthPage setupRequired={setup} onSignedIn={name=>{setUsername(name);setSetup(false);setStatus('dashboard');}}/>;
 return <Dashboard username={username} onLogout={logout}/>;
}
