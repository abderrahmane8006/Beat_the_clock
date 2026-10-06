'use strict';
/* BEAT THE CLOCK — all times are "minutes since midnight" (9:00 AM = 540).
   TO CUSTOMISE: edit GAME_SECONDS, EVENTS (trigger time + effect) and TASKS (dur, c:{minS,maxE}, fixed). */
const GAME_SECONDS = 240;          // game length (4 min)
const DAY0 = 420, DAY1 = 1380;     // 7:00 AM -> 11:00 PM
const SH = 22;                     // px per 15-min slot (must match style.css)
const TASKS = [
  {id:'prep',icon:'🚿',title:'Personal Preparation',dur:60,imp:'neutral',desc:'Breakfast, shower, clothes and preparation.'},
  {id:'toUni',icon:'🚌',title:'Transport to University',dur:30,imp:'important',desc:'Must happen before university.',c:{maxE:540},msg:'Transport must finish before classes start (9:00 AM).'},
  {id:'uni',icon:'🎓',title:'University Classes',dur:180,imp:'neutral',desc:'Cannot be moved.',fixed:540},
  {id:'lunch',icon:'🥗',title:'Lunch',dur:45,imp:'neutral',desc:'Mandatory.'},
  {id:'study',icon:'📚',title:'Study for Exam',dur:120,imp:'urgent',desc:'Exam tomorrow morning. Very high importance. Needs concentration. Max 2 sessions.',split:true,focus:true},
  {id:'assign',icon:'📝',title:'Finish Assignment',dur:90,imp:'urgent',desc:'Deadline 10:00 PM. Very important.',c:{maxE:1320},focus:true,msg:'❌ DEADLINE MISSED: The assignment must be completed before 10:00 PM.'},
  {id:'pres',icon:'💻',title:'Prepare Presentation',dur:90,imp:'important',desc:'Deadline: tomorrow morning. Needs concentration.',focus:true},
  {id:'meet',icon:'👥',title:'Group Project Meeting',dur:60,imp:'planned',desc:'',c:{minS:840,maxE:1140},msg:'The meeting cannot happen at this time.'},
  {id:'admin',icon:'📄',title:'Administrative Document',dur:30,imp:'urgent',desc:'Deadline 6:00 PM.',c:{maxE:1080},msg:'Administrative document deadline missed.'},
  {id:'ex',icon:'🏃',title:'Exercise',dur:45,imp:'planned',desc:'Mandatory.'},
  {id:'call',icon:'📞',title:'Important Phone Call',dur:30,imp:'important',desc:'',c:{minS:1020,maxE:1200},msg:'The important phone call must happen between 5:00 PM and 8:00 PM.'},
  {id:'dinner',icon:'🍽️',title:'Family Dinner',dur:60,imp:'neutral',desc:'Cannot be moved.',fixed:1200},
  {id:'home',icon:'🚌',title:'Transport Home',dur:30,imp:'neutral',desc:'Must happen after university.',c:{minS:720},msg:'Transport home must happen after university (12:00 PM).'}
];
const IMP = {urgent:['🔴 URGENT','u'],important:['🟠 IMPORTANT','i'],planned:['🔵 PLANNED','p'],neutral:['⚪ ROUTINE','n']};
/* Unexpected events: `at` = seconds after start, `apply` changes the game state. */
const EVENTS = {
  e1:{at:90,title:'🚨 URGENT UPDATE',lines:['Your professor has just sent you a message.',"Tomorrow's exam will include an additional chapter."],big:'+30 MINUTES OF STUDY',btn:'UPDATE MY SCHEDULE',apply(){pcs('study')[0].dur+=30;}},
  e2:{at:150,title:'🚨 SCHEDULE CHANGE',lines:['Your group members have changed their availability.','The group meeting must now take place from:'],big:'4:30 PM – 5:30 PM',btn:'ADAPT MY SCHEDULE',apply(){S.c.meet={minS:990,maxE:1050};}},
  e3:{at:195,title:'🚌 TRANSPORT DELAY',lines:['Your bus is delayed.','Transport home now takes:'],big:'45 MINUTES (instead of 30)',btn:'REORGANIZE MY DAY',apply(){pcs('home')[0].dur=45;}}
};

const $ = id => document.getElementById(id);
const T = id => TASKS.find(t => t.id === id);
let S, team = 'Team', e3on = false, snd = true, modalOpen = false, D = null, AC, last = Date.now();
let selectedPid = null;
const coarsePointer = () => window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 800;

