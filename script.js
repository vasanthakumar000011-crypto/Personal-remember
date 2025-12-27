// Put the entire app initialization inside DOMContentLoaded to avoid timing issues
document.addEventListener('DOMContentLoaded', () => {

  /* ----------- Helpers & persistence ----------- */
  const STORAGE_KEY = 'reminder_chat_tasks_vfinal';
  function saveTasks(ts){ localStorage.setItem(STORAGE_KEY, JSON.stringify(ts)); }
  function loadTasks(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e){ return []; } }
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

  function makeDateLocal(dateStr, timeStr){
    if(!dateStr) return null;
    const parts = dateStr.split('-').map(Number);
    let hh=0, mm=0;
    if(timeStr){
      const t = timeStr.split(':').map(Number);
      hh = t[0]||0; mm = t[1]||0;
    }
    return new Date(parts[0], parts[1]-1, parts[2], hh, mm, 0, 0);
  }

  /* ----------- App state ----------- */
  let tasks = loadTasks();
  let ringing = false;
  let ringingTasks = [];
  let selectedAudio = 'classic';

  /* ----------- DOM helpers ----------- */
  const el = id => document.getElementById(id);
  const taskListEl = el('taskList'), calendarView = el('calendarView'), progressBar = el('progressBar');

  /* ----------- Audio map (init after DOM ready) ----------- */
  const audioMap = {
    classic: el('audio_classic'),
    beep: el('audio_beep'),
    chime: el('audio_chime')
  };

  /* ----------- Safe play utility ----------- */
  function pauseAllAudio(){
    Object.values(audioMap).forEach(a => {
      try { a.pause(); a.currentTime = 0; } catch(e) {}
    });
  }
  function playAudioKey(key){
    pauseAllAudio();
    const a = audioMap[key];
    if(!a) return;
    a.loop = true;
    a.volume = 0.95;
    const p = a.play();
    if(p && p.catch){
      p.catch(err => {
        console.warn('Audio play blocked:', err);
        // Browser blocked autoplay; user must interact (Enable Sound)
      });
    }
  }

  /* ----------- UI events ----------- */
  if(el('newQuoteBtn')) el('newQuoteBtn').addEventListener('click', newQuote);
  if(el('addBtn')) el('addBtn').addEventListener('click', addTaskFromForm);
  if(el('filterCategory')) el('filterCategory').addEventListener('change', render);
  if(el('sortSel')) el('sortSel').addEventListener('change', render);
  if(el('clearAll')) el('clearAll').addEventListener('click', ()=>{ if(confirm('Clear ALL reminders?')){ tasks=[]; saveTasks(tasks); render(); }});
  if(el('previewToneBtn')) el('previewToneBtn').addEventListener('click', previewTone);
  if(el('toneSelect')) el('toneSelect').addEventListener('change', e=>{ selectedAudio=e.target.value; });
  if(el('enableSoundBtn')) el('enableSoundBtn').addEventListener('click', enableSoundGesture);
  if(el('sendChat')) el('sendChat').addEventListener('click', ()=> handleChatInput());
  if(el('chatInput')) el('chatInput').addEventListener('keydown', e=>{ if(e.key==='Enter') handleChatInput(); });
  if(el('stopBtn')) el('stopBtn').addEventListener('click', stopAlarm);
  if(el('snooze5')) el('snooze5').addEventListener('click', ()=> snoozeActive(5));
  if(el('snooze10')) el('snooze10').addEventListener('click', ()=> snoozeActive(10));

  /* ----------- Init ----------- */
  newQuote();
  render();
  setTimeout(()=>checkReminders(), 700); // initial
  setInterval(checkReminders, 1000);

  /* ----------- Quotes ----------- */
  function newQuote(){
    const arr = ["Believe in yourself.","Small steps every day.","Progress > Perfection.","Focus on today.","Consistency wins."];
    if(el('quote')) el('quote').innerText = arr[Math.floor(Math.random()*arr.length)];
  }

  /* ----------- Add task form ----------- */
  function addTaskFromForm(){
    const nameEl = el('taskName');
    const categoryEl = el('categoryInput');
    const dateEl = el('dateInput');
    const timeEl = el('timeInput');
    if(!nameEl) return alert('UI not ready');
    const name = nameEl.value.trim();
    const category = (categoryEl && categoryEl.value) || 'Work';
    const date = (dateEl && dateEl.value) || '';
    const time = (timeEl && timeEl.value) || '';
    if(!name){ alert('Please enter a task name.'); return; }
    if(!date || !time){
      if(category!=='Note' && !confirm('No date/time set — save as note without alarm?')) return;
    }
    const t = { id: uid(), name, category, date: date||'', time: time||'', done:false, reminded:false };
    tasks.push(t);
    saveTasks(tasks); render();
    nameEl.value=''; if(dateEl) dateEl.value=''; if(timeEl) timeEl.value='';
  }

  /* ----------- Render tasks & calendar & progress ----------- */
  function render(){
    const filterCat = (el('filterCategory') && el('filterCategory').value) || 'All';
    const sortMode = (el('sortSel') && el('sortSel').value) || 'date';
    let view = tasks.slice();
    if(filterCat !== 'All') view = view.filter(t=>t.category===filterCat);
    if(sortMode==='date'){
      view.sort((a,b)=>{
        if(!a.date && !b.date) return a.name.localeCompare(b.name);
        if(!a.date) return 1;
        if(!b.date) return -1;
        const da = makeDateLocal(a.date,a.time||'00:00');
        const db = makeDateLocal(b.date,b.time||'00:00');
        return da - db;
      });
    } else view.sort((a,b)=>a.name.localeCompare(b.name));

    if(taskListEl) taskListEl.innerHTML='';
    view.forEach(t=>{
      const item = document.createElement('div'); item.className='task-item';
      const badge = document.createElement('span'); badge.className='badge ' + (t.category||'').toLowerCase(); badge.innerText = t.category;
      const meta = document.createElement('div'); meta.className='meta';
      const title = document.createElement('div'); title.className='title'; title.innerText = t.name;
      if(t.done){ title.style.textDecoration='line-through'; title.style.opacity=0.6; }
      const sub = document.createElement('div'); sub.className='muted'; sub.innerText = (t.date?`${t.date} ${t.time}`:'No date') + (t.reminded ? ' • reminded' : '');
      meta.appendChild(title); meta.appendChild(sub);

      const actions = document.createElement('div'); actions.className='controls-row';
      const doneBtn = document.createElement('button'); doneBtn.className='small-btn'; doneBtn.innerText = t.done? 'Undo':'Done'; doneBtn.onclick = ()=>{ t.done = !t.done; saveTasks(tasks); render(); };
      const editBtn = document.createElement('button'); editBtn.className='small-btn'; editBtn.innerText='Edit'; editBtn.onclick = ()=> editTask(t.id);
      const delBtn = document.createElement('button'); delBtn.className='small-btn danger'; delBtn.innerText='Delete'; delBtn.onclick = ()=>{ if(confirm('Delete?')){ tasks = tasks.filter(x=>x.id!==t.id); saveTasks(tasks); render(); } };

      actions.appendChild(doneBtn); actions.appendChild(editBtn); actions.appendChild(delBtn);

      item.appendChild(badge); item.appendChild(meta); item.appendChild(actions);
      if(taskListEl) taskListEl.appendChild(item);
    });

    // calendar grouped
    const grouped = {};
    tasks.forEach(t => { const key = t.date || 'No date'; if(!grouped[key]) grouped[key]=[]; grouped[key].push(t); });
    if(calendarView) calendarView.innerHTML='';
    Object.keys(grouped).sort().forEach(k=>{ const p=document.createElement('div'); p.style.marginBottom='8px'; const head=document.createElement('div'); head.style.fontWeight='600'; head.innerText=k; const names=document.createElement('div'); names.className='muted'; names.innerText = grouped[k].map(x=> x.name + (x.time ? ' @'+x.time : '')).join(', '); p.appendChild(head); p.appendChild(names); if(calendarView) calendarView.appendChild(p); });

    // progress
    const total = tasks.length, done = tasks.filter(x=>x.done).length;
    const pct = total? Math.round(done/total*100) : 0;
    if(progressBar){ progressBar.style.width = pct + '%'; progressBar.innerText = pct + '%'; }
  }

  /* ----------- Edit flow ----------- */
  function editTask(id){
    const t = tasks.find(x=>x.id===id); if(!t) return;
    const nm = prompt('Task name', t.name); if(nm===null) return;
    const cat = prompt('Category (Work/Study/Personal/Note)', t.category) || t.category;
    const date = prompt('Date YYYY-MM-DD or blank', t.date || '') || '';
    const time = prompt('Time HH:MM (24h) or blank', t.time || '') || '';
    t.name = nm; t.category = cat; t.date = date; t.time = time; saveTasks(tasks); render();
  }

  /* ----------- Alarm check & control ----------- */
  function checkReminders(){
    if(ringing) return;
    const now = new Date();
    const due = tasks.filter(t=>{
      if(t.done) return false;
      if(t.reminded) return false;
      if(!t.date) return false;
      const dt = makeDateLocal(t.date, t.time || '00:00');
      return dt && dt <= now;
    });
    if(due.length>0) startAlarm(due);
  }

  function startAlarm(dueList){
    ringing = true;
    ringingTasks = dueList.slice();
    // show modal content
    if(el('ringList')) el('ringList').innerHTML = '';
    ringingTasks.forEach(t => { const d = document.createElement('div'); d.innerText = `${t.name} — ${t.date} ${t.time}`; if(el('ringList')) el('ringList').appendChild(d); });
    if(el('ringOverlay')) el('ringOverlay').style.display = 'flex';
    // play audio
    playAudioKey(selectedAudio);
  }

  function stopAlarm(){
    pauseAllAudio();
    // mark ringing tasks as reminded so they won't immediately retrigger
    ringingTasks.forEach(t => { const found = tasks.find(x=>x.id===t.id); if(found) found.reminded = true; });
    saveTasks(tasks); ringingTasks=[]; ringing=false; if(el('ringOverlay')) el('ringOverlay').style.display='none'; render();
  }

  function snoozeActive(minutes){
    if(!ringingTasks.length) return;
    const now = new Date();
    ringingTasks.forEach(t => {
      const dt = new Date(now.getTime() + minutes*60000);
      const found = tasks.find(x=>x.id===t.id);
      if(found){
        found.date = dt.toISOString().slice(0,10);
        found.time = ('0'+dt.getHours()).slice(-2) + ':' + ('0'+dt.getMinutes()).slice(-2);
        found.reminded = false;
      }
    });
    saveTasks(tasks);
    pauseAllAudio();
    ringingTasks=[]; ringing=false; if(el('ringOverlay')) el('ringOverlay').style.display='none'; render();
  }

  /* ----------- Sound helpers ----------- */
  function previewTone(){
    const a = audioMap[selectedAudio];
    if(!a) return;
    a.loop = false; a.currentTime = 0;
    const p = a.play();
    if(p && p.catch) p.catch(()=> alert('Browser blocked autoplay — press "Enable Sound" first'));
  }

  function enableSoundGesture(){
    // try to play & pause to unlock autoplay policy
    let unlocked = false;
    Object.values(audioMap).forEach(a=>{
      try{
        a.volume = 0.01;
        const p = a.play();
        if(p && p.then){
          p.then(()=>{ a.pause(); a.currentTime=0; unlocked = true; }).catch(()=>{});
        }
      }catch(e){}
    });
    setTimeout(()=> {
      if(unlocked) alert('Sound should now be available for alarms.');
      else alert('If your browser still blocks audio, click "Preview Tone" or interact with the page.');
    }, 400);
  }

  /* ----------- Chat parser & UI ----------- */
  function appendChat(who,msg){
    const box = el('chatBox');
    if(!box) return;
    const b = document.createElement('div'); b.className='chat-bubble ' + (who==='user' ? 'bubble-user' : 'bubble-bot'); b.innerText = msg;
    if(who==='user'){ b.style.background='#dbeafe'; b.style.alignSelf='flex-end'; } else b.style.background='#f1f5f9';
    box.appendChild(b); box.scrollTop = box.scrollHeight;
  }

  function handleChatInput(){
    const input = el('chatInput'); if(!input) return;
    const raw = input.value.trim(); if(!raw) return;
    appendChat('user', raw); input.value='';
    setTimeout(()=> parseChat(raw), 300);
  }

  function parseChat(text){
    const t = text.trim();
    if(/^\s*help\s*$/i.test(t)){ appendChat('bot', "Examples:\n- remind me to pay rent on 2025-09-10 at 09:00\n- remind me to call mom in 10 minutes\n- remind me to study at 20:00\n- remember that I met John"); return; }
    if(/^\s*(list|show)\s+reminders/i.test(t)){
      if(tasks.length===0) return appendChat('bot','No reminders set.');
      const lines = tasks.map(x=> `${x.name} • ${x.date||'No date'} ${x.time||''} • ${x.category}${x.done? ' • done':''}` );
      return appendChat('bot', 'Your reminders:\n' + lines.join('\n'));
    }
    if(/^\s*remember that\s+(.+)/i.test(t)){
      const m = t.match(/^\s*remember that\s+(.+)/i)[1].trim();
      const note = { id: uid(), name: m, category:'Note', date:'', time:'', done:false, reminded:false };
      tasks.push(note); saveTasks(tasks); render(); return appendChat('bot','Saved note: ' + m);
    }
    // in N minutes/hours
    let m;
    if(m = t.match(/\bin\s+(\d+)\s*(minute|minutes|hour|hours)\b/i)){
      const num = parseInt(m[1],10);
      const unit = m[2].toLowerCase();
      const now = new Date();
      const ms = unit.startsWith('hour') ? num*3600000 : num*60000;
      const dt = new Date(now.getTime() + ms);
      const nameMatch = t.match(/remind me to (.+?) in \d+/i);
      const name = nameMatch ? nameMatch[1].trim() : t;
      const item = { id: uid(), name, category: 'Work', date: dt.toISOString().slice(0,10), time: ('0'+dt.getHours()).slice(-2)+':'+('0'+dt.getMinutes()).slice(-2), done:false, reminded:false };
      tasks.push(item); saveTasks(tasks); render(); return appendChat('bot', `Okay — will remind you to "${name}" in ${m[1]} ${unit}.`);
    }
    // remind me to X on YYYY-MM-DD at HH:MM
    if(m = t.match(/remind me to (.+?) on (\d{4}-\d{2}-\d{2}) (?:at )?(\d{1,2}:\d{2})(?:\s*(am|pm))?/i)){
      let name = m[1].trim(); let date = m[2]; let time = m[3]; const ampm = m[4];
      if(ampm){
        let [hh,mm] = time.split(':').map(Number);
        if(ampm.toLowerCase()==='pm' && hh<12) hh+=12;
        if(ampm.toLowerCase()==='am' && hh===12) hh=0;
        time = ('0'+hh).slice(-2)+':'+('0'+mm).slice(-2);
      }
      const item = { id: uid(), name, category:'Work', date, time, done:false, reminded:false };
      tasks.push(item); saveTasks(tasks); render(); return appendChat('bot', `Set: "${name}" on ${date} at ${time}`);
    }
    // remind me to X at HH:MM (assume today)
    if(m = t.match(/remind me to (.+?) (?:at )?(\d{1,2}:\d{2})(?:\s*(am|pm))?/i)){
      let name = m[1].trim(); let time = m[2]; const ampm = m[3];
      if(ampm){
        let [hh,mm] = time.split(':').map(Number);
        if(ampm.toLowerCase()==='pm' && hh<12) hh+=12;
        if(ampm.toLowerCase()==='am' && hh===12) hh=0;
        time = ('0'+hh).slice(-2)+':'+('0'+mm).slice(-2);
      } else {
        const parts=time.split(':'); time = ('0'+parts[0]).slice(-2)+':'+(parts[1]||'00');
      }
      const now = new Date(); const date = now.toISOString().slice(0,10);
      const item = { id: uid(), name, category:'Work', date, time, done:false, reminded:false };
      tasks.push(item); saveTasks(tasks); render(); return appendChat('bot', `Reminder set for today ${time}: "${name}"`);
    }
    // quick keywords
    if(/hello|hi|hey/i.test(t)) return appendChat('bot','Hello! I can set reminders from natural sentences. Type "help" for samples.');
    if(/quote/i.test(t)) { newQuote(); return appendChat('bot','Here is one: ' + el('quote').innerText); }
    // fallback
    appendChat('bot',"I couldn't parse that. Try: 'remind me to call mom in 10 minutes' or 'remind me to pay rent on 2025-09-10 at 09:00'.");
  }

  /* ----------- End of DOMContentLoaded ----------- */
});
