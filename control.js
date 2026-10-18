/* BLACK FILE V4 | Admin-only deployment client. Secrets are NEVER stored in the browser. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const getSB=()=>window.BLACKFILE_APP?.getClient();
const getUser=()=>window.BLACKFILE_APP?.getUser();
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const setStatus=(id,msg,tone='')=>{const x=$(id);if(x){x.textContent=msg;x.dataset.tone=tone;}};
const MAX_ZIP=9*1024*1024,MAX_ITEMS=60,MAX_ONE=1500000,MAX_ALL=7500000;
let preparedFiles=[], deployFiles=[], preparedCases=[], previewSHA='', recentHead='', canDeploy=false, memberTimer=null, membersCache=[];
let jszipWait=null;
const SAFE_EXT=/\.(?:html|css|js|mjs|json|webmanifest|svg|png|jpg|jpeg|webp|ico|txt|md)$/i;
const unsafePath=path=> !path || path.length>180 || path.includes('\\') || path.startsWith('/') || path.startsWith('.') || path.includes('%') || path.includes('//') || path.includes('?') || path.includes('#') || path.split('/').some(p=>!p||p==='..'||p==='.'||p.startsWith('.')) || /^(?:supabase|node_modules|__MACOSX|\.github|\.git)\//i.test(path) || /(?:secret|token|password|credential|private|\.env)/i.test(path) || !SAFE_EXT.test(path);
function readable(e){return e?.message||String(e||'خطأ غير معروف');}
async function call(action,fields={}){
 if(!getUser())throw new Error('سجّل دخولك أولاً');
 const sb=getSB();if(!sb)throw new Error('Supabase غير متصل');
 const {data,error}=await sb.functions.invoke('bf-control',{body:{action,...fields}});
 if(error){
  let detail=error.message||'تعذر الاتصال بخادم الإدارة';
  try{const raw=await error.context?.json();if(raw?.error)detail=raw.error;}catch{}
  throw new Error(detail);
 }
 if(data?.error)throw new Error(data.error);
 return data;
}
async function loadJSZip(){
 if(window.JSZip)return window.JSZip;
 if(jszipWait)return jszipWait;
 jszipWait=new Promise((resolve,reject)=>{
  const s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  s.onload=()=>window.JSZip?resolve(window.JSZip):reject(new Error('تعذر تحميل قارئ ZIP'));
  s.onerror=()=>reject(new Error('تعذر فتح مكتبة ZIP؛ تأكد من الاتصال بالإنترنت'));
  document.head.appendChild(s);
 });
 try{return await jszipWait;}catch(e){jszipWait=null;throw e;}
}
function toBase64(bytes){
 let result='';for(let i=0;i<bytes.length;i+=0x6000)result+=String.fromCharCode(...bytes.subarray(i,i+0x6000));
 return btoa(result);
}
function prepareEntry(path,bytes){
 if(unsafePath(path))throw new Error(`مسار غير مسموح: ${path}`);
 if(bytes.length>MAX_ONE)throw new Error(`حجم ${path} أكبر من 1.5 ميغابايت`);
 return {path,bytes:bytes.length,content_base64:toBase64(bytes)};
}
function normalizeZipPaths(files){
 const src=files.filter(f=>!f.path.startsWith('__MACOSX/')&&!f.path.endsWith('.DS_Store'));
 if(!src.length)throw new Error('ملف ZIP فارغ');
 const first=src[0].path.split('/')[0];
 const allHaveRoot=src.every(f=>f.path.startsWith(first+'/'));
 return src.map(f=>({...f,path:allHaveRoot?f.path.slice(first.length+1):f.path}));
}
function validateCases(value){
 const arr=Array.isArray(value)?value:value?.cases;
 if(!Array.isArray(arr)||arr.length<1||arr.length>100)throw new Error('ملف القضايا يجب أن يحتوي 1 إلى 100 قضية في مصفوفة cases');
 return arr.map((c,i)=>{
  const content=c.content||{opening:c.opening||'',scenes:c.scenes};
  const scenes=content?.scenes;
  if(typeof c.title!=='string'||c.title.trim().length<3||c.title.length>120||typeof c.synopsis!=='string'||c.synopsis.trim().length<5||c.synopsis.length>300)throw new Error(`عنوان أو وصف القضية ${i+1} غير صحيح`);
  if(!Array.isArray(scenes)||scenes.length<3||scenes.length>30)throw new Error(`القضية ${i+1}: لازم 3 إلى 30 مرحلة`);
  for(const scene of scenes)if(!Array.isArray(scene.options)||scene.options.length<2||!Number.isInteger(scene.answer)||scene.answer<0||scene.answer>=scene.options.length)throw new Error(`القضية ${i+1}: خيارات أو إجابات غير صالحة`);
  return {title:c.title.trim(),synopsis:c.synopsis.trim(),premium:!!c.premium_only,published:c.published===true,publish_on:typeof c.publish_on==='string'?c.publish_on:new Date().toISOString().slice(0,10),content};
 });
}
async function readBundle(){
 const zip=$('bfZipInput').files[0],single=[...$('bfFilesInput').files];
 if(!zip&&!single.length)throw new Error('اختر ملف ZIP أو ملفات منفردة');
 if(zip&&single.length)throw new Error('استخدم ZIP أو ملفات منفردة، مو الاثنين مع بعض');
 let entries=[];
 if(zip){
  if(zip.size>MAX_ZIP)throw new Error('حجم ملف ZIP أكبر من 9 ميغابايت');
  const JSZip=await loadJSZip();
  const parsed=await JSZip.loadAsync(zip,{checkCRC32:true});
  const list=Object.entries(parsed.files).filter(([,v])=>!v.dir).map(([path,entry])=>({path,entry}));
  if(list.length>MAX_ITEMS+1)throw new Error('ZIP يحتوي ملفات أكثر من الحد المسموح');
  entries=normalizeZipPaths(list);
  let declared=0;
  for(const item of entries){
   const raw=Number(item.entry?._data?.uncompressedSize || 0);
   if(raw>MAX_ONE)throw new Error(`ZIP يحتوي ملفاً كبيراً جداً: ${item.path}`);
   declared+=raw;
   if(declared>MAX_ALL+500000)throw new Error('المحتوى المتوقع بعد فك ZIP كبير جداً');
  }
 }else entries=single.map(file=>({path:file.name,entry:file}));
 const totalPaths=new Set();let total=0;
 let cases=[];const code=[];
 for(const {path,entry} of entries){
  if(totalPaths.has(path.toLowerCase()))throw new Error('فيه اسم ملف مكرر');
  totalPaths.add(path.toLowerCase());
  // Reject suspicious paths before reading/decompressing them.
  if(path==='bf_cases_import.json'){
   const bytes=entry.async?await entry.async('uint8array'):new Uint8Array(await entry.arrayBuffer());
   if(bytes.byteLength>500000)throw new Error('ملف القضايا كبير جداً');
   cases=validateCases(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
   continue;
  }
  if(unsafePath(path))throw new Error(`ملف غير مسموح: ${path}؛ SQL وSecrets لا تنفذ عبر رفع الملفات`);
  const bytes=entry.async?await entry.async('uint8array'):new Uint8Array(await entry.arrayBuffer());
  total+=bytes.length;if(total>MAX_ALL)throw new Error('الملفات بعد فك ZIP تتجاوز 7.5 ميغابايت');
  code.push(prepareEntry(path,bytes));
 }
 if(!code.length&&!cases.length)throw new Error('ماكو ملفات قابلة للنشر');
 return {code,cases};
}
function renderPreview(changes){
 const rows=changes||preparedFiles.map(f=>({path:f.path,bytes:f.bytes,type:'waiting'}));
 const tbody=$('bfFileRows');tbody.innerHTML='';
 const types={new:'جديد',changed:'تعديل',same:'بدون تغيير',waiting:'ينتظر'};
 for(const r of rows){
  const tr=document.createElement('tr');
  const c1=document.createElement('td');c1.dir='ltr';c1.textContent=r.path;
  const c2=document.createElement('td');c2.textContent=Math.round(r.bytes/1024)+' KB';
  const c3=document.createElement('td');const t=document.createElement('span');t.className=`bf-tag ${r.type}`;t.textContent=types[r.type]||'—';c3.appendChild(t);
  tr.append(c1,c2,c3);tbody.append(tr);
 }
 $('bfFilePreview').hidden=!rows.length;
}
async function prep(){
 setStatus('bfPublishStatus','جاري قراءة ZIP وفحص الملفات…');
 $('bfPublishBtn').disabled=true;previewSHA='';deployFiles=[];
 try{
  const obj=await readBundle();preparedFiles=obj.code;preparedCases=obj.cases;
  renderPreview();
  const caseLine=preparedCases.length?` + ${preparedCases.length} قضية لقاعدة البيانات`:'';
  if(preparedFiles.length){
   const data=await call('preview',{files:preparedFiles.map(({path,content_base64})=>({path,content_base64}))});
   previewSHA=data.expected_sha;deployFiles=preparedFiles.filter(f=>data.changes.some(c=>c.path===f.path&&c.type!=='same'));renderPreview(data.changes);
   setStatus('bfPublishStatus',`✅ المعاينة جاهزة: ${data.changed} ملف جديد أو متغيّر${caseLine}.\nما راح ينحذف أي ملف موجود. راجع القائمة قبل النشر.`,'success');
  }else setStatus('bfPublishStatus',`✅ ${preparedCases.length} قضية جاهزة للاستيراد إلى Supabase.`, 'success');
  $('bfPublishBtn').disabled=!(preparedCases.length || deployFiles.length && previewSHA);
 }catch(e){preparedFiles=[];preparedCases=[];renderPreview([]);setStatus('bfPublishStatus','❌ '+readable(e),'error');}
}
async function importCases(cases){
 const sb=getSB();let done=0;
 for(const c of cases){
  const {error}=await sb.rpc('bf_admin_save_case',{
   p_id:null,p_title:c.title,p_synopsis:c.synopsis,p_premium:c.premium,p_published:c.published,p_publish_on:c.publish_on,p_content:c.content
  });
  if(error)throw new Error(`استُوردت ${done} قضية، ثم تعطل الاستيراد: ${error.message}`);
  done++;
 }
 return done;
}
async function publish(){
 const n=deployFiles.length,m=preparedCases.length;
 if(!n&&!m)throw new Error('لا يوجد تحديث جاهز');
 const summary=`نشر ${n} ملفاً إلى GitHub${m?' واستيراد '+m+' قضية إلى Supabase':''}.\nالملفات الموجودة بنفس الاسم سيتم استبدالها. لا يمكن ضمان إتمام GitHub وSupabase كمعاملة واحدة.`;
 if(!confirm(summary+'\n\nهل أنت متأكد؟'))return;
 $('bfPublishBtn').disabled=true;$('bfPreviewBtn').disabled=true;
 let githubResult=null;
 try{
  if(n){
   setStatus('bfPublishStatus','جاري إنشاء إصدار جديد في GitHub…');
   githubResult=await call('publish',{files:deployFiles.map(({path,content_base64})=>({path,content_base64})),expected_sha:previewSHA,note:$('bfReleaseNote').value.trim()});
   setStatus('bfPublishStatus',`✅ GitHub: تم نشر ${githubResult.count} ملفاً.\n${m?'جاري استيراد القضايا…':'موقع GitHub Pages يتحدث خلال دقائق.'}`,'success');
  }
  const count=m?await importCases(preparedCases):0;
  setStatus('bfPublishStatus',`✅ تم نشر ${githubResult?.count||0} ملفاً على GitHub، واستيراد ${count} قضية في Supabase.\nإذا غيرت ملفات الموقع قد يحتاج النشر عدة دقائق.`, 'success');
  preparedFiles=[];deployFiles=[];preparedCases=[];previewSHA='';$('bfZipInput').value='';$('bfFilesInput').value='';renderPreview([]);
  await refreshHistory();
 }catch(e){setStatus('bfPublishStatus',`${githubResult?'✅ تم نشر GitHub.\n':''}❌ ${readable(e)}\nإذا تم نشر بعض التحديثات لا تعيد الضغط قبل مراجعة النتائج.`,'error');}
 finally{$('bfPreviewBtn').disabled=false;$('bfPublishBtn').disabled=true;}
}
async function refreshHistory(){
 try{
  const data=await call('history');recentHead=data.commits?.[0]?.sha||'';
  const container=$('bfGitHistory');container.innerHTML='';
  for(let i=0;i<(data.commits||[]).length;i++){
   const item=data.commits[i];
   const div=document.createElement('div');div.className='bf-history-item';
   const text=document.createElement('div');
   const b=document.createElement('b');b.textContent=item.message||'إصدار';
   const small=document.createElement('small');small.textContent=`${item.sha.slice(0,8)} · ${new Date(item.date).toLocaleString('ar-KW')}`;
   text.append(b,small);div.appendChild(text);
   if(i>0){const btn=document.createElement('button');btn.type='button';btn.className='button button-light';btn.textContent='استعادة هذا الإصدار';btn.addEventListener('click',()=>rollback(item.sha));div.append(btn);}
   container.append(div);
  }
  if(!data.commits?.length)container.textContent='لا توجد إصدارات.';
 }catch(e){$('bfGitHistory').textContent='تعذر تحميل إصدارات GitHub: '+readable(e);}
}
async function rollback(sha){
 const txt='تنبيه: استعادة هذا الإصدار تعيد جميع ملفات الموقع إلى شكلها في ذلك الوقت، وليس ملفاً واحداً. بيانات Supabase لن تتغير. هل أنت متأكد؟';
 if(!confirm(txt))return;
 try{
  setStatus('bfHistoryStatus','جاري استعادة الإصدار السابق…');
  await call('rollback',{target_sha:sha,expected_sha:recentHead});
  setStatus('bfHistoryStatus','✅ تم إنشاء إصدار استعادة جديد. انتظر تحديث GitHub Pages.','success');
  await refreshHistory();previewSHA='';$('bfPublishBtn').disabled=true;
 }catch(e){setStatus('bfHistoryStatus','❌ '+readable(e),'error');}
}
async function enterPanel(){
 try{
  const sb=getSB();if(!sb||!getUser()){setStatus('bfPublishStatus','سجّل دخولك أولاً');return;}
  const {data,error}=await sb.rpc('bf_is_admin');if(error||data!==true)throw new Error('الواجهة للمالك فقط');
  const info=await call('status');
  setStatus('bfConnectStatus',`✅ متصل بمستودع ${info.repo} — الفرع ${info.branch}`,'success');
  await refreshHistory();
 }catch(e){setStatus('bfConnectStatus','⚠️ '+readable(e),'error');}
}
async function loadMemberOptions(q=''){
 try{
  const data=await call('members',{query:q});membersCache=data.members||[];
  const target=$('bfMemberResults');target.innerHTML='';
  if(!membersCache.length){target.textContent='ماكو أعضاء مطابقين';return;}
  for(const member of membersCache){
   const btn=document.createElement('button');btn.type='button';
   const strong=document.createElement('strong');strong.textContent=member.name||'بدون اسم';
   const small=document.createElement('span');small.textContent=`${member.email||'بريد غير متاح'} · #${member.number}`;
   btn.append(strong,small);
   btn.addEventListener('click',()=>{
    $('bfNoticeMember').value=String(member.number);
    $('bfNoticeMemberSelected').textContent=`✅ المستلم: ${member.name} — ${member.email} — #${member.number}`;
    target.hidden=true;
   });target.append(btn);
  }
  target.hidden=false;
 }catch(e){setStatus('bfNoticeMemberSelected','تعذر جلب الأعضاء: '+readable(e),'error');}
}
function setup(){
 if(!$('bfPreviewBtn')||!$('bfNoticeSearch'))return;
 $('bfPreviewBtn').addEventListener('click',prep);
 $('bfPublishBtn').addEventListener('click',publish);
 $('bfHistoryRefresh').addEventListener('click',refreshHistory);
 $('bfZipInput').addEventListener('change',()=>{if($('bfZipInput').files.length)$('bfFilesInput').value='';preparedFiles=[];deployFiles=[];previewSHA='';$('bfPublishBtn').disabled=true;});
 $('bfFilesInput').addEventListener('change',()=>{if($('bfFilesInput').files.length)$('bfZipInput').value='';preparedFiles=[];deployFiles=[];previewSHA='';$('bfPublishBtn').disabled=true;});
 document.querySelector('[data-admintab="control"]')?.addEventListener('click',enterPanel);
 $('bfNoticeSearch').addEventListener('input',()=>{
  $('bfNoticeMember').value='';$('bfNoticeMemberSelected').textContent='';
  clearTimeout(memberTimer);memberTimer=setTimeout(()=>loadMemberOptions($('bfNoticeSearch').value),240);
 });
 $('bfNoticeSearch').addEventListener('focus',()=>loadMemberOptions($('bfNoticeSearch').value));
 $('bfNoticeAudience').addEventListener('change',e=>{
  if(e.target.value==='one'){loadMemberOptions();$('bfNoticeMemberSelected').textContent='اختار عضواً من القائمة';}
  else{$('bfNoticeMember').value='';$('bfNoticeSearch').value='';$('bfMemberResults').hidden=true;}
 });
 $('bfNoticeForm').addEventListener('submit',()=>{
  setTimeout(()=>{if($('bfNoticeAudience').value==='all'){
    $('bfNoticeSearch').value='';$('bfNoticeMemberSelected').textContent='';$('bfMemberResults').hidden=true;
  }},500);
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