/* ---------- state ---------- */
function newState(){
  S = {pieces:TASKS.map(t => ({id:t.id,task:t.id,dur:t.dur})), place:{}, c:{}, left:GAME_SECONDS,
       ev:{e1:'pending',e2:'pending',e3:'pending'}, running:false, started:false, over:false, saved:false};
  TASKS.forEach(t => { S.c[t.id] = {...(t.c||{})}; if(t.fixed != null) S.place[t.id] = t.fixed; });
}
const pcs = id => S.pieces.filter(p => p.task === id);
const st = p => S.place[p.id];
const isFixed = p => T(p.task).fixed != null;
const fmt = m => { const h = Math.floor(m/60), mm = String(m%60).padStart(2,'0'); return `${(h+11)%12+1}:${mm} ${h<12||h===24?'AM':'PM'}`; };
const dur = m => `${m>=60?Math.floor(m/60)+'h ':''}${m%60?m%60+'min':''}`.trim();
const hhmm = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

/* ---------- validation ---------- */
/* returns an error message if a placed piece breaks its time window, else null */
function viol(p){
  const s = st(p); if(s == null) return null;
  const c = S.c[p.task];
  return (c.minS != null && s < c.minS) || (c.maxE != null && s + p.dur > c.maxE) ? (T(p.task).msg || 'Constraint broken.') : null;
}
function conflicts(){
  const pl = S.pieces.filter(p => st(p) != null), r = [];
  for(let i=0;i<pl.length;i++) for(let j=i+1;j<pl.length;j++){
    const a=pl[i], b=pl[j];
    if(st(a) < st(b)+b.dur && st(b) < st(a)+a.dur) r.push([a,b]);
  }
  return r;
}
function sp(id){ // span of a task (all its pieces)
  const ps = pcs(id), pl = ps.filter(p => st(p) != null);
  return {all:pl.length===ps.length, s:Math.min(...pl.map(st)), e:Math.max(...pl.map(p => st(p)+p.dur))};
}

/* ---------- scoring (4 x 25) ---------- */
function score(){
  const M = [], cf = conflicts(), ratio = TASKS.filter(t => sp(t.id).all).length / TASKS.length;
  const bad = id => pcs(id).some(viol), inCf = id => cf.some(c => c.some(p => p.task === id));
  // DEADLINES
  const dl = [
    ['Transport to university before class',sp('toUni').all && !bad('toUni')],
    ['Assignment before 10:00 PM',sp('assign').all && !bad('assign')],
    ['Administrative document before 6:00 PM',sp('admin').all && !bad('admin')],
    ['Phone call between 5:00 and 8:00 PM',sp('call').all && !bad('call')],
    ['Group meeting inside its allowed time',sp('meet').all && !bad('meet')],
    ['Transport home after university',sp('home').all && !bad('home')],
    ['Exam study fully scheduled',sp('study').all],
    ['Presentation scheduled',sp('pres').all],
    ['Preparation before transport',sp('prep').all && sp('toUni').all && sp('prep').e <= sp('toUni').s]
  ];
  dl.filter(x => !x[1]).forEach(x => M.push('Deadline/constraint problem: ' + x[0] + '.'));
  const d = Math.round(25 * dl.filter(x => x[1]).length / dl.length);
  // PRIORITIZATION
  const sd = sp('study'), pr = sp('pres');
  const p2 = sd.all && sd.e <= 1200, p3 = sd.all && pr.all && sd.s < pr.s;
  if(ratio < 1) M.push('Not every task was scheduled. All tasks are mandatory.');
  if(!p2) M.push('Exam preparation scheduled too late (or not at all).');
  if(!p3) M.push('The most urgent and important task (exam study) should come before lower-priority work.');
  const p = Math.round(10*ratio + (p2?8:0) + (p3?7:0));
  // PLANNING
  const a = sp('assign'), l = sp('lunch');
  const foc = S.pieces.filter(x => T(x.task).focus && st(x) != null).sort((x,y) => st(x)-st(y));
  let run = 1, chain = false;
  for(let i=1;i<foc.length;i++){ run = st(foc[i]) - (st(foc[i-1])+foc[i-1].dur) < 15 ? run+1 : 1; if(run >= 3) chain = true; }
  const a2 = a.all && a.e <= 1305, l2 = l.all && l.s >= 690 && l.s <= 870;
  if(cf.length) M.push(`${cf.length} time conflict(s) left in the schedule.`);
  if(!a2) M.push('Assignment completed too close to the deadline (no buffer time).');
  if(chain) M.push('Too many concentration tasks placed consecutively.');
  if(!l2) M.push('Lunch placed at an unrealistic time.');
  const pl = Math.round((Math.max(0,10-4*cf.length) + (a2?5:0) + (chain?0:5) + (l2?5:0)) * ratio);
  // ADAPTABILITY (only events that actually happened)
  const ev = [];
  if(S.ev.e1==='done') ev.push(['Exam chapter update', sd.all && !inCf('study')]);
  if(S.ev.e2==='done') ev.push(['New meeting time', sp('meet').all && !bad('meet')]);
  if(S.ev.e3==='done') ev.push(['Transport delay', sp('home').all && !bad('home') && !inCf('home')]);
  ev.filter(x => !x[1]).forEach(x => M.push('Unexpected event was not handled correctly: ' + x[0] + '.'));
  const ad = Math.round(25 * (ev.length ? ev.filter(x => x[1]).length/ev.length : 1) * ratio);
  return {d,p,pl,ad,total:d+p+pl+ad,M};
}

