/* =====================================================================
   INGLÉS VOCABULARIO NK — App para aprender vocabulario de inglés
   - 20 palabras nuevas al día (configurable)
   - Repaso espaciado (algoritmo SM-2 simplificado)
   - Varios perfiles (cada miembro de la familia por su cuenta)
   - Progreso guardado en el navegador (localStorage) + exportar/importar
   Sin frameworks: HTML + CSS + JavaScript.
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- 1. DATOS ---------- */
  // Las palabras vienen de words.js (window.VOCAB). Si no existe, se intenta cargar words.json.
  let THEMES = [], WORDS = [], BY_ID = {};

  const KEY_PROFILES = 'inglesvocabularionk_profiles';
  const KEY_PROFILE = id => 'inglesvocabularionk_p_' + id;
  const MAX_REVIEWS_BEFORE_NO_NEW = 60;   // si hay más repasos pendientes, hoy no hay palabras nuevas
  const CHUNK = 5;                        // palabras nuevas por bloque (aprender 5 → practicar 5)
  const MASTERED_DAYS = 21;               // intervalo a partir del cual una palabra se considera "dominada"
  const AVATARS = ['🦊','🐼','🐯','🦁','🐸','🐙','🦄','🐧','🐨','🐵','🦉','🐢','🐳','🦖','🐝','🦋','🐶','🐱'];
  const LEVELS = ['Huevo 🥚','Pollito 🐣','Aprendiz 📘','Explorador 🧭','Aventurero 🎒','Detective 🕵️','Estrella ⭐','Campeón 🏆','Maestro 🎓','Leyenda 🐉','Superhéroe 🦸','Genio 🧠','Rey del vocab 👑'];

  /* ---------- 2. ALMACENAMIENTO SEGURO ---------- */
  // localStorage puede fallar (modo privado, iframes...). Si falla, guardamos en memoria.
  const mem = {};
  const storage = {
    get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : (mem[k] || null); } catch (e) { return mem[k] || null; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin persistencia */ } },
    del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* ---------- 3. UTILIDADES ---------- */
  const $ = sel => document.querySelector(sel);
  const app = () => document.getElementById('app');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  // Número de día local (para que el "día" cambie a medianoche en tu zona horaria)
  function today(d = new Date()) { return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
  const cleanEn = en => en.replace(/\s*\(.*?\)\s*/g, '').trim();
  function norm(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\(.*?\)/g, '').replace(/[’`]/g, "'").replace(/[^a-z0-9' ]/g, ' ')
      .replace(/^(to|a|an|the) /, '').replace(/\s+/g, ' ').trim();
  }
  function lev(a, b) { // distancia de Levenshtein (para aceptar una errata pequeña)
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function checkTyped(input, w) {
    const a = norm(input), targets = cleanEn(w.en).split('/').map(norm);
    if (!a) return 'ko';
    if (targets.includes(a)) return 'ok';
    // Acepta también otra palabra con la misma traducción
    if (WORDS.some(x => x.es === w.es && norm(cleanEn(x.en)) === a)) return 'ok';
    if (targets.some(t => t.length >= 5 && lev(a, t) <= 1)) return 'almost';
    return 'ko';
  }

  /* ---------- 4. AUDIO (pronunciación con la voz del navegador) ---------- */
  let voices = [];
  function loadVoices() { try { voices = speechSynthesis.getVoices(); } catch (e) {} }
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  const canSpeak = () => 'speechSynthesis' in window;
  function speak(text, slow) {
    if (!canSpeak()) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(cleanEn(text));
      const lang = (P && P.settings.accent) || 'en-GB';
      u.lang = lang;
      const v = voices.find(v => v.lang === lang) || voices.find(v => v.lang && v.lang.startsWith('en'));
      if (v) u.voice = v;
      u.rate = slow ? 0.6 : 0.9;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ---------- 5. EFECTOS DE SONIDO Y ANIMACIONES ---------- */
  let actx = null;
  function beep(type) {
    if (!P || !P.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = type === 'ok' ? [660, 880] : type === 'win' ? [523, 659, 784, 1046] : [220, 180];
      notes.forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type === 'ko' ? 'sawtooth' : 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, actx.currentTime + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.12, actx.currentTime + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + i * 0.09 + 0.18);
        o.connect(g).connect(actx.destination); o.start(actx.currentTime + i * 0.09); o.stop(actx.currentTime + i * 0.09 + 0.2);
      });
    } catch (e) {}
  }
  function popXP(n) {
    const d = document.createElement('div'); d.className = 'xp-pop'; d.textContent = '+' + n + ' XP';
    document.body.appendChild(d); setTimeout(() => d.remove(), 950);
  }
  function confetti() {
    const items = ['🎉', '⭐', '✨', '🎊', '💥', '🏆'];
    for (let i = 0; i < 28; i++) {
      const s = document.createElement('div'); s.className = 'confetti'; s.textContent = pick(items);
      s.style.left = Math.random() * 100 + 'vw'; s.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
      document.body.appendChild(s); setTimeout(() => s.remove(), 3400);
    }
  }

  /* ---------- 6. PERFILES ---------- */
  let P = null;      // perfil activo (datos)
  let PID = null;    // id del perfil activo
  function profiles() { return storage.get(KEY_PROFILES) || { list: [], current: null }; }
  function saveProfiles(p) { storage.set(KEY_PROFILES, p); }
  function newProfileData(name, avatar) {
    return {
      v: 1, name, avatar, created: Date.now(),
      cards: {},                       // estado de repaso de cada palabra: {r, i, e, d, l, ok, ko, s}
      xp: 0, streak: { count: 0, last: null }, history: {},
      best: { timed: 0 }, badges: [],
      settings: { perDay: 20, accent: 'en-GB', sound: true, focusUnit: 0 }
    };
  }
  function loadProfile(id) {
    const d = storage.get(KEY_PROFILE(id)); if (!d) return null;
    d.settings = Object.assign({ perDay: 20, accent: 'en-GB', sound: true, focusUnit: 0 }, d.settings || {});
    d.history = d.history || {}; d.best = d.best || { timed: 0 }; d.badges = d.badges || [];
    return d;
  }
  function save() { if (PID && P) storage.set(KEY_PROFILE(PID), P); }
  function selectProfile(id) { const ps = profiles(); ps.current = id; saveProfiles(ps); PID = id; P = loadProfile(id); }
  function dayLog() { const t = today(); return P.history[t] = P.history[t] || { rev: 0, neu: 0, ok: 0, ko: 0, xp: 0, done: false }; }

  /* ---------- 7. NIVELES, XP, RACHAS E INSIGNIAS ---------- */
  const xpFor = L => 50 * L * (L - 1);          // XP necesaria para llegar al nivel L (L1=0, L2=100, L3=300...)
  function levelInfo(xp) {
    let L = 1; while (xp >= xpFor(L + 1)) L++;
    const from = xpFor(L), to = xpFor(L + 1);
    return { L, name: LEVELS[Math.min(L - 1, LEVELS.length - 1)], pct: Math.round((xp - from) / (to - from) * 100), toNext: to - xp };
  }
  function addXP(n, show = true) {
    const before = levelInfo(P.xp).L;
    P.xp += n; dayLog().xp += n; if (show) popXP(n);
    const after = levelInfo(P.xp).L;
    if (after > before) setTimeout(() => { confetti(); beep('win'); toast('¡Subes a nivel ' + after + ': ' + levelInfo(P.xp).name + '!'); }, 300);
  }
  function markDayDone() {
    const log = dayLog(); if (log.done) return false;
    log.done = true;
    const t = today();
    if (P.streak.last === t - 1) P.streak.count++; else if (P.streak.last !== t) P.streak.count = 1;
    P.streak.last = t;
    addXP(50, false);
    return true;
  }
  function currentStreak() { const t = today(); return (P.streak.last === t || P.streak.last === t - 1) ? P.streak.count : 0; }

  const BADGES = [
    { id: 'first', b: '🌱', t: 'Primera palabra', test: s => s.introduced >= 1 },
    { id: 'w50', b: '📗', t: '50 palabras', test: s => s.introduced >= 50 },
    { id: 'w100', b: '📘', t: '100 palabras', test: s => s.introduced >= 100 },
    { id: 'w250', b: '📙', t: '250 palabras', test: s => s.introduced >= 250 },
    { id: 'w500', b: '📚', t: '¡Todas!', test: s => s.introduced >= WORDS.length },
    { id: 'm50', b: '🧠', t: '50 dominadas', test: s => s.mastered >= 50 },
    { id: 'm200', b: '🎓', t: '200 dominadas', test: s => s.mastered >= 200 },
    { id: 's3', b: '🔥', t: 'Racha de 3', test: s => s.streak >= 3 },
    { id: 's7', b: '⚡', t: 'Racha de 7', test: s => s.streak >= 7 },
    { id: 's30', b: '🌋', t: 'Racha de 30', test: s => s.streak >= 30 },
    { id: 't15', b: '⏱️', t: '15 en contrarreloj', test: s => s.timed >= 15 },
    { id: 't30', b: '🚀', t: '30 en contrarreloj', test: s => s.timed >= 30 },
  ];
  function checkBadges() {
    const s = stats(), got = [];
    BADGES.forEach(b => { if (!P.badges.includes(b.id) && b.test(s)) { P.badges.push(b.id); got.push(b); } });
    if (got.length) { save(); setTimeout(() => { confetti(); toast('Nueva insignia: ' + got.map(b => b.b + ' ' + b.t).join(', ')); }, 600); }
  }

  /* ---------- 8. REPASO ESPACIADO (SM-2 simplificado) ---------- */
  // r = repeticiones correctas seguidas · i = intervalo en días · e = facilidad · d = día del próximo repaso · l = fallos
  function introduce(w) { P.cards[w.id] = { r: 0, i: 0, e: 2.5, d: today(), l: 0, ok: 0, ko: 0, s: today() }; dayLog().neu++; }
  function schedule(id, grade) { // grade: 'again' | 'hard' | 'good' | 'easy'
    const c = P.cards[id], t = today();
    if (grade === 'again') {
      c.l++; c.ko++; c.e = Math.max(1.3, c.e - 0.2); c.i = 1; c.r = Math.max(1, c.r - 1);
    } else {
      c.ok++;
      if (grade === 'hard') { c.e = Math.max(1.3, c.e - 0.15); c.i = Math.max(1, Math.round(c.i * 1.2)); }
      else if (grade === 'good') { c.i = c.r <= 0 ? 1 : c.r === 1 ? 3 : c.r === 2 ? 7 : Math.round(c.i * c.e); c.r++; }
      else { c.e += 0.15; c.i = c.r <= 0 ? 3 : c.r === 1 ? 5 : Math.round(c.i * c.e * 1.3); c.r++; }
    }
    c.i = Math.min(c.i, 180); c.d = t + c.i;
  }
  function wordStatus(id) { const c = P.cards[id]; if (!c) return 'new'; return c.i >= MASTERED_DAYS ? 'mastered' : 'learning'; }
  function dueList() { const t = today(); return WORDS.filter(w => P.cards[w.id] && P.cards[w.id].d <= t); }
  function unseenList() {
    const f = +P.settings.focusUnit || 0;
    const u = WORDS.filter(w => !P.cards[w.id]);
    return f ? u.filter(w => w.unit === f).concat(u.filter(w => w.unit !== f)) : u;
  }
  function newTodayLeft() {
    const due = dueList().length;
    if (due > MAX_REVIEWS_BEFORE_NO_NEW) return 0;
    return Math.max(0, Math.min(P.settings.perDay - dayLog().neu, unseenList().length));
  }
  function stats() {
    const ids = Object.keys(P.cards);
    return {
      introduced: ids.length,
      mastered: ids.filter(id => P.cards[id].i >= MASTERED_DAYS).length,
      streak: currentStreak(), timed: P.best.timed || 0
    };
  }
  function difficultList() { return WORDS.filter(w => { const c = P.cards[w.id]; return c && (c.l >= 2 || c.e < 2.1); }); }

  /* ---------- 9. GENERADOR DE EJERCICIOS ---------- */
  function clozeFor(w) { // frase con hueco (solo si la palabra aparece en el ejemplo)
    const words = cleanEn(w.en).toLowerCase().split(' ');
    const ex = w.example;
    const re = new RegExp('\\b(' + words.map(x => x.replace(/[^a-z']/g, '').slice(0, Math.max(3, x.length - 2))).join('[a-z\']*\\s+(?:[a-z\']+\\s+)?') + '[a-z\']*)', 'i');
    const m = ex.match(re);
    if (!m) return null;
    return { before: ex.slice(0, m.index), answer: m[1], after: ex.slice(m.index + m[1].length) };
  }
  function pickType(w) {
    const c = P.cards[w.id] || { r: 0 };
    if (c.r <= 1) return 'mc-en';
    if (c.r === 2) return 'mc-es';
    if (c.r === 3) return 'type';
    const opts = ['type', 'type'];
    if (canSpeak()) opts.push('listen');
    if (clozeFor(w)) opts.push('cloze', 'cloze');
    return pick(opts);
  }
  function distractors(w, field, n = 3) {
    const same = shuffle(WORDS.filter(x => x.theme === w.theme && x.id !== w.id));
    const other = shuffle(WORDS.filter(x => x.theme !== w.theme));
    const out = [], seen = new Set([norm(w[field])]);
    for (const x of same.concat(other)) { const k = norm(x[field]); if (!seen.has(k)) { seen.add(k); out.push(x); } if (out.length >= n) break; }
    return out;
  }

  /* ---------- 10. INTERFAZ: utilidades ---------- */
  function toast(msg) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1d2433;color:#fff;padding:12px 18px;border-radius:14px;font-weight:800;z-index:70;max-width:90vw;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.25)';
    d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 3200);
  }
  function modal(html, onMount) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal">' + html + '</div>';
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg); if (onMount) onMount(bg, () => bg.remove()); return bg;
  }
  function confirmBox(msg, okText, cb) {
    modal(`<h3>${esc(msg)}</h3><div class="row" style="margin-top:16px"><button class="btn grow" data-x>Cancelar</button><button class="btn ko grow" data-ok>${esc(okText)}</button></div>`,
      (bg, close) => { bg.querySelector('[data-x]').onclick = close; bg.querySelector('[data-ok]').onclick = () => { close(); cb(); }; });
  }
  // Firma personal: "by" + logo NIKWARE (en la versión de un solo archivo el logo va incrustado)
  const LOGO = window.NIKWARE_LOGO || 'nikware-logo.webp';
  const signature = () => `<div class="signature">by <img src="${LOGO}" alt="NIKWARE" width="98" height="40"></div>`;
  const unitColor = u => `var(--u${u})`;
  const themeName = id => THEMES[id] ? THEMES[id].theme : '';
  function render(html) { app().innerHTML = html; window.scrollTo(0, 0); }
  function on(sel, ev, fn) { document.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn)); }
  function highlight(example, w) {
    const cz = clozeFor(w);
    if (!cz) return esc(example);
    return esc(cz.before) + '<mark>' + esc(cz.answer) + '</mark>' + esc(cz.after);
  }

  /* ---------- 11. PANTALLA: elegir perfil ---------- */
  function screenProfiles() {
    P = null; PID = null;
    const ps = profiles();
    const items = ps.list.map(p => {
      const d = loadProfile(p.id) || newProfileData(p.name, p.avatar);
      const lv = levelInfo(d.xp);
      return `<button class="card profile" data-id="${p.id}">
        <div class="avatar">${d.avatar}</div>
        <div class="grow"><h3 style="margin:0">${esc(d.name)}</h3>
        <div class="small muted">Nivel ${lv.L} · ${Object.keys(d.cards).length}/${WORDS.length} palabras · 🔥 ${d.streak.last >= today() - 1 ? d.streak.count : 0}</div></div>
        <span style="font-size:22px">›</span></button>`;
    }).join('');
    render(`
      <div class="center" style="margin:18px 0 22px">
        <div style="font-size:56px">🇬🇧</div>
        <h1>Inglés Vocabulario NK</h1>
        <p class="muted">20 palabras al día · repaso inteligente · 9 unidades</p>
      </div>
      <div class="stack">
        ${items || '<div class="card center muted">Aún no hay nadie. ¡Crea tu perfil para empezar!</div>'}
        <button class="btn primary block" id="add">＋ Añadir persona</button>
        ${ps.list.length > 1 ? '<button class="btn block" id="family">🏆 Ranking de la familia</button>' : ''}
        <button class="btn block" id="impAll">📥 Importar progreso</button>
      </div>
      <p class="small muted center" style="margin-top:24px">El progreso se guarda en este navegador. Cada persona puede usar su propio móvil o compartir dispositivo con perfiles.</p>${signature()}`);
    on('[data-id]', 'click', e => { selectProfile(e.currentTarget.dataset.id); screenHome(); });
    $('#add').onclick = () => profileEditor(null);
    if ($('#family')) $('#family').onclick = familyRanking;
    $('#impAll').onclick = importDialog;
  }
  function profileEditor(existing) {
    let av = existing ? existing.avatar : pick(AVATARS);
    modal(`<h2>${existing ? 'Editar perfil' : 'Nuevo perfil'}</h2>
      <div class="stack"><input id="pname" maxlength="20" placeholder="Nombre" value="${existing ? esc(existing.name) : ''}">
      <div class="avatars">${AVATARS.map(a => `<button data-av="${a}" class="${a === av ? 'sel' : ''}">${a}</button>`).join('')}</div>
      <button class="btn primary block" id="psave">Guardar</button></div>`,
      (bg, close) => {
        bg.querySelectorAll('[data-av]').forEach(b => b.onclick = () => { av = b.dataset.av; bg.querySelectorAll('[data-av]').forEach(x => x.classList.toggle('sel', x === b)); });
        const inp = bg.querySelector('#pname'); setTimeout(() => inp.focus(), 50);
        bg.querySelector('#psave').onclick = () => {
          const name = inp.value.trim(); if (!name) { inp.classList.add('shake'); setTimeout(() => inp.classList.remove('shake'), 300); return; }
          const ps = profiles();
          if (existing) {
            P.name = name; P.avatar = av; save();
            const it = ps.list.find(x => x.id === PID); if (it) { it.name = name; it.avatar = av; } saveProfiles(ps); close(); screenSettings();
          } else {
            const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            ps.list.push({ id, name, avatar: av }); saveProfiles(ps);
            storage.set(KEY_PROFILE(id), newProfileData(name, av));
            close(); selectProfile(id); screenHome(); setTimeout(screenTips.bind(null, true), 50);
          }
        };
      });
  }
  function familyRanking() {
    const rows = profiles().list.map(p => loadProfile(p.id)).filter(Boolean)
      .map(d => ({ d, lv: levelInfo(d.xp), n: Object.keys(d.cards).length }))
      .sort((a, b) => b.d.xp - a.d.xp);
    modal(`<h2>🏆 Ranking de la familia</h2><p class="small muted">Solo cuenta los perfiles de este dispositivo.</p>
      <div class="stack">${rows.map((r, i) => `<div class="card row"><b style="width:24px">${['🥇', '🥈', '🥉'][i] || i + 1}</b>
      <div class="avatar" style="width:42px;height:42px;font-size:24px">${r.d.avatar}</div>
      <div class="grow"><b>${esc(r.d.name)}</b><div class="small muted">Nivel ${r.lv.L} · ${r.n} palabras · récord ⏱️ ${r.d.best.timed || 0}</div></div>
      <b>${r.d.xp} XP</b></div>`).join('')}</div>
      <button class="btn block" style="margin-top:14px" data-close>Cerrar</button>`,
      (bg, close) => bg.querySelector('[data-close]').onclick = close);
  }

  /* ---------- 12. PANTALLA: inicio ---------- */
  function screenHome() {
    checkBadges();
    const lv = levelInfo(P.xp), s = stats(), due = dueList().length, neu = newTodayLeft();
    const log = dayLog(), pct = Math.round(s.introduced / WORDS.length * 100);
    const tooMany = due > MAX_REVIEWS_BEFORE_NO_NEW && unseenList().length;
    const dayNum = Math.min(Math.ceil(WORDS.length / P.settings.perDay), Math.floor(s.introduced / P.settings.perDay) + 1);
    let main;
    if (due + neu > 0) {
      main = `<button class="btn primary block" id="go" style="font-size:20px;padding:18px">▶ ${log.rev + log.neu ? 'Seguir' : 'Empezar'} la sesión de hoy</button>
        <div class="row small muted" style="justify-content:center;margin-top:8px;gap:16px">
          <span>🔁 ${due} repasos</span><span>✨ ${neu} nuevas</span><span>⏱️ ~${Math.max(3, Math.round(due * 0.25 + neu * 0.6))} min</span></div>
        ${tooMany ? '<p class="small center" style="color:var(--warn);font-weight:700">Hay muchos repasos pendientes: hoy toca solo repasar para no saturarte.</p>' : ''}`;
    } else {
      main = `<div class="center"><div style="font-size:44px">✅</div><h2>¡Has terminado por hoy!</h2>
        <p class="muted">Vuelve mañana para seguir. Si te apetece, juega al contrarreloj o practica tus palabras difíciles.</p></div>`;
    }
    render(`
      <div class="topbar">
        <button class="avatar" id="switch" title="Cambiar de perfil" style="width:46px;height:46px;font-size:28px;border:2px solid var(--line)">${P.avatar}</button>
        <div class="grow"><b>Hola, ${esc(P.name)}</b><div class="small muted">${lv.name} · Nivel ${lv.L}</div></div>
        <span class="pill">🔥 ${s.streak}</span><span class="pill">⭐ ${P.xp}</span>
      </div>
      <div class="stack">
        <div class="card">
          <div class="row"><span class="small muted grow">Hacia el nivel ${lv.L + 1}</span><span class="small muted">faltan ${lv.toNext} XP</span></div>
          <div class="bar blue" style="margin-top:6px"><i style="width:${lv.pct}%"></i></div>
        </div>
        <div class="card"><div class="row" style="margin-bottom:10px"><h3 class="grow" style="margin:0">${due + neu > 0 ? 'Día ' + dayNum : '✔ Día ' + Math.max(1, dayNum - 1)} de ${Math.ceil(WORDS.length / P.settings.perDay)}</h3>
          <span class="small muted">${s.introduced}/${WORDS.length} palabras</span></div>
          <div class="bar" style="margin-bottom:16px"><i style="width:${pct}%"></i></div>${main}</div>
        <div class="grid2">
          <div class="card stat"><b>${s.mastered}</b><span>dominadas 🧠</span></div>
          <div class="card stat"><b>${s.introduced - s.mastered}</b><span>aprendiendo 📖</span></div>
        </div>
        <div class="menu">
          <button class="btn" id="timed"><span class="i">⏱️</span>Contrarreloj<small>récord: ${P.best.timed || 0}</small></button>
          <button class="btn" id="hard"><span class="i">💪</span>Difíciles<small>${difficultList().length} palabras</small></button>
          <button class="btn" id="words"><span class="i">📚</span>Mis palabras<small>por unidades</small></button>
          <button class="btn" id="badges"><span class="i">🏅</span>Insignias<small>${P.badges.length}/${BADGES.length}</small></button>
          <button class="btn" id="tips"><span class="i">💡</span>Cómo estudiar<small>técnicas</small></button>
          <button class="btn" id="settings"><span class="i">⚙️</span>Ajustes<small>y copia de seguridad</small></button>
        </div>
        ${weekChart()}
      </div>${signature()}`);
    if ($('#go')) $('#go').onclick = startSession;
    $('#switch').onclick = screenProfiles;
    $('#timed').onclick = startTimed;
    $('#hard').onclick = startDifficult;
    $('#words').onclick = screenWords;
    $('#badges').onclick = showBadges;
    $('#tips').onclick = () => screenTips(false);
    $('#settings').onclick = screenSettings;
  }
  function weekChart() {
    const t = today(), days = [];
    const names = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    for (let i = 6; i >= 0; i--) { const d = t - i, h = P.history[d] || {}; days.push({ d, n: (h.rev || 0) + (h.neu || 0), done: h.done, wd: names[new Date(d * 864e5).getUTCDay()] }); }
    const max = Math.max(10, ...days.map(x => x.n));
    return `<div class="card"><h3>Últimos 7 días</h3><div class="row" style="align-items:flex-end;height:90px;gap:8px;margin-top:8px">
      ${days.map(x => `<div class="grow center"><div title="${x.n} tarjetas" style="height:${Math.round(x.n / max * 64) + 4}px;border-radius:6px;background:${x.done ? 'var(--ok)' : x.n ? 'var(--brand)' : 'var(--line)'}"></div>
      <div class="small muted" style="margin-top:4px;font-weight:800">${x.wd}</div></div>`).join('')}</div>
      <p class="small muted" style="margin:6px 0 0">Verde = objetivo del día cumplido</p></div>`;
  }
  function showBadges() {
    modal(`<h2>🏅 Insignias</h2><div class="badges">${BADGES.map(b => `<div class="badge ${P.badges.includes(b.id) ? '' : 'off'}"><span class="b">${b.b}</span>${b.t}</div>`).join('')}</div>
      <button class="btn block" style="margin-top:14px" data-close>Cerrar</button>`, (bg, close) => bg.querySelector('[data-close]').onclick = close);
  }

  /* ---------- 13. SESIÓN DIARIA ---------- */
  // Orden: 1) repasos pendientes  2) palabras nuevas en bloques de 5 (aprender → practicar)
  let S = null;
  function startSession() {
    const reviews = shuffle(dueList());
    S = { queue: reviews.map(w => ({ w, kind: 'review' })), done: 0, total: reviews.length, ok: 0, ko: 0, retried: new Set(), newBlock: null, xp0: P.xp };
    nextStep();
  }
  function nextStep() {
    if (!S) return screenHome();
    if (S.queue.length) { const item = S.queue.shift(); return showExercise(item); }
    // Bloque de palabras nuevas
    const left = newTodayLeft();
    if (left > 0) {
      const block = unseenList().slice(0, Math.min(CHUNK, left));
      block.forEach(introduce); save();
      S.total += block.length;
      return showLearn(block, 0);
    }
    finishSession();
  }
  function headerBar() {
    const pct = S.total ? Math.round(S.done / S.total * 100) : 0;
    return `<div class="progress-top"><button class="icon-btn" id="quit" title="Salir">✕</button>
      <div class="bar grow"><i style="width:${pct}%"></i></div><span class="pill">⭐ ${P.xp}</span></div>`;
  }
  function bindQuit() { $('#quit').onclick = () => { save(); S = null; screenHome(); }; }

  // ---- Presentar palabras nuevas (tarjeta de estudio) ----
  function wordCardHTML(w, showSpanish = true) {
    const warn = w.tip.startsWith('⚠️');
    return `<div class="card word-card">
      <div class="row" style="justify-content:space-between;margin-bottom:6px">
        <span class="chip" style="background:${unitColor(w.unit)};color:#fff">U${w.unit} · ${esc(themeName(w.theme))}</span>
        <span class="chip ${w.source}">${w.source === 'book' ? '📗 Del libro' : '➕ Extra'}</span></div>
      <div class="emoji">${w.emoji}</div>
      <div class="en">${esc(w.en)}</div>
      <div class="pron">/${esc(w.pron)}/</div>
      <div class="row" style="justify-content:center;margin-top:8px">
        <button class="btn sm" data-say="${esc(w.en)}">🔊 Escuchar</button>
        <button class="btn sm" data-slow="${esc(w.en)}">🐢 Lento</button></div>
      ${showSpanish ? `<div class="es">${esc(w.es)}</div>` : ''}
      <div class="example">📝 ${highlight(w.example, w)} <button class="btn sm" style="padding:2px 8px;margin-left:4px" data-say="${esc(w.example)}">🔊</button></div>
      <div class="tip ${warn ? 'warn' : ''}">${warn ? '' : '💡 '}<b>Truco:</b> ${esc(w.tip.replace(/^⚠️\s*/, '⚠️ '))}</div>
    </div>`;
  }
  function bindSay(root = document) {
    root.querySelectorAll('[data-say]').forEach(b => b.onclick = () => speak(b.dataset.say));
    root.querySelectorAll('[data-slow]').forEach(b => b.onclick = () => speak(b.dataset.slow, true));
  }
  function showLearn(block, i) {
    const w = block[i];
    render(`${headerBar()}
      <p class="q-head center">✨ Palabra nueva ${i + 1} de ${block.length}</p>
      ${wordCardHTML(w)}
      <p class="small muted center" style="margin:12px 0">Dila en voz alta e imagina la escena del truco 🎬</p>
      <div class="row">
        ${i > 0 ? '<button class="btn" id="prev">←</button>' : ''}
        <button class="btn primary grow" id="next">${i < block.length - 1 ? 'Siguiente →' : '¡A practicar! 💪'}</button></div>`);
    bindQuit(); bindSay(); setTimeout(() => speak(w.en), 250);
    if ($('#prev')) $('#prev').onclick = () => showLearn(block, i - 1);
    $('#next').onclick = () => {
      if (i < block.length - 1) return showLearn(block, i + 1);
      // Practicar el bloque recién aprendido (orden aleatorio)
      S.queue = shuffle(block).map(w => ({ w, kind: 'learn' })).concat(S.queue);
      nextStep();
    };
  }

  // ---- Mostrar un ejercicio ----
  function showExercise(item, forcedType) {
    const w = item.w;
    const type = forcedType || (item.kind === 'learn' ? 'mc-en' : item.retry ? 'mc-en' : pickType(w));
    let body = '';
    if (type === 'mc-en' || type === 'mc-es') {
      const field = type === 'mc-en' ? 'es' : 'en';
      const opts = shuffle([w].concat(distractors(w, field)));
      body = `<p class="q-head">${type === 'mc-en' ? '¿Qué significa?' : '¿Cómo se dice en inglés?'}</p>
        <div class="q-word">${type === 'mc-en' ? esc(w.en) + ' <button class="btn sm" data-say="' + esc(w.en) + '">🔊</button>' : esc(w.es)}</div>
        ${type === 'mc-es' ? `<div style="font-size:40px">${w.emoji}</div>` : ''}
        <div class="options">${opts.map(o => `<button class="option" data-opt="${o.id}">${esc(type === 'mc-en' ? o.es : o.en)}</button>`).join('')}</div>`;
    } else if (type === 'type' || type === 'listen') {
      body = type === 'type'
        ? `<p class="q-head">Escribe en inglés</p><div class="q-word">${esc(w.es)}</div><div style="font-size:40px">${w.emoji}</div>`
        : `<p class="q-head">Escucha y escribe</p><div class="center" style="margin:16px 0"><button class="btn blue" id="play" style="font-size:22px">🔊 Escuchar</button> <button class="btn" id="playslow">🐢</button></div>`;
      body += `<form id="tform" autocomplete="off" style="margin-top:14px"><input id="ans" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Escribe aquí...">
        <div class="row" style="margin-top:10px"><button type="button" class="btn" id="hint">💡 Pista</button><button class="btn primary grow">Comprobar</button></div></form>
        <button class="btn sm" id="idk" style="margin-top:10px">No lo sé 🤷</button>`;
    } else if (type === 'cloze') {
      const cz = clozeFor(w);
      body = `<p class="q-head">Completa la frase</p>
        <div class="card" style="font-size:20px;font-weight:700;margin-top:8px">${esc(cz.before)}<span style="border-bottom:3px solid var(--brand);padding:0 30px"> </span>${esc(cz.after)}</div>
        <p class="muted" style="margin:10px 0 0">Pista: <b>${esc(w.es)}</b> ${w.emoji}</p>
        <form id="tform" autocomplete="off" style="margin-top:14px"><input id="ans" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Palabra que falta...">
        <div class="row" style="margin-top:10px"><button type="button" class="btn" id="hint">💡 Pista</button><button class="btn primary grow">Comprobar</button></div></form>
        <button class="btn sm" id="idk" style="margin-top:10px">No lo sé 🤷</button>`;
    }
    render(`${headerBar()}<div class="card">${body}<div id="fb"></div></div>`);
    bindQuit(); bindSay();
    if (type === 'listen') { const p = () => speak(w.en); $('#play').onclick = p; $('#playslow').onclick = () => speak(w.en, true); setTimeout(p, 300); }
    if (type === 'mc-en') setTimeout(() => speak(w.en), 250);

    if (type.startsWith('mc')) {
      on('[data-opt]', 'click', e => {
        const chosen = +e.currentTarget.dataset.opt;
        document.querySelectorAll('[data-opt]').forEach(b => { b.disabled = true; if (+b.dataset.opt === w.id) b.classList.add('right'); });
        const ok = chosen === w.id;
        if (!ok) e.currentTarget.classList.add('wrong');
        result(item, ok, 10, type);
      });
    } else {
      const inp = $('#ans'); setTimeout(() => inp.focus(), 60);
      let hints = 0;
      const target = type === 'cloze' ? clozeFor(w).answer : cleanEn(w.en);
      $('#hint').onclick = () => { hints++; inp.placeholder = target.slice(0, hints) + '…'; inp.focus(); };
      $('#idk').onclick = () => { inp.disabled = true; result(item, false, 0, type); };
      $('#tform').onsubmit = ev => {
        ev.preventDefault(); if (inp.disabled) return;
        let r;
        if (type === 'cloze') { const a = norm(inp.value), t = norm(target); r = a === t ? 'ok' : (t.length >= 5 && lev(a, t) <= 1 ? 'almost' : checkTyped(inp.value, w)); }
        else r = checkTyped(inp.value, w);
        inp.disabled = true;
        result(item, r !== 'ko', hints ? 8 : 15, type, r === 'almost' ? target : null);
      };
    }
  }

  // ---- Resultado de un ejercicio ----
  function result(item, ok, xp, type, almostFix) {
    const w = item.w, fb = $('#fb'), log = dayLog();
    $('#idk') && ($('#idk').style.display = 'none');
    const answerLine = `<div style="margin-top:6px"><b>${esc(w.en)}</b> = ${esc(w.es)} ${w.emoji}</div>`;
    if (ok) {
      beep('ok'); addXP(xp); S.ok++; log.ok++;
      fb.innerHTML = `<div class="feedback ok">✅ ${pick(['¡Bien!', '¡Genial!', '¡Correcto!', '¡Eso es!', '¡Perfecto!'])}${almostFix ? ` (casi: se escribe <b>${esc(almostFix)}</b>)` : ''}${answerLine}</div>`;
    } else {
      beep('ko'); S.ko++; log.ko++;
      $('.card').classList.add('shake');
      fb.innerHTML = `<div class="feedback ko">❌ La respuesta era:${answerLine}
        <div class="small" style="margin-top:6px">💡 ${esc(w.tip)}</div></div>`;
    }
    speak(w.en);
    if (item.kind === 'learn') {
      // Fase de aprendizaje: si aciertas pasa a repaso mañana; si fallas, vuelve a salir en esta sesión
      if (ok) { if (!item.retry) { const c = P.cards[w.id]; c.r = 1; c.i = 1; c.d = today() + 1; c.ok++; } else { const c = P.cards[w.id]; c.r = 1; c.i = 1; c.d = today() + 1; } S.done++; }
      else { P.cards[w.id].ko++; S.queue.splice(Math.min(3, S.queue.length), 0, { w, kind: 'learn', retry: true }); }
      save(); addContinue();
    } else if (ok && !item.retry) {
      // Autoevaluación: ¿te costó?
      fb.innerHTML += `<p class="small muted center" style="margin:12px 0 0">¿Cómo de fácil te ha resultado?</p>
        <div class="grade">
          <button class="btn" data-g="hard">😓 Difícil<small>${previewDays(w.id, 'hard')}</small></button>
          <button class="btn ok" data-g="good">🙂 Bien<small>${previewDays(w.id, 'good')}</small></button>
          <button class="btn blue" data-g="easy">😎 Fácil<small>${previewDays(w.id, 'easy')}</small></button></div>`;
      on('[data-g]', 'click', e => { schedule(w.id, e.currentTarget.dataset.g); log.rev++; S.done++; save(); nextStep(); });
    } else if (ok && item.retry) {
      S.done++; save(); addContinue();
    } else {
      // Fallo en un repaso: se programa para mañana y vuelve a salir hoy al final
      if (!item.retry) { schedule(w.id, 'again'); log.rev++; }
      S.queue.push({ w, kind: 'review', retry: true });
      save(); addContinue();
    }
  }
  function previewDays(id, g) {
    const c = Object.assign({}, P.cards[id]); const saved = P.cards[id];
    P.cards[id] = c; schedule(id, g); const d = c.i; P.cards[id] = saved;
    return d === 1 ? 'mañana' : d + ' días';
  }
  function addContinue() {
    $('#fb').innerHTML += `<button class="btn primary block" id="cont" style="margin-top:12px">Continuar →</button>`;
    const b = $('#cont'); b.onclick = nextStep; setTimeout(() => b.focus(), 50);
  }
  function finishSession() {
    const gained = P.xp - S.xp0;
    const due = dueList().length;
    let firstDone = false;
    if (due === 0 && newTodayLeft() === 0) firstDone = markDayDone();
    save(); checkBadges();
    const acc = S.ok + S.ko ? Math.round(S.ok / (S.ok + S.ko) * 100) : 100;
    confetti(); beep('win');
    render(`<div class="center" style="margin-top:30px">
      <div style="font-size:72px">🏆</div><h1>¡Sesión completada!</h1>
      <p class="muted">${firstDone ? '¡Objetivo del día cumplido! +50 XP de bonus 🔥' : 'Buen trabajo.'}</p></div>
      <div class="grid2" style="margin:18px 0">
        <div class="card stat"><b>${acc}%</b><span>aciertos</span></div>
        <div class="card stat"><b>+${gained + (firstDone ? 50 : 0)}</b><span>XP ganada</span></div>
        <div class="card stat"><b>🔥 ${currentStreak()}</b><span>días seguidos</span></div>
        <div class="card stat"><b>${stats().introduced}</b><span>palabras vistas</span></div>
      </div>
      <div class="card"><b>💡 Consejo:</b> ${pick(TIPS_SHORT)}</div>
      <button class="btn primary block" id="home" style="margin-top:16px">Volver al inicio</button>`);
    S = null; $('#home').onclick = screenHome;
  }

  /* ---------- 14. MODO CONTRARRELOJ ---------- */
  function startTimed() {
    const pool = WORDS.filter(w => P.cards[w.id]);
    if (pool.length < 8) return toast('Necesitas al menos 8 palabras aprendidas. ¡Haz primero tu sesión de hoy!');
    let score = 0, streak = 0, timeLeft = 60, timer = null, over = false;
    const T = { pool };
    function q() {
      if (over) return;
      const w = pick(pool), dir = Math.random() < 0.5 ? 'es' : 'en';
      const opts = shuffle([w].concat(distractors(w, dir)));
      render(`<div class="progress-top"><button class="icon-btn" id="quit">✕</button>
        <div class="timer grow" id="tm">⏱️ ${timeLeft}s</div><span class="pill">🎯 ${score}</span>${streak >= 3 ? `<span class="pill">🔥x${streak}</span>` : ''}</div>
        <div class="card"><p class="q-head">${dir === 'es' ? '¿Qué significa?' : '¿Cómo se dice en inglés?'}</p>
        <div class="q-word">${esc(dir === 'es' ? w.en : w.es)}</div>
        <div class="options">${opts.map(o => `<button class="option" data-opt="${o.id}">${esc(o[dir])}</button>`).join('')}</div></div>`);
      $('#quit').onclick = () => { over = true; clearInterval(timer); screenHome(); };
      on('[data-opt]', 'click', e => {
        const ok = +e.currentTarget.dataset.opt === w.id;
        e.currentTarget.classList.add(ok ? 'right' : 'wrong');
        if (ok) { score++; streak++; beep('ok'); } else { streak = 0; beep('ko'); timeLeft = Math.max(0, timeLeft - 2); }
        document.querySelectorAll('[data-opt]').forEach(b => b.disabled = true);
        setTimeout(q, ok ? 220 : 650);
      });
    }
    function end() {
      over = true; clearInterval(timer);
      const record = score > (P.best.timed || 0);
      if (record) P.best.timed = score;
      addXP(score * 3, false); save(); checkBadges();
      if (record) confetti();
      render(`<div class="center" style="margin-top:40px"><div style="font-size:72px">${record ? '🥇' : '⏱️'}</div>
        <h1>${score} aciertos</h1><p class="muted">${record ? '¡Nuevo récord personal!' : 'Tu récord: ' + P.best.timed}</p><p><b>+${score * 3} XP</b></p></div>
        <div class="stack"><button class="btn primary block" id="again">Otra vez 🔁</button><button class="btn block" id="home">Inicio</button></div>`);
      $('#again').onclick = startTimed; $('#home').onclick = screenHome;
    }
    render(`<div class="center" style="margin-top:50px"><div style="font-size:64px">⏱️</div><h1>Contrarreloj</h1>
      <p class="muted">60 segundos. Acierta todas las que puedas.<br>Cada fallo resta 2 segundos.</p>
      <button class="btn primary block" id="start" style="margin-top:20px;font-size:20px">¡Ya!</button>
      <button class="btn block" id="back" style="margin-top:10px">Volver</button></div>`);
    $('#back').onclick = screenHome;
    $('#start').onclick = () => {
      q();
      timer = setInterval(() => { timeLeft--; const el = $('#tm'); if (el) el.textContent = '⏱️ ' + timeLeft + 's'; if (timeLeft <= 0) end(); }, 1000);
    };
  }

  /* ---------- 15. PRÁCTICA DE PALABRAS DIFÍCILES (no cambia el calendario de repaso) ---------- */
  function startDifficult() {
    let list = difficultList();
    if (!list.length) return toast('¡No tienes palabras difíciles! Las que falles a menudo aparecerán aquí.');
    list = shuffle(list).slice(0, 15);
    let i = 0, ok = 0;
    function q() {
      if (i >= list.length) {
        render(`<div class="center" style="margin-top:40px"><div style="font-size:64px">💪</div><h1>${ok}/${list.length}</h1><p class="muted">Repetir lo difícil es lo que más ayuda a recordarlo.</p></div>
          <button class="btn primary block" id="home">Inicio</button>`); $('#home').onclick = screenHome; save(); return;
      }
      const w = list[i];
      render(`<div class="progress-top"><button class="icon-btn" id="quit">✕</button><div class="bar grow"><i style="width:${i / list.length * 100}%"></i></div><span class="pill">${i + 1}/${list.length}</span></div>
        <div class="card"><p class="q-head">Escribe en inglés</p><div class="q-word">${esc(w.es)}</div><div style="font-size:40px">${w.emoji}</div>
        <form id="f" autocomplete="off"><input id="a" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Escribe aquí..."><button class="btn primary block" style="margin-top:10px">Comprobar</button></form><div id="fb"></div></div>`);
      $('#quit').onclick = screenHome;
      const a = $('#a'); setTimeout(() => a.focus(), 60);
      $('#f').onsubmit = e => {
        e.preventDefault(); if (a.disabled) return; a.disabled = true;
        const r = checkTyped(a.value, w); speak(w.en);
        if (r !== 'ko') { ok++; beep('ok'); addXP(5); } else beep('ko');
        $('#fb').innerHTML = `<div class="feedback ${r !== 'ko' ? 'ok' : 'ko'}">${r !== 'ko' ? '✅' : '❌'} <b>${esc(w.en)}</b> = ${esc(w.es)}<div class="small" style="margin-top:6px">💡 ${esc(w.tip)}</div></div>
          <button class="btn primary block" id="n" style="margin-top:10px">Siguiente →</button>`;
        $('#n').onclick = () => { i++; q(); }; setTimeout(() => $('#n').focus(), 50);
      };
    }
    q();
  }

  /* ---------- 16. MIS PALABRAS (diccionario por unidades) ---------- */
  function screenWords() {
    const groups = THEMES.map(t => {
      const ws = WORDS.filter(w => w.theme === t.id);
      const seen = ws.filter(w => P.cards[w.id]).length;
      return `<details class="theme"><summary><span class="unit-dot" style="background:${unitColor(t.unit)}"></span>
        <span class="grow">U${t.unit} · ${esc(t.theme)} <span class="muted small">(${esc(t.themeEs)})</span></span><span class="small muted">${seen}/${ws.length}</span></summary>
        <div class="wlist">${ws.map(witem).join('')}</div></details>`;
    }).join('');
    render(`<div class="topbar"><button class="icon-btn" id="back">←</button><h2 class="grow" style="margin:0">Mis palabras</h2></div>
      <input id="q" placeholder="🔎 Buscar en inglés o español..." style="margin-bottom:12px">
      <div class="row small muted wrap" style="margin-bottom:12px;gap:6px"><span class="chip new">nueva</span><span class="chip learning">aprendiendo</span><span class="chip mastered">dominada</span><span class="chip book">📗 libro</span><span class="chip extra">➕ extra</span></div>
      <div id="res" class="stack">${groups}</div>`);
    $('#back').onclick = screenHome;
    bindWordItems();
    $('#q').oninput = e => {
      const v = norm(e.target.value);
      if (!v) { $('#res').innerHTML = groups; bindWordItems(); return; }
      const found = WORDS.filter(w => norm(w.en).includes(v) || norm(w.es).includes(v)).slice(0, 60);
      $('#res').innerHTML = `<div class="wlist">${found.map(witem).join('') || '<p class="muted">Sin resultados</p>'}</div>`; bindWordItems();
    };
  }
  function witem(w) {
    const st = wordStatus(w.id);
    const label = { new: 'nueva', learning: 'aprendiendo', mastered: 'dominada' }[st];
    return `<button class="witem" data-w="${w.id}"><span class="e">${w.emoji}</span><span class="grow"><b>${esc(w.en)}</b> <span class="muted">· ${esc(w.es)}</span></span><span class="chip ${st}">${label}</span></button>`;
  }
  function bindWordItems() {
    on('[data-w]', 'click', e => {
      const w = BY_ID[e.currentTarget.dataset.w], c = P.cards[w.id];
      const info = c ? `<p class="small muted center" style="margin-top:10px">Aciertos ${c.ok} · fallos ${c.ko} · próximo repaso: ${c.d <= today() ? 'hoy' : c.d - today() === 1 ? 'mañana' : 'en ' + (c.d - today()) + ' días'}</p>` : '<p class="small muted center" style="margin-top:10px">Todavía no la has estudiado.</p>';
      modal(wordCardHTML(w) + info + '<button class="btn block" data-close style="margin-top:12px">Cerrar</button>', (bg, close) => { bindSay(bg); bg.querySelector('[data-close]').onclick = close; speak(w.en); });
    });
  }

  /* ---------- 17. AJUSTES Y COPIA DE SEGURIDAD ---------- */
  function screenSettings() {
    const unitOpts = ['<option value="0">Por orden (unidad 1 → 9)</option>'].concat(
      [...new Set(THEMES.map(t => t.unit))].map(u => `<option value="${u}" ${+P.settings.focusUnit === u ? 'selected' : ''}>Empezar por la unidad ${u}: ${esc(THEMES.find(t => t.unit === u).unitTitle)}</option>`)).join('');
    render(`<div class="topbar"><button class="icon-btn" id="back">←</button><h2 class="grow" style="margin:0">Ajustes</h2></div>
      <div class="stack">
        <div class="card row"><div class="avatar">${P.avatar}</div><div class="grow"><b>${esc(P.name)}</b><div class="small muted">${P.xp} XP</div></div><button class="btn sm" id="edit">Editar</button></div>
        <div class="card stack">
          <label><b>Palabras nuevas al día</b><select id="perDay">${[10, 15, 20, 25, 30].map(n => `<option ${P.settings.perDay === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label><b>¿Por qué unidad empiezo?</b><select id="focus">${unitOpts}</select>
            <span class="small muted">Útil si en clase vais por otra unidad.</span></label>
          <label><b>Acento de la voz</b><select id="accent"><option value="en-GB" ${P.settings.accent === 'en-GB' ? 'selected' : ''}>🇬🇧 Británico</option><option value="en-US" ${P.settings.accent === 'en-US' ? 'selected' : ''}>🇺🇸 Americano</option></select></label>
          <label class="row"><input type="checkbox" id="sound" style="width:auto" ${P.settings.sound ? 'checked' : ''}> <b>Efectos de sonido</b></label>
          ${canSpeak() ? '' : '<p class="small" style="color:var(--warn)">Este navegador no tiene voz: los ejercicios de escuchar no aparecerán.</p>'}
        </div>
        <div class="card stack"><h3>💾 Copia de seguridad</h3>
          <p class="small muted" style="margin:0">El progreso se guarda solo en este navegador. Exporta una copia de vez en cuando, o para pasarte a otro móvil.</p>
          <button class="btn block" id="exp">📤 Exportar progreso</button>
          <button class="btn block" id="imp">📥 Importar progreso</button></div>
        <div class="card stack"><h3>Zona peligrosa</h3>
          <button class="btn block" id="reset">🔄 Reiniciar mi progreso</button>
          <button class="btn ko block" id="del">🗑️ Borrar este perfil</button></div>
        <button class="btn block" id="switch">👥 Cambiar de perfil</button>
      </div>${signature()}`);
    $('#back').onclick = screenHome;
    $('#edit').onclick = () => profileEditor(P);
    $('#perDay').onchange = e => { P.settings.perDay = +e.target.value; save(); };
    $('#focus').onchange = e => { P.settings.focusUnit = +e.target.value; save(); };
    $('#accent').onchange = e => { P.settings.accent = e.target.value; save(); speak('Hello! This is my voice.'); };
    $('#sound').onchange = e => { P.settings.sound = e.target.checked; save(); };
    $('#exp').onclick = exportDialog;
    $('#imp').onclick = importDialog;
    $('#switch').onclick = screenProfiles;
    $('#reset').onclick = () => confirmBox('¿Reiniciar todo el progreso de ' + P.name + '?', 'Reiniciar', () => {
      const fresh = newProfileData(P.name, P.avatar); fresh.settings = P.settings; P = fresh; save(); toast('Progreso reiniciado'); screenHome();
    });
    $('#del').onclick = () => confirmBox('¿Borrar el perfil de ' + P.name + '? No se puede deshacer.', 'Borrar', () => {
      const ps = profiles(); ps.list = ps.list.filter(x => x.id !== PID); ps.current = null; saveProfiles(ps); storage.del(KEY_PROFILE(PID)); screenProfiles();
    });
  }
  function exportDialog() {
    const ps = profiles();
    const data = { app: 'inglesvocabularionk', v: 1, date: new Date().toISOString(), profiles: ps.list.map(p => ({ meta: p, data: loadProfile(p.id) })).filter(x => x.data) };
    const txt = JSON.stringify(data);
    modal(`<h2>📤 Exportar</h2><p class="small muted">Incluye todos los perfiles de este dispositivo. Descarga el archivo o copia el texto y guárdalo (por ejemplo, envíatelo por correo).</p>
      <div class="stack"><button class="btn primary block" id="dl">⬇️ Descargar archivo</button>
      <button class="btn block" id="cp">📋 Copiar texto</button>
      <textarea rows="5" readonly id="tx" style="font-size:12px">${esc(txt)}</textarea>
      <button class="btn block" data-close>Cerrar</button></div>`, (bg, close) => {
        bg.querySelector('[data-close]').onclick = close;
        bg.querySelector('#dl').onclick = async () => {
          const filename = 'inglesvocabularionk-progreso-' + new Date().toISOString().slice(0, 10) + '.json';
          // Dentro de claude.ai la descarga pasa por la plataforma; en tu propia web, descarga normal
          if (window.claude && window.claude.use) {
            try { const dl = await window.claude.use('downloads'); if (dl) { await dl.save({ filename, data: txt }); return; } } catch (e) { return toast('Descarga cancelada: usa "Copiar texto"'); }
          }
          try {
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
            a.download = 'inglesvocabularionk-progreso-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove();
            toast('Descarga iniciada (si no aparece, usa "Copiar texto")');
          } catch (e) { toast('No se pudo descargar: usa "Copiar texto"'); }
        };
        bg.querySelector('#cp').onclick = async () => {
          try { await navigator.clipboard.writeText(txt); toast('¡Copiado!'); }
          catch (e) { const t = bg.querySelector('#tx'); t.select(); toast('Selecciona y copia el texto manualmente'); }
        };
      });
  }
  function importDialog() {
    modal(`<h2>📥 Importar</h2><p class="small muted">Elige un archivo exportado o pega el texto. Los perfiles con el mismo nombre se sobrescriben; los nuevos se añaden.</p>
      <div class="stack"><input type="file" id="file" accept=".json,application/json">
      <textarea rows="5" id="paste" placeholder="...o pega aquí el texto exportado"></textarea>
      <button class="btn primary block" id="go">Importar</button><button class="btn block" data-close>Cancelar</button></div>`, (bg, close) => {
        bg.querySelector('[data-close]').onclick = close;
        bg.querySelector('#file').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => bg.querySelector('#paste').value = r.result; r.readAsText(f); };
        bg.querySelector('#go').onclick = () => {
          try {
            const d = JSON.parse(bg.querySelector('#paste').value);
            if (d.app !== 'inglesvocabularionk' || !Array.isArray(d.profiles)) throw new Error('formato');
            const ps = profiles(); let n = 0;
            d.profiles.forEach(({ meta, data }) => {
              if (!data || !meta) return;
              const existing = ps.list.find(x => x.name.toLowerCase() === String(data.name).toLowerCase());
              const id = existing ? existing.id : meta.id || ('p' + Date.now().toString(36) + n);
              if (!existing) ps.list.push({ id, name: data.name, avatar: data.avatar });
              storage.set(KEY_PROFILE(id), data); n++;
            });
            saveProfiles(ps); close(); toast(n + ' perfil(es) importado(s)'); screenProfiles();
          } catch (e) { toast('Ese texto no es una copia válida de esta app'); }
        };
      });
  }

  /* ---------- 18. CÓMO ESTUDIAR (técnicas de memoria) ---------- */
  const TIPS_SHORT = [
    'Dormir después de estudiar ayuda a fijar las palabras. ¡Repasa antes de acostarte!',
    'Di cada palabra en voz alta: oírte a ti mismo la graba mejor.',
    'Inventa una frase sobre tu vida con una palabra de hoy.',
    'Mejor 15 minutos cada día que 2 horas el domingo.',
    'Cuanto más absurda la imagen del truco, mejor se recuerda.',
    'Fallar no es malo: cada fallo le dice al cerebro "esto es importante".',
    'Explica a alguien de tu familia 3 palabras que has aprendido hoy.',
    'Pon notas adhesivas en casa: "fridge", "window", "mirror"...',
  ];
  function screenTips(welcome) {
    const items = [
      ['🔁', 'Repaso espaciado', 'La app te vuelve a preguntar cada palabra justo cuando estás a punto de olvidarla: al día siguiente, a los 3 días, a la semana, a las 2-3 semanas... Así pasa a la memoria de largo plazo con muy poco esfuerzo.'],
      ['🧠', 'Recuerdo activo', 'Intentar recordar (aunque falles) fija mucho más que releer. Por eso aquí siempre tienes que responder antes de ver la solución.'],
      ['🎬', 'Palabra clave', 'Asocia el sonido de la palabra inglesa con una palabra española y crea una imagen loca: "ankle" (tobillo) → un ANCLA atada a tu tobillo.'],
      ['🖼️', 'Imagen + palabra', 'Cada palabra tiene un emoji. Ver y leer a la vez crea dos caminos en tu memoria para llegar a la misma palabra.'],
      ['🗣️', 'Dila en voz alta', 'Escucha la pronunciación y repítela. Usar la voz y el oído ayuda a recordar y mejora tu pronunciación.'],
      ['📦', 'Bloques de 5', 'Las 20 palabras del día llegan en grupos de 5 del mismo tema. Grupos pequeños y relacionados son más fáciles de recordar.'],
      ['✍️', 'Úsala en tu vida', 'Escribe una frase sobre ti con 2-3 palabras nuevas. Lo que conectas contigo se olvida mucho menos.'],
      ['⚠️', 'Falsos amigos', 'Las tarjetas avisan de palabras traicioneras: "embarrassed" no es embarazada, "realise" no es realizar.'],
      ['😴', 'Dormir y constancia', 'El cerebro ordena lo aprendido mientras duermes. Unos minutos cada día valen más que un atracón el fin de semana.'],
    ];
    render(`<div class="topbar"><button class="icon-btn" id="back">←</button><h2 class="grow" style="margin:0">${welcome ? '¡Bienvenido/a!' : 'Cómo estudiar'}</h2></div>
      ${welcome ? `<div class="card" style="margin-bottom:12px"><b>Así funciona:</b> cada día haces una sesión de ~10-15 minutos. Primero repasas palabras de días anteriores y luego aprendes 20 nuevas en bloques de 5. En unas 25 sesiones habrás visto las ${WORDS.length} palabras.</div>` : ''}
      <div class="stack">${items.map(([i, t, d]) => `<div class="card row" style="align-items:flex-start"><div style="font-size:30px">${i}</div><div><h3>${t}</h3><div class="muted">${d}</div></div></div>`).join('')}</div>
      <button class="btn primary block" id="ok" style="margin-top:16px">${welcome ? '¡Empezar! 🚀' : 'Entendido'}</button>`);
    $('#back').onclick = screenHome; $('#ok').onclick = screenHome;
  }

  /* ---------- 19. ARRANQUE ---------- */
  function boot(data) {
    THEMES = data.themes; WORDS = data.words; BY_ID = {};
    WORDS.forEach(w => BY_ID[w.id] = w);
    const ps = profiles();
    if (ps.current && ps.list.some(p => p.id === ps.current) && loadProfile(ps.current)) { selectProfile(ps.current); screenHome(); }
    else screenProfiles();
  }
  // Atajo de teclado: Enter = continuar
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.activeElement && document.activeElement.tagName !== 'INPUT') { const c = $('#cont') || $('#n'); if (c) { e.preventDefault(); c.click(); } }
    if (['1', '2', '3', '4'].includes(e.key) && document.activeElement.tagName !== 'INPUT') { const o = document.querySelectorAll('[data-opt]:not([disabled])')[+e.key - 1]; if (o) o.click(); }
  });
  if (window.VOCAB) boot(window.VOCAB);
  else fetch('words.json').then(r => r.json()).then(boot).catch(() => { app().innerHTML = '<p>No se pudo cargar words.json</p>'; });
})();
