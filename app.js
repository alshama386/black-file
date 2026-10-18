
/* BLACK FILE — daily games + cloud accounts. Paid memberships are still a preview. */
(() => {
  'use strict';
  const DATA = window.BLACKFILE_DATA;
  const STORE_KEY = 'blackfile_progress_v1';
  const SUPABASE_URL = 'https://tcveiqycmajpqzwkadwm.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_iPszDcwUgHbeCygXgN9AEw_PzmAGRoT';
  let cloud = null;
  let activeUser = null;
  let profile = null;
  let vip = null;
  let cloudReady = false;
  let sessionGeneration = 0;
  let boardPeriod = 'today';
  let authMode = 'login';
  let authWorking = false;
  let recoveryMode = false;
  const storeName = () => activeUser ? 'blackfile_account_'+activeUser.id+'_v1' : STORE_KEY;
  const readStore = key => {try {const value=JSON.parse(localStorage.getItem(key));return value&&typeof value==='object'?value:{days:{},lang:'ar'};}catch{return {days:{},lang:'ar'};}};
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const html = str => String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad = num => String(num).padStart(2,'0');
  const dateNowKuwait = () => {
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(x => [x.type,x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  const indexForDate = date => Math.max(0, Math.floor((Date.parse(date+'T00:00:00Z')-Date.parse('2026-10-18T00:00:00Z'))/86400000));
  const dateFromIndex = index => new Date(Date.parse('2026-10-18T00:00:00Z') + index*86400000).toISOString().slice(0,10);
  const today = dateNowKuwait();
  const edition = indexForDate(today);
  const dailyCase = DATA.cases[edition % DATA.cases.length];
  const safeRead = () => {try { const r = JSON.parse(localStorage.getItem(STORE_KEY)); return r && typeof r === 'object' ? r : {days:{},lang:'ar'};} catch{return {days:{},lang:'ar'};}};
  let saved = safeRead();
  if (!saved.days || typeof saved.days !== 'object') saved.days = {};
  let lang = saved.lang === 'en' ? 'en' : 'ar';
  let currentView = 'home';
  let currentGame = null;
  let timer = null;
  let caseState = null;
  let codeGuesses = [];
  let memoryState = null;
  let timelineState = null;
  const t = key => DATA.translations[lang][key] ?? key;
  const getDay = (date=today) => saved.days[date] || {};
  const outcome = key => getDay()[key];
  const scoreToday = () => Object.values(getDay()).reduce((s,v)=> s + (Number(v && v.score) || 0),0);
  const countToday = () => DATA.games.filter(g=>Boolean(outcome(g.id))).length;
  const readableDate = (s=today) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-KW-u-ca-gregory' : 'en-US',{year:'numeric',month:'long',day:'numeric', timeZone:'UTC'}).format(new Date(s+'T12:00:00Z'));
  const num = n => new Intl.NumberFormat(lang==='ar'?'ar-KW':'en-US').format(n);
  const readLocal = obj => obj[lang];
  const game = id => DATA.games.find(x=>x.id===id);
  function persist(){ try { localStorage.setItem(storeName(),JSON.stringify(saved)); }catch(e){ console.warn('Local storage unavailable',e); }}
  function track(id,result){
    if (outcome(id)) return;
    saved.days[today] = saved.days[today] || {};
    saved.days[today][id] = { score:result.score, success:Boolean(result.success), result:result.result || '', finished:Date.now() };
    persist();
    paintProgress();
    if(activeUser && cloud && cloudReady) submitCloudPlay(today,id,result);
  }
  function showToast(message){const el=$('#toast'); el.textContent=message; el.classList.add('shown');clearTimeout(showToast.timeout);showToast.timeout=setTimeout(()=>el.classList.remove('shown'),3200);}
  function clearGameTimer(){if(timer){clearInterval(timer);clearTimeout(timer);timer=null;}}
  function translateStatic(){
    document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
    $$('[data-i18n]').forEach(el => {const key=el.dataset.i18n;if(DATA.translations[lang][key]) el.textContent=t(key);});
    $('#languageBtn').textContent = lang==='ar'?'EN':'عربي';
    $('#editionDate').textContent=readableDate();
    $('#editionNo').textContent=`${t('issueLabel')} #${pad(edition+1)}`;
    $('#folderFileId').textContent=pad((edition % DATA.cases.length)+1);
    $('#gamesDate').textContent=readableDate();
    $('#footerYear').textContent=new Date().getFullYear();
    document.title=(lang==='ar'?'الملف الأسود':'BLACK FILE')+' · BLACK FILE';
    paintAccountHeader();
    updateAuthLabels();
    updateBoardLabels();
  }
  function card(g){
    const done=outcome(g.id);
    return `<article class="game-card card-${g.color}" data-game-card="${g.id}">
        <div class="card-top"><span class="card-index">${g.tag==='caseTag'?'01':g.id==='code'?'02':g.id==='memory'?'03':'04'} / 04</span><span class="game-state ${done?'is-done':''}">${done?'✓ '+t('done'):t('new')+' ✦'}</span></div>
        <div class="card-emblem">${g.icon}</div>
        <div class="card-category">${t(g.tag)}</div><h3>${t(g.name)}</h3><p>${t(g.desc)}</p>
        <div class="card-footer"><span>⏱ ${g.duration} ${lang==='ar'?'دقائق':'min'}</span><button aria-label="${html(t(done?'done':'openGame'))}: ${html(t(g.name))}" data-launch="${g.id}" class="card-go">${done?'✓':'↗'}</button></div>
      </article>`;
  }
  function paintGames(){
    $('#homeGames').innerHTML=DATA.games.map(card).join('');
    $('#allGameCards').innerHTML=DATA.games.map(card).join('');
  }
  function paintProgress(){
    const completed=countToday();
    $('#dailyCounter').textContent=`${num(completed)} / ${num(4)}`;
    $('#dailyScore').textContent=`${num(scoreToday())} / ${num(500)}`;
    $('#dailyProgressBar').style.width=(completed/4*100)+'%';
    paintGames();
  }
  function paintArchive(){
    const rows=[];
    for (let ago=1;ago<=8;ago++){
      const dayIdx=edition-ago;
      if(dayIdx<0)break;
      const date=dateFromIndex(dayIdx);
      const c=DATA.cases[dayIdx%DATA.cases.length];
      rows.push(`<article class="archive-row"><div class="archive-file-icon">${c.visual}</div><div class="archive-row-copy"><span>${html(readableDate(date))} · ${t('archiveDate')}</span><strong>${html(readLocal(c)["title"])}</strong></div><div class="archive-lock">⌑ <span>${t('locked')}</span></div><button class="archive-go" data-open-premium aria-label="${html(t('viewPlan'))}">↗</button></article>`);
    }
    // Offer a preview of members-only bonus cases even before the first daily archive entry exists.
    DATA.cases.slice(1,7).forEach(c=>{
      rows.push(`<article class="archive-row"><div class="archive-file-icon">${c.visual}</div><div class="archive-row-copy"><span>${lang==='ar'?'ملف إضافي · مكتبة المشتركين':'Bonus file · Members library'}</span><strong>${html(readLocal(c).title)}</strong></div><div class="archive-lock">⌑ <span>${t('locked')}</span></div><button class="archive-go" data-open-premium aria-label="${html(t('viewPlan'))}">↗</button></article>`);
    });

    $('#archiveList').innerHTML=rows.join('');
  }
  function streak(){
    const dates=Object.keys(saved.days).filter(date=>DATA.games.some(g=>saved.days[date]?.[g.id])).sort();
    if(!dates.length)return 0;
    const prev=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
    if(!dates.includes(today)&&!dates.includes(prev))return 0;
    let date=dates.includes(today)?today:prev;
    let n=0;
    while(dates.includes(date)) {n++;date=new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);}
    return n;
  }
  function paintStats(){
    const records=Object.values(saved.days);
    $('#statPlayed').textContent=num(records.reduce((n,row)=>n+DATA.games.filter(g=>row[g.id]).length,0));
    $('#statStreak').textContent=num(streak());
    $('#statPerfect').textContent=num(records.filter(row=>DATA.games.every(g=>row[g.id])).length);
    $('#statPoints').textContent=num(records.reduce((n,row)=>n+Object.values(row).reduce((a,r)=>a+(Number(r?.score)||0),0),0));
    $('#recordLines').innerHTML=DATA.games.map(g=>`<div class="record-row"><span><i class="record-symbol">${g.icon}</i>${t(g.name)}</span><strong>${outcome(g.id)?num(outcome(g.id).score)+' / '+num(g.max):'—'}</strong></div>`).join('');
  }
  function go(view){
    clearGameTimer();
    currentView=view;
    $$('.view').forEach(el=>el.classList.add('hidden'));
    const el=$('#'+view+'View');
    if(el)el.classList.remove('hidden');
    $$('.nav-item,.mobile-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    if(view==='archive')paintArchive();
    if(view==='stats'){paintStats();loadLeaderboard();}
    if(view==='games')paintProgress();
    scrollTo({top:0,behavior:'instant'});
  }
  function showPremium(){ $('#premiumModal').classList.remove('hidden'); $('#closeModal').focus(); }
  function hidePremium(){ $('#premiumModal').classList.add('hidden'); }
  function decoratePlay(id){
    const g=game(id);
    $('#playTitle').textContent=t(g.name);
    $('#playEyebrow').textContent=t(g.tag);
    $('#playDescription').textContent=t(g.desc);
    $('#playStatus').textContent=outcome(id)?'✓ '+t('done'):`${t('score')}: ${num(g.max)}`;
  }
  function launch(id){
    if(!game(id))return;
    if(activeUser && !cloudReady){showToast(lang==='ar'?'جاري تحميل نتائج حسابك، جرّب بعد لحظة.':'Loading your scores. Please wait a moment.');return;}
    currentGame=id;
    go('play');decoratePlay(id);
    if(outcome(id)){renderCompleted(id);return;}
    if(id==='case')startCase();
    if(id==='code')startCode();
    if(id==='memory')startMemory();
    if(id==='timeline')startTimeline();
  }
  function resultView({id,won,score,summary,details,emoji}){
    track(id,{score,success:won,result:details||summary});
    decoratePlay(id);
    $('#gameStage').innerHTML=`<div class="end-card"><div class="end-symbol">${emoji|| (won?'✦':'◇')}</div><span class="section-eyebrow">CASE CLOSED / ${html(t('gameFinished'))}</span><h2>${html(summary)}</h2><div class="end-score"><b>${num(score)}</b><span>/ ${num(game(id).max)} ${t('points')}</span></div>${details?`<p class="end-detail">${html(details)}</p>`:''}<div class="end-actions"><button class="button button-primary" data-view="games">${t('tryOther')} ↗</button><button class="button button-outline" data-view="stats">${t('statsTitle')}</button></div><p class="end-footnote">${t('comeTomorrow')}</p></div>`;
  }
  function renderCompleted(id){
    const result=outcome(id);
    $('#gameStage').innerHTML=`<div class="end-card"><div class="end-symbol">✓</div><span class="section-eyebrow">DAILY CASE CLOSED</span><h2>${t('alreadyDone')}</h2><p>${t('alreadyDoneDesc')}</p><div class="end-score"><b>${num(result.score)}</b><span>/ ${num(game(id).max)} ${t('points')}</span></div><div class="end-actions"><button class="button button-primary" data-view="games">${t('tryOther')} ↗</button><button class="button button-outline" data-view="stats">${t('statsTitle')}</button></div></div>`;
  }
  const shuffled = (arr,seed) => {
    const a=[...arr]; let r=(seed>>>0)||1;
    for(let i=a.length-1;i>0;i--){r=(Math.imul(r,1664525)+1013904223)>>>0;const j=r%(i+1);[a[i],a[j]]=[a[j],a[i]];}
    return a;
  };
  function startCase(){
    const story=readLocal(dailyCase);
    caseState={opened:new Set(),selected:null,suspects:shuffled(story.suspects.map((s,i)=>({data:s,original:i})),edition+7)};
    const scene=$('#gameStage');
    scene.innerHTML=`<div class="case-banner"><div class="case-banner-icon">${dailyCase.visual}</div><div><span class="section-eyebrow">${t('caseTag')} / FILE ${dailyCase.no}</span><h2>${html(story.title)}</h2><p>${html(story.location)}</p></div><div class="case-watermark">${dailyCase.no}</div></div>
       <div class="case-brief"><span class="small-label">${t('caseBrief')}</span><p>${html(story.brief)}</p></div>
       <div class="case-heading"><h3>${t('evidenceTitle')} <span>✧</span></h3><small>${t('evidenceSeen')}: <b id="seenCount">0</b> / ${story.evidence.length}</small></div><p class="helper-copy">${t('evidenceHint')}</p>
       <div class="evidence-grid">${story.evidence.map((c,i)=>`<button class="evidence-card" data-clue="${i}"><span class="evidence-num">${pad(i+1)} / EVIDENCE</span><span class="clue-icon">${['⌕','⌁','◉','▦'][i]}</span><strong>${html(c[0])}</strong><small>+ ${lang==='ar'?'افتح الدليل':'Open evidence'}</small></button>`).join('')}</div>
       <div id="clueDetail" class="clue-detail hidden"></div>
       <div class="case-heading suspect-heading"><h3>${t('suspectTitle')} <span>✧</span></h3></div><p class="helper-copy">${t('suspectHint')}</p>
       <div class="suspects-list">${caseState.suspects.map((p,i)=>`<button class="suspect" data-suspect="${i}"><div class="suspect-avatar">${html(p.data[0].slice(0,1))}</div><div class="suspect-copy"><strong>${html(p.data[0])}</strong><small>${html(p.data[1])}</small><q>${html(p.data[2])}</q></div><span class="suspect-radio"></span></button>`).join('')}</div>
       <div class="verdict-bar"><div><span class="small-label">FINAL VERDICT</span><p>${t('facts')}</p></div><button class="button button-primary" id="verdictButton">${t('verdict')} ↗</button></div>`;
    $$('[data-clue]',scene).forEach(btn=>btn.addEventListener('click',()=>{
      const i=+btn.dataset.clue;caseState.opened.add(i);btn.classList.add('examined');
      $('#seenCount').textContent=num(caseState.opened.size);
      const [name,details]=story.evidence[i];
      const box=$('#clueDetail');box.classList.remove('hidden');box.innerHTML=`<span>${pad(i+1)} / ${t('evidenceTitle')}</span><h4>${html(name)}</h4><p>${html(details)}</p>`;
    }));
    $$('[data-suspect]',scene).forEach(btn=>btn.addEventListener('click',()=>{caseState.selected=+btn.dataset.suspect;$$('.suspect',scene).forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');}));
    $('#verdictButton').addEventListener('click',()=>{
      if(caseState.opened.size<2){showToast(t('needEvidence'));return;}
      if(caseState.selected===null){showToast(t('pickSuspect'));return;}
      const correct=caseState.suspects[caseState.selected].original===dailyCase.culprit;
      resultView({id:'case',won:correct,score:correct?200:25,summary:t(correct?'right':'wrong'),details:story.resolution,emoji:correct?'✦':'⌕'});
    });
  }
  function startCode(){
    codeGuesses=[];
    renderCode();
  }
  function renderCode(){
    const secret=DATA.codes[edition % DATA.codes.length];
    const rows=Array.from({length:6},(_,i)=>{
      const entry=codeGuesses[i];
      return `<div class="code-row">${Array.from({length:4},(_,j)=>`<span class="digit-box ${entry?(entry.result[j]===2?'exact':entry.result[j]===1?'partial':'none'):''}">${entry?entry.guess[j]:'·'}</span>`).join('')}${entry?`<span class="code-feedback">${entry.result.filter(v=>v===2).length} <i class="hint-dot exact"></i>&nbsp; ${entry.result.filter(v=>v===1).length} <i class="hint-dot partial"></i></span>`:''}</div>`;
    }).join('');
    $('#gameStage').innerHTML=`<div class="challenge-layout"><div class="challenge-instructions"><div class="challenge-icon">⌗</div><h2>${t('codeName')}</h2><p>${t('codeInfo')}</p><div class="legend-row"><span><i class="hint-dot exact"></i>${t('codeExact')}</span><span><i class="hint-dot partial"></i>${t('codePartial')}</span></div><div class="fact-card"><span>${t('attemptsLeft')}</span><b>${num(6-codeGuesses.length)}</b></div></div><div class="challenge-main"><div class="code-board">${rows}</div><form id="codeForm" class="code-form"><label for="codeInput" class="sr-only">${t('codeInput')}</label><input id="codeInput" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="4" placeholder="0 0 0 0" aria-label="${t('codeInput')}" /><button class="button button-primary" type="submit">${t('tryGuess')} ↗</button></form></div></div>`;
    $('#codeForm').addEventListener('submit',e=>{
      e.preventDefault();const guess=$('#codeInput').value.replace(/[^0-9]/g,'');
      if(guess.length!==4){showToast(t('invalidCode'));return;}
      const secretArr=[...secret]; const markers=Array(4).fill(0);const used=Array(4).fill(false);
      for(let j=0;j<4;j++)if(guess[j]===secret[j]){markers[j]=2;used[j]=true;}
      for(let j=0;j<4;j++)if(markers[j]!==2){const k=secretArr.findIndex((s,p)=>!used[p]&&s===guess[j]);if(k>=0){markers[j]=1;used[k]=true;}}
      codeGuesses.push({guess,result:markers});
      if(guess===secret){resultView({id:'code',won:true,score:Math.max(45,120-(codeGuesses.length-1)*15),summary:t('codeWon'),details:`${t('secretWas')}: ${secret}`,emoji:'🔓'});}
      else if(codeGuesses.length===6){resultView({id:'code',won:false,score:0,summary:t('codeLost'),details:`${t('secretWas')}: ${secret}`,emoji:'⌗'});}
      else {renderCode();$('#codeInput').focus();}
    });
  }
  function startMemory(){
    memoryState={symbols:DATA.symbolSets[edition % DATA.symbolSets.length],right:0,index:0};
    $('#gameStage').innerHTML=`<div class="intro-challenge"><div class="big-illustration">◉</div><span class="section-eyebrow">SEVEN SECONDS</span><h2>${t('memoryReady')}</h2><p>${t('memoryInstructions')}</p><button class="button button-primary" id="beginMemory">${t('showScene')} ↗</button></div>`;
    $('#beginMemory').addEventListener('click',()=>{
      let countdown=7;
      $('#gameStage').innerHTML=`<div class="memory-reveal"><div class="memory-count"><span>${t('memorize')}</span><strong id="countDown">${num(countdown)}</strong></div><div class="memory-symbols">${memoryState.symbols.map(s=>`<div class="memory-symbol">${s}</div>`).join('')}</div><p class="helper-copy">${t('memoryInstructions')}</p></div>`;
      timer=setInterval(()=>{countdown--; if($('#countDown'))$('#countDown').textContent=num(countdown);if(countdown<=0){clearGameTimer();renderMemoryQuestion();}},1000);
    });
  }
  function renderMemoryQuestion(){
    const seq=memoryState.symbols;
    const idx=memoryState.index;
    const pool=[...new Set(DATA.symbolSets.flat())].filter(x=>!seq.includes(x));
    const absent=pool[(edition+3)%pool.length];
    const questions=[{q:t('memoryThird'),correct:seq[2],options:shuffled([seq[2],seq[0],seq[4],seq[5]],edition+11)},
      {q:t('memoryLast'),correct:seq[5],options:shuffled([seq[1],seq[3],seq[5],seq[2]],edition+23)},
      {q:t('memoryAbsent'),correct:absent,options:shuffled([seq[0],seq[2],seq[4],absent],edition+37)}];
    const q=questions[idx];
    $('#gameStage').innerHTML=`<div class="quiz-stage"><div class="quiz-progress"><span>${t('memoryQuestion')} ${num(idx+1)} / 3</span><div>${[0,1,2].map(i=>`<i class="${i<=idx?'fill':''}"></i>`).join('')}</div></div><h2>${html(q.q)}</h2><div class="quiz-options">${q.options.map((s,i)=>`<button class="symbol-option" data-memory-option="${i}" aria-label="${s}">${s}</button>`).join('')}</div><p class="helper-copy">${t('memoryQuestion')} ${num(idx+1)} / 3</p></div>`;
    $$('[data-memory-option]').forEach(btn=>btn.addEventListener('click',()=>{
      if(q.options[+btn.dataset.memoryOption]===q.correct)memoryState.right++;
      memoryState.index++;
      if(memoryState.index===3){const n=memoryState.right;resultView({id:'memory',won:n>=2,score:Math.round(n/3*100),summary:t('memoryFinished'),details:`${t('yourScore')}: ${num(n)} / 3`,emoji:'◉'});}
      else renderMemoryQuestion();
    }));
  }
  function startTimeline(){
    timelineState={order:shuffled([0,1,2,3],edition+155),attempts:0};
    if(timelineState.order.every((id,pos)=>id===pos))timelineState.order=[2,0,3,1];
    renderTimeline();
  }
  function renderTimeline(){
    const steps=DATA.timelines[edition % DATA.timelines.length][lang];
    $('#gameStage').innerHTML=`<div class="timeline-layout"><div class="challenge-instructions"><div class="challenge-icon">≋</div><h2>${t('timelineName')}</h2><p>${t('timelineInfo')}</p><span class="section-eyebrow">${t('attemptsLeft')}: ${num(2-timelineState.attempts)}</span></div><div class="timeline-main"><div class="timeline-list">${timelineState.order.map((n,i)=>`<div class="timeline-row"><span class="timeline-position">${num(i+1)}</span><span class="timeline-text">${html(steps[n])}</span><div class="move-controls"><button data-move="${i}:up" ${i===0?'disabled':''} aria-label="${html(lang==='ar'?'حرّك فوق':'Move up')}">↑</button><button data-move="${i}:down" ${i===3?'disabled':''} aria-label="${html(lang==='ar'?'حرّك تحت':'Move down')}">↓</button></div></div>`).join('')}</div><button id="timelineSubmit" class="button button-primary button-full">${t('submitOrder')} ↗</button></div></div>`;
    $$('[data-move]').forEach(b=>b.addEventListener('click',()=>{const [p,d]=b.dataset.move.split(':');const i=Number(p),j=d==='up'?i-1:i+1;if(j<0||j>3)return;[timelineState.order[i],timelineState.order[j]]=[timelineState.order[j],timelineState.order[i]];renderTimeline();}));
    $('#timelineSubmit').addEventListener('click',()=>{
      const won=timelineState.order.every((n,i)=>n===i);
      timelineState.attempts++;
      if(won)resultView({id:'timeline',won:true,score:timelineState.attempts===1?80:50,summary:t('timelineWon'),emoji:'≋'});
      else if(timelineState.attempts>=2)resultView({id:'timeline',won:false,score:0,summary:t('timelineLost'),details:`${t('correctOrder')}: ${steps.join(' ← ')}`,emoji:'≋'});
      else {showToast(t('timelineTryAgain'));renderTimeline();}
    });
  }

  // Account system: Supabase Auth + database RLS, while keeping guest play available.
  const accountString = (ar,en) => lang==='ar' ? ar : en;
  function accountFeedback(message,ok=false){
    const el=$('#authFeedback');el.textContent=message;el.classList.toggle('ok',ok);
  }
  function updateAuthLabels(){
    const L=(ar,en)=>accountString(ar,en);
    $('#authTitle').textContent=L('👤 حساب المحقق','👤 Detective account');
    $('#authIntro').textContent=L('سجّل مجاناً علشان تنحفظ نتائجك على كل أجهزتك.','Sign up free to save your scores across devices.');
    $('#authLoginTab').textContent=L('تسجيل الدخول','Sign in');
    $('#authSignupTab').textContent=L('حساب جديد','Create account');
    $('#authNameWrap span').textContent=L('اسم المحقق','Detective name');
    $('#authEmailLabel').textContent=L('البريد الإلكتروني','Email address');
    $('#authPasswordLabel').textContent=L('كلمة المرور','Password');
    $('#authSubmit').textContent=authMode==='signup'?L('إنشاء حساب مجاني','Create free account'):L('تسجيل الدخول','Sign in');
    $('#authReset').textContent=L('نسيت كلمة المرور؟','Forgot password?');
    $('#profileNameLabel').textContent=L('اسمك الظاهر في ترتيب المحققين','Your name on the leaderboard');
    $('#profileSave').textContent=L('💾 حفظ الاسم','💾 Save name');
    $('#signOutBtn').textContent=L('تسجيل الخروج','Sign out');
    $('#recoveryLabel').textContent=L('كلمة المرور الجديدة','New password');
    $('#recoverySubmit').textContent=L('تحديث كلمة المرور','Update password');
    $('#authNameWrap').classList.toggle('hidden',authMode!=='signup');
    $('#authReset').classList.toggle('hidden',authMode==='signup');
    $('#authPassword').autocomplete=authMode==='signup'?'new-password':'current-password';
    $('#authLoginTab').classList.toggle('active',authMode==='login');
    $('#authSignupTab').classList.toggle('active',authMode==='signup');
  }
  function paintAccountHeader(){
    const el=$('#accountTopText');
    if(!el)return;
    el.textContent=activeUser ? (profile?.display_name || accountString('حسابي','My account')) : accountString('دخول','Sign in');
  }
  function renderAccount(){
    paintAccountHeader();
    $('#authGuest').classList.toggle('hidden',Boolean(activeUser));
    $('#authLogged').classList.toggle('hidden',!activeUser||recoveryMode);
    $('#authRecovery').classList.toggle('hidden',!recoveryMode);
    if(activeUser){
      $('#accountName').textContent=profile?.display_name || accountString('محقق جديد','New detective');
      $('#accountMember').textContent=accountString('رقم العضوية: ','Member #')+(profile?.member_number??'…');
      $('#accountEmail').textContent=activeUser.email||'';
      const paid=vip && ['active','trialing'].includes(vip.status) && (!vip.period_end || new Date(vip.period_end)>new Date());
      $('#accountVip').textContent=paid ? 'VIP ✦' : accountString('عضوية مجانية','Free account');
      if(document.activeElement!==$('#profileNameInput')) $('#profileNameInput').value=profile?.display_name||'';
    }
  }
  function showAccount(){
    updateAuthLabels();renderAccount();accountFeedback('');
    $('#authModal').classList.remove('hidden');$('#authClose').focus();
  }
  function hideAccount(){$('#authModal').classList.add('hidden');}
  function updateBoardLabels(){
    $('#leaderboardTitle').textContent=accountString('🏆 ترتيب المحققين','🏆 Detective leaderboard');
    $('#leaderboardCaption').textContent=accountString('نقاط الأعضاء المسجلين','Scores from registered accounts');
    $('#refreshBoard').textContent=accountString('↻ تحديث','↻ Refresh');
    const labels={today:['اليوم','Today'],week:['الأسبوع','Week'],month:['الشهر','Month'],all:['الكل','All time']};
    $$('[data-period]').forEach(b=>{b.textContent=labels[b.dataset.period][lang==='ar'?0:1];b.classList.toggle('active',b.dataset.period===boardPeriod);});
  }
  async function loadLeaderboard(){
    if(!cloud){$('#leaderboardList').textContent=accountString('اتصل بالإنترنت لعرض الترتيب.','Connect to the internet to view the leaderboard.');return;}
    $('#leaderboardList').textContent=accountString('جاري تحميل الترتيب…','Loading leaderboard…');
    const period=boardPeriod;
    try{
      const {data,error}=await cloud.rpc('bf_leaderboard',{p_period:period,p_limit:15});
      if(period!==boardPeriod)return;
      if(error)throw error;
      if(!data?.length){$('#leaderboardList').textContent=accountString('ماكو نتائج بهالفترة للحين. كن أول محقق!','No results for this period yet. Be the first!');return;}
      $('#leaderboardList').innerHTML=data.map(row=>`<div class="leaderboard-row ${Number(row.member_number)===Number(profile?.member_number)?'me':''}"><strong class="leaderboard-rank">#${num(row.rank)}</strong><div class="leaderboard-user"><b>${html(row.display_name)}</b><small>ID ${html(row.member_number)} · ${num(row.games_played)} ${accountString('لعبة','games')}</small></div><span class="leaderboard-score">${num(row.total_points)} ✦</span></div>`).join('');
    }catch(err){console.warn('Leaderboard error',err);$('#leaderboardList').textContent=accountString('تعذر تحميل الترتيب حالياً.','Leaderboard unavailable right now.');}
  }
  function refreshAllUI(){
    translateStatic();paintProgress();paintArchive();paintStats();renderAccount();
    if(currentView==='stats')loadLeaderboard();
  }
  async function hydrateMember(user){
    const generation=++sessionGeneration;
    activeUser=user||null;profile=null;vip=null;cloudReady=false;
    // Scores from a guest are deliberately kept separate from personal accounts.
    saved=activeUser?readStore(storeName()):readStore(STORE_KEY);
    if(!saved.days||typeof saved.days!=='object') saved.days={};
    saved.lang=lang;
    refreshAllUI();
    if(!activeUser){cloudReady=true;window.dispatchEvent(new CustomEvent("bf:session"));return;}
    try{
      const [p,r,m]=await Promise.all([
        cloud.from('bf_profiles').select('member_number,display_name,avatar').eq('user_id',user.id).maybeSingle(),
        cloud.from('bf_plays').select('game_date,game_key,score,success,completed_at').eq('user_id',user.id).order('game_date',{ascending:false}).limit(1500),
        cloud.from('bf_memberships').select('plan,status,period_end').eq('user_id',user.id).maybeSingle()
      ]);
      if(generation!==sessionGeneration)return;
      if(p.error)throw p.error;
      if(r.error)throw r.error;
      profile=p.data||null;
      vip=m.error?null:m.data;
      // Database is the source of truth for signed-in scores.
      const days={};
      (r.data||[]).forEach(v=>{
        if(!DATA.games.some(g=>g.id===v.game_key))return;
        const d=days[v.game_date]||(days[v.game_date]={});
        d[v.game_key]={score:v.score,success:v.success,finished:Date.parse(v.completed_at)||Date.now()};
      });
      saved={days,lang};persist();cloudReady=true;refreshAllUI();window.dispatchEvent(new CustomEvent("bf:session"));
    }catch(err){
      if(generation!==sessionGeneration)return;
      console.warn('BLACK FILE cloud data unavailable',err);
      cloudReady=true; // Let player use local device if server isn't accessible.
      showToast(accountString('تعذر تحديث نتائجك من السيرفر. بنحفظها مؤقتاً على جهازك.','Cloud unavailable. Scores will stay on this device for now.'));
      refreshAllUI();window.dispatchEvent(new CustomEvent('bf:session'));
    }
  }
  async function submitCloudPlay(date,id,result){
    if(!cloud||!activeUser)return;
    const userId=activeUser.id;
    try{
      const {error}=await cloud.from('bf_plays').insert({user_id:userId,game_date:date,game_key:id,score:result.score,success:Boolean(result.success)});
      if(error){
        if(error.code==='23505'){
          showToast(accountString('هاللعبة مسجلة من قبل بحسابك.','You already finished this game today.'));
          const {data}=await cloud.from('bf_plays').select('game_date,game_key,score,success,completed_at').eq('user_id',userId).eq('game_date',date);
          if(activeUser?.id===userId&&data){
            saved.days[date]=Object.fromEntries(data.map(v=>[v.game_key,{score:v.score,success:v.success,finished:Date.parse(v.completed_at)||Date.now()}]));
            persist();paintProgress();paintStats();
          }
        }else{throw error;}
      }else if(currentView==='stats')loadLeaderboard();
    }catch(err){console.warn('Unable to save game on Supabase',err);showToast(accountString('النتيجة محفوظة بالجهاز، لكن تعذّر رفعها للحساب.','Saved locally, but cloud sync failed.'));}
  }
  async function initCloud(){
    if(!window.supabase?.createClient){
      showToast(accountString('خدمة الحسابات غير متاحة حالياً. الألعاب شغالة كضيف.','Accounts unavailable right now; guest games still work.'));
      return;
    }
    try{
      cloud=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      cloud.auth.onAuthStateChange((event,session)=>{
        if(event==='PASSWORD_RECOVERY'){
          recoveryMode=true;
          setTimeout(()=>{renderAccount();showAccount();accountFeedback(accountString('اكتب كلمة مرور جديدة لحسابك.','Set a new password for your account.'));},0);
        }
        // Avoid calling Supabase APIs directly inside the auth callback.
        setTimeout(()=>{
          const newUser=session?.user||null;
          if(newUser?.id!==activeUser?.id || (!newUser && activeUser)) hydrateMember(newUser);
        },0);
      });
      const {data,error}=await cloud.auth.getSession();
      if(error)throw error;
      await hydrateMember(data.session?.user||null);
    }catch(err){console.warn('Supabase initialization',err);cloudReady=true;accountFeedback(accountString('تعذر الاتصال بالخدمة.','Could not connect to Supabase.'));}
  }
  function humanAuthError(err){
    const message=String(err?.message||'');
    if(/invalid login credentials/i.test(message))return accountString('الإيميل أو كلمة المرور غير صحيحة.','Invalid email or password.');
    if(/email not confirmed/i.test(message))return accountString('لازم تفعّل حسابك من رابط الإيميل أول.','Confirm your email address first.');
    if(/user already registered/i.test(message))return accountString('الإيميل مسجل من قبل. جرّب تسجل دخول.','This email is already registered. Please sign in.');
    if(/password/i.test(message) && /short|least|weak|character/i.test(message))return accountString('خل كلمة المرور أقوى (6 أحرف على الأقل).','Use a stronger password (at least 6 characters).');
    return message||accountString('صار خطأ بالاتصال، جرّب مرة ثانية.','Something went wrong; please retry.');
  }
  function setupAccountUI(){
    $('#accountBtn').addEventListener('click',showAccount);
    $('#authClose').addEventListener('click',hideAccount);
    $('#authModal').addEventListener('click',e=>{if(e.target.id==='authModal')hideAccount();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')hideAccount();});
    $('#authLoginTab').addEventListener('click',()=>{authMode='login';accountFeedback('');updateAuthLabels();});
    $('#authSignupTab').addEventListener('click',()=>{authMode='signup';accountFeedback('');updateAuthLabels();});
    $('#authForm').addEventListener('submit',async e=>{
      e.preventDefault();
      if(authWorking)return;
      if(!cloud){accountFeedback(accountString('تحقق من اتصال الإنترنت وحاول مرة ثانية.','Check your internet connection and try again.'));return;}
      const email=$('#authEmail').value.trim();const password=$('#authPassword').value;
      const name=$('#authName').value.trim().slice(0,32)||'محقق جديد';
      authWorking=true;$('#authSubmit').disabled=true;accountFeedback(accountString('جاري الاتصال…','Connecting…'));
      try{
        const {data,error}=authMode==='signup' ?
          await cloud.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:location.origin+location.pathname}}) :
          await cloud.auth.signInWithPassword({email,password});
        if(error)throw error;
        if(authMode==='signup' && !data.session){
          accountFeedback(accountString('تم! افتح إيميلك واضغط رابط تفعيل الحساب، بعدها سجل دخول.','Account created! Check your inbox for a confirmation link, then sign in.'),true);
        }else{
          await hydrateMember(data.user||data.session?.user);
          accountFeedback(accountString('تم تسجيل الدخول بنجاح ✅','Signed in successfully ✅'),true);
          setTimeout(hideAccount,750);
        }
      }catch(err){accountFeedback(humanAuthError(err));}
      finally{authWorking=false;$('#authSubmit').disabled=false;}
    });
    $('#authReset').addEventListener('click',async()=>{
      const email=$('#authEmail').value.trim();
      if(!email){accountFeedback(accountString('حط بريدك الإلكتروني أول.','Enter your email first.'));return;}
      if(!cloud){accountFeedback(accountString('الخدمة غير متاحة.','Service unavailable.'));return;}
      const {error}=await cloud.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
      accountFeedback(error?humanAuthError(error):accountString('إذا الإيميل مسجل، راح توصلك رسالة لاسترجاع كلمة المرور.','If the email is registered, you will receive a recovery email.'),!error);
    });
    $('#profileForm').addEventListener('submit',async e=>{
      e.preventDefault();
      if(!cloud||!activeUser)return;
      const name=$('#profileNameInput').value.trim().slice(0,32);
      if(!name){accountFeedback(accountString('اكتب اسم المحقق.','Enter a detective name.'));return;}
      $('#profileSave').disabled=true;
      const {error}=await cloud.from('bf_profiles').update({display_name:name}).eq('user_id',activeUser.id);
      $('#profileSave').disabled=false;
      if(error){accountFeedback(humanAuthError(error));return;}
      profile={...(profile||{}),display_name:name};renderAccount();accountFeedback(accountString('تم تحديث الاسم ✅','Name updated ✅'),true);
      if(currentView==='stats')loadLeaderboard();
    });
    $('#recoveryForm').addEventListener('submit',async e=>{
      e.preventDefault();
      if(!cloud)return;
      const password=$('#recoveryPassword').value;
      if(password.length<6){accountFeedback(accountString('لازم 6 أحرف على الأقل.','At least 6 characters required.'));return;}
      $('#recoverySubmit').disabled=true;
      const {error}=await cloud.auth.updateUser({password});
      $('#recoverySubmit').disabled=false;
      if(error){accountFeedback(humanAuthError(error));return;}
      recoveryMode=false;renderAccount();accountFeedback(accountString('تم تغيير كلمة المرور ✅','Password updated ✅'),true);
    });
    $('#signOutBtn').addEventListener('click',async()=>{
      if(cloud){const {error}=await cloud.auth.signOut();if(error){accountFeedback(humanAuthError(error));return;}}
      recoveryMode=false;await hydrateMember(null);hideAccount();go('home');showToast(accountString('طلعت من الحساب. تقدر تلعب كضيف.','Signed out. You can still play as a guest.'));
    });
    $('#refreshBoard').addEventListener('click',loadLeaderboard);
    $$('[data-period]').forEach(b=>b.addEventListener('click',()=>{boardPeriod=b.dataset.period;updateBoardLabels();loadLeaderboard();}));
  }

  async function shareResult(){
    const icons={case:'🔎',code:'⌗',memory:'◉',timeline:'≋'};
    const report=`✦ BLACK FILE | ${lang==='ar'?'الملف الأسود':'BLACK FILE'}\n${readableDate()}\n`+DATA.games.map(g=>`${icons[g.id]} ${t(g.name)}: ${outcome(g.id)?outcome(g.id).score+'/'+g.max:'—'}`).join('\n')+`\n✦ ${t('score')}: ${scoreToday()}/500\n${location.origin.startsWith('http')?location.origin+location.pathname:''}`;
    try {
      if(navigator.share){ await navigator.share({title:'BLACK FILE',text:report}); return; }
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(report);showToast(t('shareCopied'));return;}
      const el=document.createElement('textarea');el.value=report;document.body.appendChild(el);el.select();document.execCommand('copy');el.remove();showToast(t('shareCopied'));
    }catch(err){if(err.name!=='AbortError')showToast(t('shareFailed'));}
  }

  // Read-only public interface for V3 extensions; never exposes elevated privileges.
  window.BLACKFILE_APP = Object.freeze({
    getClient:()=>cloud, getUser:()=>activeUser, getProfile:()=>profile,
    getMembership:()=>vip, getLanguage:()=>lang,
    navigate:go, toast:showToast, showLogin:showAccount
  });

  function boot(){
    translateStatic();paintProgress();paintArchive();paintStats();go('home');
    // Delegate navigation: buttons also appear dynamically after completing a game.
    document.addEventListener('click', e=>{const b=e.target.closest('[data-view]');if(b)go(b.dataset.view);});
    $('#startCaseBtn').addEventListener('click',()=>launch('case'));
    $('#allGamesBtn').addEventListener('click',()=>go('games'));
    $('#backToGames').addEventListener('click',()=>go('games'));
    document.addEventListener('click',e=>{if(e.target.closest('[data-open-premium],#premiumBtn'))showPremium();});
    $('#closeModal').addEventListener('click',hidePremium);
    $('#premiumConfirm').addEventListener('click',hidePremium);
    $('#premiumModal').addEventListener('click',e=>{if(e.target.id==='premiumModal')hidePremium();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')hidePremium();});
    document.addEventListener('click',e=>{const b=e.target.closest('[data-launch]');if(b)launch(b.dataset.launch);});
    $('#shareBtn').addEventListener('click',shareResult);
    setupAccountUI();
    initCloud();
    $('#languageBtn').addEventListener('click',()=>{
      lang=lang==='ar'?'en':'ar';saved.lang=lang;persist();translateStatic();paintProgress();paintArchive();paintStats();
      if(currentView==='play'&&currentGame)launch(currentGame);
    });
    // PWA registration handled by the V3 enhancement layer.
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();

  