/* ---------- rendering ---------- */
function ctext(t){
  if(t.fixed != null) return `🔒 Fixed: ${fmt(t.fixed)} – ${fmt(t.fixed+t.dur)} (cannot be moved)`;
  const c = S.c[t.id], a = [];
  if(c.minS != null) a.push('start after ' + fmt(c.minS));
  if(c.maxE != null) a.push('finish before ' + fmt(c.maxE));
  return a.length ? '📌 ' + a.join(', ') : '📌 Flexible';
}
function cardHTML(p){
  const t = T(p.task), [lab,k] = IMP[t.imp], n = pcs(t.id), i = n.indexOf(p)+1;
  const split = t.split ? `<button class="splitb" data-split>${n.length>1?'🔗 Merge sessions':'✂ Split in 2 sessions'}</button>` : '';
  return `<div class="card ${k}" data-pid="${p.id}"><div class="ic">${t.icon}</div><div class="cb"><b>${t.title}${n.length>1?` (session ${i}/2)`:''}</b>
  <div class="meta"><span>⏱ ${dur(p.dur)}</span><span class="tag">${lab}</span></div><small>${ctext(t)}</small>${t.desc?`<small>${t.desc}</small>`:''}${split}</div></div>`;
}
function blockHTML(p){
  const t = T(p.task), s = st(p), k = IMP[t.imp][1], fx = isFixed(p), bad = viol(p) || conflicts().some(c => c.includes(p));
  const cls = fx ? 'fixed' : bad ? 'bad' : 'ok';
  const split = t.split && pcs('study').length===1 ? '<button class="splitb" data-split>✂</button>' : '';
  return `<div class="blk ${cls} ${k}" data-pid="${p.id}" style="top:${(s-DAY0)/15*SH}px;height:${p.dur/15*SH}px">
  <span>${fx?'🔒':bad?'⚠️':'✅'}${t.icon}</span><span>${t.title} <small>${fmt(s)}–${fmt(s+p.dur)} (${dur(p.dur)})</small></span>${split}</div>`;
}
function render(){
  const un = S.pieces.filter(p => st(p) == null);
  $('tray').innerHTML = un.length ? un.map(cardHTML).join('') : '<div class="done">✅ All tasks scheduled!<br>Check warnings above and fix any problem.</div>';
  $('left').textContent = `(${un.length} left to place)`;
  $('blocks').innerHTML = S.pieces.filter(p => st(p) != null).map(blockHTML).join('');
  document.querySelectorAll('#game [data-pid]').forEach(el => el.classList.toggle('selected-card', el.dataset.pid === selectedPid));
  const w = new Set();
  if(conflicts().length) w.add('⚠️ TIME CONFLICT: Two tasks cannot happen at the same time.');
  S.pieces.forEach(p => { const v = viol(p); if(v) w.add(v.startsWith('❌') ? v : '⚠️ ' + v); });
  $('warn').innerHTML = [...w].map(x => `<div>${x}</div>`).join('');
  $('tname').textContent = team;
  renderTimer();
}
function renderTimer(){
  const s = Math.ceil(S.left);
  $('time').textContent = S.over ? 'TIME IS UP!' : `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  $('pfill').style.width = (S.left/GAME_SECONDS*100) + '%';
  $('timer').classList.toggle('urgent', S.running && !S.over && S.left <= 30);
  $('hurry').textContent = S.started && !S.running && !S.over ? '⏸ PAUSED' : 'HURRY UP!';
  if(S.started && !S.running && !S.over) $('hurry').style.display = 'block'; else $('hurry').style.removeProperty('display');
  $('back').hidden = !S.over;
}

/* ---------- screens ---------- */
function show(id){ document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id)); window.scrollTo(0,0); }
function startGame(){
  cancelDrag(); closeModal(); selectedPid = null; newState();
  team = $('team').value.trim() || 'Team';
  S.running = S.started = true; show('game'); render(); beep(520,.12); setTimeout(() => beep(780,.18), 150);
}

/* ---------- timer loop ---------- */
setInterval(() => {
  const now = Date.now(), dt = (now-last)/1000; last = now;
  if(!S || !S.running || S.over || modalOpen) return;
  S.left = Math.max(0, S.left - dt);
  const el = GAME_SECONDS - S.left;
  if(el >= EVENTS.e1.at && S.ev.e1==='pending') showEvent('e1');
  else if(el >= EVENTS.e2.at && S.ev.e2==='pending' && S.ev.e1!=='pending') showEvent('e2');
  else if(e3on && el >= EVENTS.e3.at && S.ev.e3==='pending' && S.ev.e2!=='pending') showEvent('e3');
  if(S.left <= 30 && !S.warned){ S.warned = true; beep(440,.15,.04,3); }
  if(S.left <= 0) finish(); else renderTimer();
}, 250);

/* ---------- unexpected events (each fires once) ---------- */
function openModal(html){ cancelDrag(); modalOpen = true; document.querySelector('.mbox').innerHTML = html; $('modal').hidden = false; }
function closeModal(){ modalOpen = false; $('modal').hidden = true; $('bell').hidden = true; }
function showEvent(k){
  if(!S.started || S.over || S.ev[k] !== 'pending') return;
  const E = EVENTS[k]; S.ev[k] = 'done'; E.apply();
  let extra = '';
  if(k==='e2' && pcs('meet').some(viol)) extra = '<p style="color:#dc2626"><b>Your meeting is now outside the new time. Move it!</b></p>';
  $('bell').hidden = false; beep(880,.1,.05,2);
  openModal(`<div class="notif"><span>🔔 NEW URGENT MESSAGE</span><span>now</span></div><h2>${E.title}</h2>${E.lines.map(l=>`<p>${l}</p>`).join('')}<div class="big">${E.big}</div>${extra}<button class="btn" id="mok">${E.btn}</button>`);
  $('mok').onclick = () => { closeModal(); render(); };
  render();
}
function finish(){
  if(S.over) return;
  S.over = true; S.running = false; S.left = Math.max(0,S.left); beep(300,.5,.05); render();
  openModal(`<h2>⏰ TIME IS UP!</h2><p>Let's see how you did.</p><button class="btn" id="mok">SEE MY RESULTS</button>`);
  $('mok').onclick = () => { closeModal(); showResults(); };
}

