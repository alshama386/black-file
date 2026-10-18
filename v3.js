/* BLACK FILE V3. Progressive enhancement: V2 games/auth/leaderboard remain unchanged. */
(() => {
'use strict';
const byId = id => document.getElementById(id);
const bridge = () => window.BLACKFILE_APP;
const client = () => bridge()?.getClient();
const currentUser = () => bridge()?.getUser();
const text = value => String(value ?? '');
const esc = value => text(value).replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const toast = m => bridge()?.toast(m);
const navigate = name => bridge()?.navigate(name);
const nowKuwait = () => {const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const d=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${d.year}-${d.month}-${d.day}`;};
const message = (el,msg) => { if(el)el.textContent=msg; };
let isAdmin=false, knownUser=null, caseList=[],adminCases=[],casesReady=false, noticeList=[],readSet=new Set(),caseRun=null, checkId=0, swRegistration=null;
const queuedCaseWrites=new Map();
const defaultContent={opening:'وصل بلاغ جديد، اقرأ الأدلة ثم قرّر.',scenes:[
 {kind:'دليل',text:'ماذا يكشف الدليل الأول؟',options:['الاحتمال المدعوم بالدليل','مجرد تخمين','لا يمكن تجاهل الدليل'],answer:0,explain:'التفسير الأول يعتمد على المعلومات المتاحة.'},
 {kind:'استجواب',text:'ما السؤال الأنسب للشاهد؟',options:['سؤال محدد عن الزمن','اتهامه مباشرة','إنهاء الاستجواب'],answer:0,explain:'الأسئلة الدقيقة تعطي بيانات أوثق.'},
 {kind:'خاتمة',text:'شنو القرار بعد جمع الأدلة؟',options:['تقييم جميع الأدلة','الإدانة بلا دليل','إهمال التناقضات'],answer:0,explain:'المحقق يفصل بين الحقيقة والافتراض.'}
]};

async function rpc(name,params={}) {
 const sb=client(); if(!sb)throw new Error('الاتصال بـSupabase غير جاهز.');
 const {data,error}=await sb.rpc(name,params);
 if(error)throw new Error(`${error.message} (${name})`);
 return data;
}
function dateTag(s){try {return new Date(`${s}T12:00:00Z`).toLocaleDateString('ar-KW',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});}catch{return esc(s);}}

function renderCases(){
 const el=byId('bfCaseList');if(!el)return;
 if(!casesReady){el.textContent='جاري تحميل القضايا…';return;}
 if(!caseList.length){el.textContent='ماكو ملفات منشورة للحين. ألعاب اليوم الأربع موجودة بالقائمة الرئيسية.';return;}
 el.innerHTML=caseList.map(c=>`<article class="v3-case-card"><div class="v3-card-top"><span>📁 ملف ${esc(dateTag(c.publish_on))}</span><b class="v3-chip ${c.premium_only?'premium':''}">${c.premium_only?'✦ VIP':'مجاناً'}</b></div><h3>${esc(c.title)}</h3><p>${esc(c.synopsis)}</p><button class="button button-primary" type="button" data-open-case="${esc(c.id)}">افتح التحقيق ↗</button></article>`).join('');
}
async function loadCases(){
 try{caseList=await rpc('bf_case_list'); casesReady=true;renderCases();}
 catch(e){casesReady=true;message(byId('bfCaseList'),'تعذر تحميل ملفات التحقيق. تأكد إنك ركّبت SQL V3. '+e.message);}
}
async function openCase(id){
 const user = currentUser();
 try{
  message(byId('bfCasePlayer'),'جاري فتح الملف…');navigate('caseDetail');
  const data=await rpc('bf_get_case',{p_case_id:id});
  if(!data){message(byId('bfCasePlayer'),'الملف غير متاح حالياً.');return;}
  if(data.locked){byId('bfCasePlayer').innerHTML='<div class="v3-locked"><div>🔐</div><h2>تحقيق حصري لـ VIP</h2><p>هذا الملف متاح للأعضاء المميزين فقط. الاشتراك المدفوع ليلحين مو مفعّل؛ الإدارة تقدر تمنح وصولاً تجريبياً.</p><button class="button button-light" data-v3-back="1">رجوع للملفات</button></div>';return;}
  const scenes=data.content?.scenes;
  if(!Array.isArray(scenes)||!scenes.length)throw new Error('محتوى الملف ناقص.');
  caseRun={id:data.id,title:data.title,opening:data.content.opening||'',scenes,at:0,correct:0,answers:[],userId:user?.id||'guest'};
  let previous=readProgress(id);
  // Use cloud progress when signed in; local progress is a fallback for guests.
  if(user){
   const {data,error}=await client().from('bf_case_progress').select('step,correct,completed').eq('user_id',user.id).eq('case_id',id).maybeSingle();
   if(error){console.warn('Case cloud progress unavailable',error.message);}
   else if(data)previous={at:data.step,correct:data.correct,completed:data.completed};
  }
  if(previous){caseRun.correct=Math.max(0,Math.min(Number(previous.correct)||0,scenes.length));caseRun.at=previous.completed?scenes.length:Math.max(0,Math.min(Number(previous.at)||0,scenes.length));}
  renderCasePlay();
 }catch(e){message(byId('bfCasePlayer'),'تعذر فتح القضية: '+e.message);}
}
function progressKey(id){return `bf3_case_${currentUser()?.id||'guest'}_${id}`;}
function readProgress(id){try {return JSON.parse(localStorage.getItem(progressKey(id))||'null');}catch{return null;}}
function saveProgress(){
 if(!caseRun)return;
 const r=caseRun,record={completed:r.at>=r.scenes.length,correct:r.correct,at:r.at};
 try{localStorage.setItem(progressKey(r.id),JSON.stringify(record));}catch{}
 const user=currentUser();if(user && user.id===r.userId && client()){
  const payload={user_id:user.id,case_id:r.id,step:record.at,correct:record.correct,completed:record.completed,updated_at:new Date().toISOString()};
  const old=queuedCaseWrites.get(r.id)||Promise.resolve();
  const task=old.catch(()=>{}).then(async()=>{
    const {error}=await client().from('bf_case_progress').upsert(payload,{onConflict:'user_id,case_id'});
    if(error)console.warn('Could not sync case progress',error.message);
  });
  queuedCaseWrites.set(r.id,task);
 }
}
function renderCasePlay(){
 const r=caseRun;if(!r)return;const target=byId('bfCasePlayer');if(!target)return;
 if(r.at>=r.scenes.length){
  const rate=Math.round(r.correct/r.scenes.length*100);
  target.innerHTML=`<div class="v3-finished"><span class="section-eyebrow">CASE CLOSED</span><h2>🕵️ خلص التحقيق!</h2><p>${esc(r.title)}</p><div class="v3-result">${r.correct} / ${r.scenes.length}</div><p>دقة تحليل الأدلة: ${rate}%</p><p class="v3-help">هذي نتيجة تحقيق تفاعلي محفوظة محلياً، ما تدخل في ترتيب الألعاب الأربع.</p><div class="v3-form-row"><button class="button button-primary" data-v3-restart="1">إعادة التحقيق</button><button class="button button-light" data-v3-back="1">رجوع</button></div></div>`;return;
 }
 const s=r.scenes[r.at],options=Array.isArray(s.options)?s.options:[];
 target.innerHTML=`<div class="v3-investigation"><div class="v3-step-top"><span>🗂️ ${esc(r.title)}</span><span>${r.at+1} / ${r.scenes.length}</span></div><div class="v3-meter"><span style="width:${100*r.at/r.scenes.length}%"></span></div><div class="v3-note">${r.at===0?esc(r.opening):'تابع تحليل الملف حتى توصل إلى الحقيقة.'}</div><div class="v3-clue-type">${esc(s.kind||'الدليل التالي')}</div><h2>${esc(s.text||'ماذا تستنتج؟')}</h2><div class="v3-choices">${options.map((o,i)=>`<button type="button" data-v3-choice="${i}">${esc(o)}</button>`).join('')}</div><div id="bfClueFeedback" class="v3-explanation hidden"></div></div>`;
}
function chooseCase(i){
 const r=caseRun;if(!r || r.at>=r.scenes.length)return;
 const scene=r.scenes[r.at];if(r.answers[r.at]!==undefined)return;
 const ok=i===Number(scene.answer);r.answers[r.at]=i;if(ok)r.correct++;
 document.querySelectorAll('[data-v3-choice]').forEach(btn=>{btn.disabled=true;if(Number(btn.dataset.v3Choice)===Number(scene.answer))btn.classList.add('correct');if(Number(btn.dataset.v3Choice)===i&&!ok)btn.classList.add('incorrect');});
 const f=byId('bfClueFeedback');f.classList.remove('hidden');f.innerHTML=`<strong>${ok?'✅ تحليل ممتاز':'🔎 دقق أكثر'}</strong><p>${esc(scene.explain||'حلّل الأدلة وخذ قرارك.')}</p><button type="button" class="button button-primary" data-v3-next="1">${r.at===r.scenes.length-1?'اعرض النتيجة':'الدليل التالي ←'}</button>`;
}
function nextScene(){if(!caseRun)return;caseRun.at++;saveProgress();renderCasePlay();}

async function sessionUpdate(){
 const user=currentUser();const token=++checkId;knownUser=user?.id||null;isAdmin=false;byId('bfAdminBtn')?.classList.add('hidden');
 if(!user){closeNotices(); if(!byId('adminView')?.classList.contains('hidden'))navigate('home');return;}
 try{
  const granted=await rpc('bf_is_admin');if(token!==checkId)return;isAdmin=granted===true;
  if(isAdmin)byId('bfAdminBtn').classList.remove('hidden');
  if(!isAdmin && !byId('adminView')?.classList.contains('hidden'))navigate('home');
 }catch(e){console.info('Admin check unavailable; access stays denied',e.message);}
 await loadNotices();
}
function onlyAdmin(){if(!currentUser()||!isAdmin){toast('لوحة الإدارة مخصصة للحساب المصرّح له فقط.');navigate('home');return false;}return true;}
async function openAdmin(){
 if(!onlyAdmin())return;navigate('admin');await refreshAdmin();
}
async function refreshAdmin(){
 if(!onlyAdmin())return;message(byId('bfAdminFeedback'),'جاري تحميل لوحة الإدارة…');
 try{
  const [stats, rows, members]=await Promise.all([rpc('bf_admin_stats'),rpc('bf_admin_case_list'),rpc('bf_admin_members')]);
  adminCases=rows||[];
  byId('bfAdminMetrics').innerHTML=[['👥 الأعضاء',stats.members],['🎮 لعب اليوم',stats.today_plays],['💎 VIP فعال',stats.active_vip],['📁 ملفات',stats.cases],['🔔 إشعارات',stats.notices]].map(([name,value])=>`<div><strong>${esc(value)}</strong><span>${esc(name)}</span></div>`).join('');
  renderAdminCases();renderAdminMembers(members||[]);message(byId('bfAdminFeedback'),'تم تحديث البيانات ✅');
 }catch(e){message(byId('bfAdminFeedback'),'خطأ في الصلاحيات أو البيانات: '+e.message);}
}
function renderAdminCases(){
 const target=byId('bfAdminCaseList');
 if(!adminCases.length){target.textContent='ماكو قضايا للحين.';return;}
 target.innerHTML='<div class="v3-admin-list">'+adminCases.map(c=>`<div><span><strong>${esc(c.title)}</strong><small>${c.published?'منشورة':'مسودة'} · ${c.premium_only?'VIP':'مجانية'} · ${esc(c.publish_on)}</small></span><button type="button" data-editcase="${esc(c.id)}">تعديل</button></div>`).join('')+'</div>';
}
function renderAdminMembers(rows){
 const el=byId('bfAdminMemberList');
 el.innerHTML='<div class="v3-admin-list">'+rows.map(m=>`<div><span><strong>${esc(m.display_name)}</strong><small>#${esc(m.member_number)} · ${m.status==='active'&&new Date(m.period_end)>new Date()?'💎 VIP حتى '+esc(new Date(m.period_end).toLocaleDateString('ar-KW')):'عضو مجاني'}</small></span><button type="button" data-vip-member="${esc(m.member_number)}">اختيار</button></div>`).join('')+'</div>';
}
function clearCaseForm(){
 byId('bfCaseForm').reset();byId('bfCaseId').value='';byId('bfCaseDate').value=nowKuwait();byId('bfCaseScenes').value=JSON.stringify(defaultContent,null,2);
}
function editCase(id){
 if(!onlyAdmin())return;
 const c=adminCases.find(x=>x.id===id);if(!c)return;
 byId('bfCaseId').value=c.id;byId('bfCaseTitle').value=c.title;byId('bfCaseSummary').value=c.synopsis;byId('bfCaseDate').value=c.publish_on;byId('bfCasePremium').value=String(c.premium_only);byId('bfCasePublished').value=String(c.published);
 byId('bfCaseScenes').value=JSON.stringify(c.content||defaultContent,null,2);
 byId('bfCaseForm').scrollIntoView({behavior:'smooth'});
}
async function saveCase(e){
 e.preventDefault();if(!onlyAdmin())return;
 const button=e.submitter;button.disabled=true;
 try{
  const content=JSON.parse(byId('bfCaseScenes').value);
  if(!Array.isArray(content.scenes)||content.scenes.length<3||content.scenes.length>30)throw new Error('حط 3 إلى 30 مرحلة داخل scenes.');
  for(const s of content.scenes){if(!Array.isArray(s.options)||s.options.length<2||!Number.isInteger(s.answer)||s.answer<0||s.answer>=s.options.length)throw new Error('كل مرحلة لازم تحتوي options وanswer صحيح يبدأ من 0.');}
  await rpc('bf_admin_save_case',{p_id:byId('bfCaseId').value||null,p_title:byId('bfCaseTitle').value.trim(),p_synopsis:byId('bfCaseSummary').value.trim(),p_premium:byId('bfCasePremium').value==='true',p_published:byId('bfCasePublished').value==='true',p_publish_on:byId('bfCaseDate').value,p_content:content});
  toast('انحفظت القضية ✅');clearCaseForm();await refreshAdmin();await loadCases();
 }catch(err){toast('تعذر الحفظ: '+err.message);}finally{button.disabled=false;}
}
function adminTab(tab){
 const ids={cases:'bfAdminCases',notices:'bfAdminNotices',members:'bfAdminMembers'};
 for(const [name,id] of Object.entries(ids))byId(id).classList.toggle('hidden',name!==tab);
 document.querySelectorAll('[data-admintab]').forEach(b=>b.classList.toggle('active',b.dataset.admintab===tab));
}
async function sendNotice(e){
 e.preventDefault();if(!onlyAdmin())return;
 const button=e.submitter;button.disabled=true;
 try{
  const member=byId('bfNoticeAudience').value==='one'?Number(byId('bfNoticeMember').value):null;
  if(byId('bfNoticeAudience').value==='one'&&!member)throw new Error('حدد رقم العضوية.');
  const id=await rpc('bf_admin_notice',{p_title:byId('bfNoticeTitle').value.trim(),p_body:byId('bfNoticeBody').value.trim(),p_member:member});
  byId('bfNoticeForm').reset();byId('bfNoticeMemberWrap').classList.add('hidden');
  message(byId('bfPushStatus'),'✅ تم نشر الإشعار داخل الموقع. جاري محاولة إرسال Push إذا كان الخادم مفعّلاً…');
  await loadNotices();
  const sb=client();let offset=0,sent=0,failed=0,more=true,count=0,err=null;
  while(more&&count<20){
    const {data,error}=await sb.functions.invoke('push-dispatch',{body:{notification_id:id,offset}});
    if(error||data?.error){err=error||new Error(data?.error);break;}
    sent+=Number(data?.sent||0);failed+=Number(data?.failed||0);offset=data?.next_offset||0;more=Boolean(data?.more);count++;
  }
  if(err)message(byId('bfPushStatus'),`✅ تنبيه الموقع منشور. Push الخارجي مو جاهز أو تعذر الإرسال (${sent} مرسل حتى الآن).`);
  else message(byId('bfPushStatus'),`✅ تم النشر؛ Push: ${sent} مرسل، ${failed} فشل${more?'، باقي إشعارات تحتاج إرسال إضافي':''}.`);
  await refreshAdmin();
 }catch(e){message(byId('bfPushStatus'),'خطأ: '+e.message);}finally{button.disabled=false;}
}
async function setVIP(e){
 e.preventDefault();if(!onlyAdmin())return;
 if(!confirm('تأكيد منح/إلغاء وصول VIP التجريبي؟ هذا لا يعني استلام دفعة مالية.'))return;
 try{
  await rpc('bf_admin_grant_vip',{p_member:Number(byId('bfVIPMember').value),p_days:Number(byId('bfVIPDuration').value)});
  toast('تم تعديل صلاحية VIP التجريبية ✅');await refreshAdmin();
 }catch(e){toast('تعذر تحديث VIP: '+e.message);}
}

function closeNotices(){byId('bfNoticeOverlay')?.classList.add('hidden');}
async function openNotices(){
 if(!currentUser()){bridge()?.showLogin();return;}
 byId('bfNoticeOverlay').classList.remove('hidden');await loadNotices();
}
async function loadNotices(){
 const user=currentUser();if(!user)return;
 const sb=client();if(!sb)return;
 try{
  const [n,r]=await Promise.all([
   sb.from('bf_notifications').select('id,title,body,created_at').order('created_at',{ascending:false}).limit(50),
   sb.from('bf_notification_reads').select('notification_id').eq('user_id',user.id).limit(200)
  ]);
  if(n.error)throw n.error;if(r.error)throw r.error;
  noticeList=n.data||[];readSet=new Set((r.data||[]).map(x=>x.notification_id));renderNotices();
 }catch(e){message(byId('bfNoticeList'),'تعذر تحميل التنبيهات، تأكد من تشغيل SQL V3.');}
}
function renderNotices(){
 const el=byId('bfNoticeList');if(!el)return;
 el.innerHTML=noticeList.length?noticeList.map(x=>`<div class="v3-notice ${readSet.has(x.id)?'':'new'}"><strong>${esc(x.title)}</strong><p>${esc(x.body)}</p><small>${esc(new Date(x.created_at).toLocaleString('ar-KW'))}</small></div>`).join(''):'ماكو إشعارات للحين.';
 const unread=noticeList.filter(x=>!readSet.has(x.id)).length;
 byId('bfNotificationsBtn').textContent=unread?'🔔 '+(unread>9?'9+':unread):'🔔';
}
async function markRead(){
 const uid=currentUser()?.id;if(!uid)return;
 const pending=noticeList.filter(x=>!readSet.has(x.id));if(!pending.length)return;
 const {error}=await client().from('bf_notification_reads').insert(pending.map(x=>({user_id:uid,notification_id:x.id})));
 if(error){toast('تعذر تحديد المقروء.');return;}
 pending.forEach(x=>readSet.add(x.id));renderNotices();
}
function base64URLToUint8Array(base64String){
 const padding='='.repeat((4-base64String.length%4)%4),base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
 const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}
async function enablePush(){
 const label=byId('bfPushHelp');
 if(!currentUser()){message(label,'سجّل دخولك أول علشان تربط الجهاز بعضويتك.');return;}
 if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window)){message(label,'متصفحك ما يدعم إشعارات الويب على هذا الوضع.');return;}
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent);
 const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 if(ios&&!standalone){message(label,'الآيفون يحتاج إضافة الموقع للشاشة الرئيسية من Safari، ثم فتحه من الأيقونة علشان تشتغل Push.');return;}
 const pub=window.BLACKFILE_V3_CONFIG?.vapidPublicKey;
 if(!pub){message(label,'زر الإشعارات جاهز. لكن إرسال Push ينتظر تركيب مفتاح VAPID العام وEdge Functions من ملف التعليمات. تنبيهات داخل الموقع شغالة.');return;}
 try{
  const permission=await Notification.requestPermission();
  if(permission!=='granted'){message(label,'ما تم السماح بالإشعارات. تقدر تغير الإذن من إعدادات الجهاز.');return;}
  const reg=swRegistration||await navigator.serviceWorker.ready;
  const subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64URLToUint8Array(pub)});
  const {data,error}=await client().functions.invoke('bright-handler',{body:{subscription:subscription.toJSON()}});
  if(error||data?.error)throw new Error(data?.error||error?.message||'Failed');
  message(label,'✅ تم ربط هذا الجهاز بإشعارات الملف الأسود.');
 }catch(e){message(label,'تعذر تفعيل Push: '+e.message);}
}
async function setupPWA(){
 if(!('serviceWorker' in navigator)||location.protocol!=='https:')return;
 try{
  swRegistration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
  await swRegistration.update();
 }catch(e){console.warn('PWA service worker',e);}
}
function installListeners(){
 byId('bfAdminBtn').addEventListener('click',openAdmin);
 byId('bfAdminRefresh').addEventListener('click',refreshAdmin);
 byId('bfCaseBack').addEventListener('click',()=>navigate('investigations'));
 byId('bfNotificationsBtn').addEventListener('click',openNotices);
 byId('bfNoticeClose').addEventListener('click',closeNotices);
 byId('bfNoticeOverlay').addEventListener('click',e=>{if(e.target===byId('bfNoticeOverlay'))closeNotices();});
 byId('bfEnablePush').addEventListener('click',enablePush);
 byId('bfMarkRead').addEventListener('click',markRead);
 byId('bfAdminCaseList').addEventListener('click',e=>{const b=e.target.closest('[data-editcase]');if(b)editCase(b.dataset.editcase);});
 byId('bfAdminMemberList').addEventListener('click',e=>{const b=e.target.closest('[data-vip-member]');if(b){byId('bfVIPMember').value=b.dataset.vipMember;byId('bfVIPForm').scrollIntoView({behavior:'smooth'});}});
 byId('bfCaseList').addEventListener('click',e=>{const b=e.target.closest('[data-open-case]');if(b)openCase(b.dataset.openCase);});
 byId('bfCasePlayer').addEventListener('click',e=>{
  const ch=e.target.closest('[data-v3-choice]');if(ch)chooseCase(Number(ch.dataset.v3Choice));
  if(e.target.closest('[data-v3-next]'))nextScene();
  if(e.target.closest('[data-v3-back]'))navigate('investigations');
  if(e.target.closest('[data-v3-restart]')){if(caseRun){
   try{localStorage.removeItem(progressKey(caseRun.id));}catch{}
   caseRun.at=0;caseRun.correct=0;caseRun.answers=[];saveProgress();renderCasePlay();
  }}
 });
 byId('bfCaseForm').addEventListener('submit',saveCase);
 byId('bfCaseFormClear').addEventListener('click',clearCaseForm);
 byId('bfNoticeForm').addEventListener('submit',sendNotice);
 byId('bfVIPForm').addEventListener('submit',setVIP);
 byId('bfNoticeAudience').addEventListener('change',e=>byId('bfNoticeMemberWrap').classList.toggle('hidden',e.target.value!=='one'));
 document.querySelectorAll('[data-admintab]').forEach(b=>b.addEventListener('click',()=>adminTab(b.dataset.admintab)));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeNotices();});
}
function init(){
 installListeners();clearCaseForm();loadCases();sessionUpdate();setupPWA();
 window.addEventListener('bf:session',sessionUpdate);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden && currentUser())loadNotices();});
 setInterval(()=>{if(currentUser()&&!document.hidden)loadNotices();},60000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