/* ---------- results + GLOBAL leaderboard (Vercel API + Supabase) ---------- */
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
async function saveGlobalScore(r){
  try{
    const res = await fetch('/api/scores', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({player_name:team, score:r.total, deadlines:r.d, prioritization:r.p, planning:r.pl, adaptability:r.ad})
    });
    if(!res.ok) throw new Error((await res.json().catch(()=>({}))).error || 'Could not save score');
    return true;
  }catch(err){
    console.warn('Global score save failed:', err);
    return false;
  }
}
async function loadLeaderboard(){
  const status = $('lbStatus');
  status.className = 'lb-status'; status.textContent = 'Loading global results…';
  try{
    const res = await fetch('/api/scores', {cache:'no-store'});
    if(!res.ok) throw new Error((await res.json().catch(()=>({}))).error || 'Leaderboard unavailable');
    const rows = await res.json();
    if(!rows.length){ $('lb').innerHTML=''; status.className='lb-status'; status.textContent='No scores yet. Be the first player!'; return; }
    let mine = false;
    $('lb').innerHTML = rows.map(x => {
      const me = !mine && x.player_name === team && Number(x.score) === Number($('rscore').textContent); if(me) mine = true;
      const date = x.created_at ? new Date(x.created_at).toLocaleString([], {dateStyle:'medium', timeStyle:'short'}) : '';
      return `<li class="${me?'me':''}"><span>${esc(x.player_name)}</span><span class="score">${Number(x.score)}/100</span><small class="lb-date">${esc(date)}</small></li>`;
    }).join('');
    status.className='lb-status ok'; status.textContent = `${rows.length} result${rows.length>1?'s':''} • ranked by highest score`;
  }catch(err){
    $('lb').innerHTML=''; status.className='lb-status error';
    status.textContent=`Leaderboard error: ${err.message}`;
    console.warn(err);
  }
}
async function showResults(){
  const r = score(); show('results');
  $('rteam').textContent = `${team}: Score ${r.total}/100`;
  $('rscore').textContent = r.total;
  $('rb').innerHTML = [['Deadlines',r.d],['Prioritization',r.p],['Planning',r.pl],['Adaptability',r.ad]].map(x => `<tr><td>${x[0]}</td><td>${x[1]}/25</td></tr>`).join('');
  $('rfeed').textContent = r.total>=85 ? 'Excellent! You managed your time effectively and adapted well to unexpected events.'
    : r.total>=70 ? 'Good job! Your schedule was effective, but some improvements are possible.'
    : r.total>=50 ? 'Not bad! Try to improve prioritization and deadline management.'
    : 'Time management challenge! Review your priorities and leave more flexibility in your schedule.';
  $('rmist').innerHTML = (r.M.length ? r.M : ['No major mistakes. Great planning!']).map(m => `<li>${m}</li>`).join('');
  $('ringfg').style.strokeDashoffset = 439.8;
  setTimeout(() => $('ringfg').style.strokeDashoffset = 439.8*(1-r.total/100), 100);
  if(!S.saved){
    S.saved = true;
    const saved = await saveGlobalScore(r);
    if(!saved){ $('lbStatus').className='lb-status error'; $('lbStatus').textContent='Score calculated, but it could not be saved to the global database.'; }
  }
  await loadLeaderboard();
}

/* ---------- drag & drop (pointer events: mouse + touch) ---------- */
function cancelDrag(){ if(D){ D.g.remove(); D.el.classList.remove('lift'); $('preview').hidden = true; $('trayPanel').classList.remove('hot'); D = null; } }
document.addEventListener('pointerdown', e => {
  if(coarsePointer()) return; // phones/tablets use tap-to-place instead of long drag
  if(!S || !S.running || S.over || modalOpen || e.button > 0 || e.target.closest('button')) return;
  const el = e.target.closest('#game [data-pid]'); if(!el) return;
  const p = S.pieces.find(x => x.id === el.dataset.pid); if(!p || isFixed(p)) return;
  e.preventDefault();
  const w = document.createElement('div'); w.innerHTML = cardHTML(p);
  const g = w.firstChild; g.classList.add('ghost-card'); document.body.append(g);
  el.classList.add('lift'); D = {p,el,g}; mv(e);
});
function mv(e){
  if(!D) return;
  D.g.style.transform = `translate(${e.clientX-24}px,${e.clientY-16}px)`;
  const sc = $('sched'), r = sc.getBoundingClientRect(), tr = $('trayPanel').getBoundingClientRect();
  if(e.clientY < r.top+50) sc.scrollTop -= 14; else if(e.clientY > r.bottom-50) sc.scrollTop += 14;
  D.over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  D.tray = e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom;
  $('trayPanel').classList.toggle('hot', D.tray);
  const pv = $('preview'); pv.hidden = !D.over;
  if(D.over){
    const g = $('grid').getBoundingClientRect();
    let s = DAY0 + Math.round((e.clientY-16-g.top)/SH)*15;      // snap to 15 min
    s = Math.max(DAY0, Math.min(DAY1-D.p.dur, s)); D.s = s;
    const old = S.place[D.p.id]; S.place[D.p.id] = s;           // temp place to test validity
    const ok = !viol(D.p) && !conflicts().some(c => c.includes(D.p));
    if(old == null) delete S.place[D.p.id]; else S.place[D.p.id] = old;
    pv.className = ok ? '' : 'bad';
    pv.style.top = (s-DAY0)/15*SH + 'px'; pv.style.height = D.p.dur/15*SH + 'px';
  }
}
document.addEventListener('pointermove', mv);
document.addEventListener('pointerup', () => {
  if(!D) return;
  if(D.over) S.place[D.p.id] = D.s; else if(D.tray) delete S.place[D.p.id];  // tasks are never deleted, only unscheduled
  cancelDrag(); render(); beep(700,.05,.03);
});
document.addEventListener('pointercancel', cancelDrag);
document.addEventListener('click', e => {
  if(e.target.closest('[data-split]') && S && !S.over){ toggleSplit(); return; }
  if(!coarsePointer() || !S || !S.running || S.over || modalOpen) return;
  const pieceEl = e.target.closest('#game [data-pid]');
  if(pieceEl){
    const p = S.pieces.find(x => x.id === pieceEl.dataset.pid);
    if(!p || isFixed(p)) return;
    selectedPid = p.id;
    render();
    $('grid').classList.add('mobile-pick');
    $('mobileHelp').innerHTML = `📱 <b>${esc(T(p.task).title)} selected.</b> Now tap a time in the schedule.`;
    return;
  }
  const grid = e.target.closest('#grid');
  if(grid && selectedPid){
    const p = S.pieces.find(x => x.id === selectedPid); if(!p) return;
    const r = grid.getBoundingClientRect();
    let start = DAY0 + Math.round((e.clientY - r.top) / SH) * 15;
    start = Math.max(DAY0, Math.min(DAY1 - p.dur, start));
    S.place[p.id] = start;
    selectedPid = null;
    $('grid').classList.remove('mobile-pick');
    $('mobileHelp').innerHTML = '📱 <b>Mobile:</b> tap a task, then tap a time on the schedule. Tap a scheduled task to move it.';
    render(); beep(700,.05,.03);
  }
});
/* Exam study may be split into max 2 sessions */
function toggleSplit(){
  const ps = pcs('study');
  if(ps.length === 1){ const a = Math.ceil(ps[0].dur/30)*15, b = ps[0].dur-a; ps[0].dur = a; S.pieces.push({id:'study2',task:'study',dur:b}); }
  else { ps[0].dur += ps[1].dur; delete S.place[ps[1].id]; S.pieces = S.pieces.filter(p => p !== ps[1]); }
  render();
}

/* ---------- sound, fullscreen, buttons ---------- */
function beep(f=660,d=.15,v=.04,n=1){
  if(!snd) return;
  try{ AC = AC || new (window.AudioContext||window.webkitAudioContext)();
    for(let i=0;i<n;i++){ const o=AC.createOscillator(), g=AC.createGain(), t=AC.currentTime+i*(d+.08);
      o.frequency.value=f; g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(.0001,t+d);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t+d); } }catch(e){}
}
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
$('go').onclick = startGame;
$('again').onclick = () => show('home');
$('view').onclick = () => { show('game'); render(); };
$('back').onclick = showResults;
$('snd').onclick = () => { snd = !snd; $('snd').textContent = snd ? '🔊 SOUND' : '🔇 SOUND'; };
$('fs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {});
$('refreshLb').onclick = loadLeaderboard;

/* ---------- presenter mode (key P) ---------- */
const togglePres = () => $('pres').hidden = !$('pres').hidden;
$('ptoggle').onclick = togglePres;
document.addEventListener('keydown', e => { if((e.key==='p'||e.key==='P') && !/INPUT|TEXTAREA/.test(e.target.tagName)) togglePres(); });
$('e3on').onchange = e => e3on = e.target.checked;
const PRES = {
  start:startGame,
  pause(){ if(S.started && !S.over){ S.running = false; renderTimer(); } },
  resume(){ if(S.started && !S.over){ S.running = true; renderTimer(); } },
  e1:() => showEvent('e1'), e2:() => showEvent('e2'), e3:() => showEvent('e3'),
  skip(){ const k = ['e1','e2','e3'].find(x => S.ev[x]==='pending'); if(k) S.ev[k] = 'skipped'; },
  clearsched(){ if(!S.over){ S.place = {}; TASKS.forEach(t => { if(t.fixed != null) S.place[t.id] = t.fixed; }); render(); } },
  end(){ if(S.started) finish(); }
};
document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => PRES[b.dataset.p]());

newState();

/* Build the 15-minute timeline rows (07:00 -> 22:45, ends at 23:00) */
$('slots').innerHTML = Array.from({length:(DAY1-DAY0)/15}, (_,i) => { const m = DAY0+i*15; return `<div class="slot${m%60?'':' hr'}">${hhmm(m)}</div>`; }).join('');
