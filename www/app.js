'use strict';
// ================= Speicher =================
const KEY = 'stempeluhr.v1';
const DEFAULT_SETTINGS = { target: 8, days: [1,2,3,4,5], autoBreak: false, startBalance: 0, autoUpdate: true, land: '', vacation: 30, savePhotos: true, checkLaw: true };
let db = load();
function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  d = d && Array.isArray(d.entries) ? d : {};
  const out = {
    entries: d.entries || [], specials: d.specials || [], tags: d.tags || [], trash: d.trash || [],
    settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
  };
  out.entries.forEach(e => { e.tags ||= []; e.breaks ||= []; });
  const cutoff = Date.now() - 30 * 864e5; // Papierkorb nach 30 Tagen leeren
  out.trash = out.trash.filter(t => t.at > cutoff);
  return out;
}
let _idx = null;
function save(rerender = true) { _idx = null; localStorage.setItem(KEY, JSON.stringify(db)); if (rerender) render(); }

// ================= Hilfen =================
const H = 3600000, M = 60000, DAY = 864e5;
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const dateKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const todayKey = () => dateKey(Date.now());
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); };
const hm = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function dur(ms, signed = false) {
  const neg = ms < 0; ms = Math.abs(ms);
  const tot = Math.floor(ms / M + 1e-9);
  const s = `${Math.floor(tot / 60)}:${pad(tot % 60)}`;
  return signed ? (tot === 0 ? '±' : neg ? '−' : '+') + s : (neg ? '−' : '') + s;
}
const durHM = ms => { const t = Math.floor(Math.abs(ms) / M); return `${ms < 0 ? '−' : ''}${pad(Math.floor(t / 60))}h ${pad(t % 60)}m`; };
const fromKeyTime = (key, t) => { const d = parseKey(key); const [h, mi] = t.split(':').map(Number); d.setHours(h, mi, 0, 0); return d.getTime(); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const WD = ['So','Mo','Di','Mi','Do','Fr','Sa'];
const WDL = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cls = ms => ms < 0 ? 'neg' : 'pos';
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }
const longDate = k => parseKey(k).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const shortDate = k => { const d = parseKey(k); return `${WD[d.getDay()]}, ${d.getDate()}.${d.getMonth()+1}.`; };
const mondayOf = k => { const d = parseKey(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dateKey(d); };
function* days(fromK, toK) { for (let k = fromK; k <= toK; k = addDays(k, 1)) yield k; }
const ICON = {
  in: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
};

// ================= Besondere Tage =================
const SPECIAL = {
  urlaub:   { name: 'Urlaub', icon: '🏖️', credit: true },
  krank:    { name: 'Krank', icon: '🤒', credit: true },
  feiertag: { name: 'Feiertag', icon: '🎉', credit: true },
  schule:   { name: 'Schule / Weiterbildung', icon: '🎓', credit: true },
  frei:     { name: 'Sonderurlaub / Frei', icon: '🌴', credit: true },
  abbau:    { name: 'Überstundenabbau', icon: '⏳', credit: false },
};

// ================= Berechnung =================
function idx() {
  if (_idx) return _idx;
  const e = new Map(), s = new Map();
  for (const x of db.entries) { const k = dateKey(x.start); if (!e.has(k)) e.set(k, []); e.get(k).push(x); }
  for (const a of e.values()) a.sort((p, q) => p.start - q.start);
  for (const x of db.specials) s.set(x.date, x);
  const keys = [...e.keys(), ...s.keys()].sort();
  return (_idx = { e, s, first: keys[0] || null });
}
const entriesOf = k => idx().e.get(k) || [];
const specialOf = k => idx().s.get(k) || null;
const holidayOf = k => holidayName(k, db.settings.land);
function calc(e, now = Date.now()) {
  const end = e.end ?? now;
  const gross = Math.max(0, end - e.start);
  let brk = 0;
  for (const b of e.breaks) brk += Math.max(0, Math.min(b.end ?? now, end) - Math.max(b.start, e.start));
  let net = gross - brk, effBreak = brk;
  if (db.settings.autoBreak) {
    const thr = net > 9*H ? 9*H : net > 6*H ? 6*H : 0;
    const req = thr === 9*H ? 45*M : thr === 6*H ? 30*M : 0;
    if (brk < req) { net = Math.max(gross - req, thr); effBreak = gross - net; }
  }
  return { gross, brk: effBreak, net };
}
const netOf = (k, now) => entriesOf(k).reduce((s, e) => s + calc(e, now).net, 0);
const brkOf = (k, now) => entriesOf(k).reduce((s, e) => s + calc(e, now).brk, 0);
function sollOf(k) {
  const d = parseKey(k);
  let s = db.settings.days.includes(d.getDay()) ? db.settings.target * H : 0;
  if (s && holidayOf(k)) s = 0;
  const sp = specialOf(k);
  if (sp && s && SPECIAL[sp.type]?.credit) s = sp.half ? s / 2 : 0;
  return s;
}
// Saldo zählt erst ab dem ersten Eintrag / besonderen Tag
function rangeStats(fromK, toK, now = Date.now()) {
  const first = idx().first, today = todayKey();
  let ist = 0, soll = 0, sollToDate = 0, istToDate = 0, brk = 0, workdays = 0;
  for (const k of days(fromK, toK)) {
    const n = netOf(k, now), s = sollOf(k);
    ist += n; soll += s; brk += brkOf(k, now);
    if (n > 0) workdays++;
    if (first && k >= first && k <= today) { sollToDate += s; istToDate += n; }
  }
  return { ist, soll, saldo: istToDate - sollToDate, brk, workdays };
}
function balanceUntil(k, now = Date.now()) {
  let bal = (db.settings.startBalance || 0) * H;
  const first = idx().first; if (!first || k < first) return bal;
  const end = k < todayKey() ? k : todayKey();
  for (const d of days(first, end)) bal += netOf(d, now) - sollOf(d);
  return bal;
}
const active = () => db.entries.find(e => e.end == null);
const openBreak = e => e?.breaks.find(b => b.end == null);

// ================= Stempeln =================
function clockIn() { if (active()) return; db.entries.push({ id: uid(), start: Date.now(), end: null, breaks: [], tags: [], note: '' }); ui.date = todayKey(); save(); toast('Eingestempelt'); }
function clockOut() { const e = active(); if (!e) return; const now = Date.now(); const b = openBreak(e); if (b) b.end = now; e.end = now; save(); toast('Ausgestempelt – ' + dur(calc(e).net) + ' gearbeitet'); }
function breakStart() { const e = active(); if (!e) return; e.breaks.push({ start: Date.now(), end: null }); save(); toast('Pause gestartet'); }
function breakEnd() { const b = openBreak(active()); if (!b) return; b.end = Date.now(); save(); toast('Pause beendet'); }

// ================= Papierkorb =================
function trashEntry(e) { db.entries = db.entries.filter(x => x.id !== e.id); db.trash.push({ id: uid(), kind: 'entry', item: e, at: Date.now() }); }
function trashSpecial(s) { db.specials = db.specials.filter(x => x !== s && x.id !== s.id); db.trash.push({ id: uid(), kind: 'special', item: s, at: Date.now() }); }

// ================= Navigation =================
const VIEWS = {
  menu: 'Menü', tag: 'Tag', woche: 'Woche', monat: 'Monat', jahr: 'Jahr', besondere: 'Besondere Tage', suchen: 'Suchen',
  tags: 'Tags', diagramm: 'Diagramm', inkonsistent: 'Inkonsistentes', fotos: 'Fotos', auszug: 'Auszug', papierkorb: 'Papierkorb', settings: 'Einstellungen',
};
const ROOT = ['menu', 'tag', 'settings'];
const ui = { view: 'tag', date: todayKey(), week: mondayOf(todayKey()), month: todayKey().slice(0, 7), year: +todayKey().slice(0, 4),
  chart: 'woche', chartRef: todayKey(), q: '', qTag: '', specYear: +todayKey().slice(0, 4),
  rep: { preset: 'monat', from: todayKey().slice(0, 8) + '01', to: todayKey() } };
function go(view, opts = {}) {
  Object.assign(ui, opts);
  if (location.hash.slice(1) !== view) location.hash = view; else show();
}
function show() {
  let v = location.hash.slice(1) || 'tag';
  if (!VIEWS[v]) v = 'tag';
  ui.view = v;
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'v-' + v));
  document.querySelectorAll('nav.bottom button').forEach(b => b.classList.toggle('active',
    b.dataset.go === v || (b.dataset.go === 'menu' && !ROOT.includes(v))));
  render(); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', show);
document.querySelectorAll('nav.bottom button').forEach(b => b.onclick = () => {
  if (b.dataset.go === 'tag' && ui.view === 'tag') { ui.date = todayKey(); render(); return; }
  go(b.dataset.go);
});
$('topBack').onclick = () => history.length > 1 ? history.back() : go('menu');

function topbar(actions = '') {
  $('topTitle').textContent = VIEWS[ui.view];
  $('topBack').style.visibility = ROOT.includes(ui.view) ? 'hidden' : 'visible';
  $('topActions').innerHTML = actions || '<span style="width:48px"></span>';
}
const act = (fn, icon, label) => `<button class="ib" onclick="${fn}" aria-label="${label}">${icon}</button>`;

function render() {
  const f = RENDER[ui.view];
  if (f) f();
}

// ================= Ansicht: Menü =================
const TI = {
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/><text x="12" y="18" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">1</text></svg>',
  woche: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/><text x="12" y="18" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">7</text></svg>',
  monat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/><text x="12" y="18" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">31</text></svg>',
  jahr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/><text x="12" y="18" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">12</text></svg>',
  besondere: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>',
  suchen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>',
  tags: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5" fill="currentColor"/></svg>',
  diagramm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 20v-6M10 20V9M15 20v-8M20 20V5"/></svg>',
  inkonsistent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/></svg>',
  fotos: ICON.cam,
  auszug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
  papierkorb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M8 9h8M8 12h8M8 15h5"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  hilfe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5M12 17v.01"/></svg>',
};
const tile = (v, label, onclick, badge) => `<button class="tile" onclick="${onclick || `go('${v}')`}"><span class="ti">${TI[v]}</span>${label}${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
const RENDER = {};
RENDER.menu = () => {
  topbar();
  const n = issues().length;
  $('v-menu').innerHTML = `
    <div class="sec">ANSICHTEN</div>
    <div class="tiles">${tile('tag', 'Tag', "go('tag',{date:todayKey()})")}${tile('woche', 'Woche')}${tile('monat', 'Monat')}${tile('jahr', 'Jahr')}</div>
    <div class="sec">WERKZEUGE</div>
    <div class="tiles">${tile('besondere', 'Besondere')}${tile('suchen', 'Suchen')}${tile('tags', 'Tags')}${tile('diagramm', 'Diagramm')}
      ${tile('inkonsistent', 'Prüfen', null, n ? (n > 99 ? '99+' : n) : '')}${tile('fotos', 'Fotos')}${tile('auszug', 'Auszug')}${tile('papierkorb', 'Papierkorb', null, db.trash.length || '')}</div>
    <div class="sec">MEHR</div>
    <div class="tiles">${tile('scan', 'Zettel fotografieren', 'scanPick(true)')}${tile('fotos', 'Zettel aus Galerie', 'scanPick(false)')}${tile('settings', 'Einstellungen')}
      ${tile('hilfe', 'Hilfe', "openLink('https://github.com/Barry2040/stempeluhr#readme')")}</div>`;
};
function openLink(url) { location.href = url; }

// ================= Ansicht: Tag =================
function timelineHTML(e, now) {
  const c = calc(e, now), parts = [];
  const pts = [{ t: e.start, k: 'in' }];
  for (const b of e.breaks) { pts.push({ t: b.start, k: 'out', pause: true }); if (b.end) pts.push({ t: b.end, k: 'in' }); }
  if (e.end) pts.push({ t: e.end, k: 'out' });
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], nx = pts[i + 1];
    parts.push(`<div class="tl-ev ${p.k}"><span class="tl-dot">${ICON[p.k]}</span><b>${hm(p.t)}</b>${p.k === 'out' && p.pause ? '<span class="muted">Pause</span>' : ''}</div>`);
    if (nx) parts.push(p.k === 'in'
      ? `<div class="tl-seg">Arbeit · <b class="t">${durHM(nx.t - p.t)}</b></div>`
      : `<div class="tl-seg pause">Pause · <span class="t">${durHM(nx.t - p.t)}</span></div>`);
    else if (!e.end) parts.push(p.k === 'in'
      ? `<div class="tl-seg run">Arbeit läuft · <b class="t">${durHM(now - p.t)}</b></div>`
      : `<div class="tl-seg pause run">Pause läuft · <span class="t">${durHM(now - p.t)}</span></div>`);
  }
  const tags = e.tags.map(tagChip).join('');
  const meta = (tags || e.note) ? `<div class="tl-meta">${tags}${e.note ? `<div class="muted">${esc(e.note)}</div>` : ''}</div>` : '';
  return `<div class="tl click" onclick="openEdit('${e.id}')">${parts.join('')}${meta}<div class="tl-meta muted">Netto ${dur(c.net)} · Pause ${dur(c.brk)} · antippen zum Bearbeiten</div></div>`;
}
function tagChip(id) { const t = db.tags.find(x => x.id === id); return t ? `<span class="chip" style="background:${t.color}33;color:${t.color}">${esc(t.name)}</span>` : ''; }
RENDER.tag = () => {
  topbar(act("openShareDay()", ICON.share, 'Tag teilen') + act("openEdit(null, ui.date)", ICON.plus, 'Eintrag hinzufügen'));
  const now = Date.now(), k = ui.date, isToday = k === todayKey();
  const net = netOf(k, now), soll = sollOf(k), list = entriesOf(k), sp = specialOf(k), hol = holidayOf(k);
  const bal = balanceUntil(todayKey(), now);
  const e = active(), b = openBreak(e);
  let clock = '';
  if (isToday) {
    const mode = e ? (b ? 'pause' : 'work') : 'off';
    clock = `<div class="card clock">
      <div class="state"><span class="dot ${mode === 'off' ? '' : mode}"></span>${mode === 'off' ? 'Nicht eingestempelt' : mode === 'work' ? 'Bei der Arbeit seit ' + hm(e.start) : 'Pause seit ' + hm(b.start)}</div>
      <div class="big">${mode === 'pause' ? dur(now - b.start) : dur(net)}</div>
      <div class="btns">${mode === 'off' ? `<button class="primary full" style="font-size:18px;padding:16px" onclick="clockIn()">Einstempeln</button>`
        : mode === 'work' ? `<button class="warn" onclick="breakStart()">Pause</button><button class="danger" onclick="clockOut()">Ausstempeln</button>`
        : `<button class="primary" onclick="breakEnd()">Pause beenden</button><button class="danger" onclick="clockOut()">Ausstempeln</button>`}</div>
    </div>`;
  }
  const specCard = (sp || hol) ? `<div class="card daynote ${sp ? 'click' : ''}" ${sp ? `onclick="openSpecial('${sp.id}')"` : ''}>
      <span class="ico">${sp ? SPECIAL[sp.type].icon : '🎉'}</span>
      <div><b>${sp ? SPECIAL[sp.type].name + (sp.half ? ' (halber Tag)' : '') : hol}</b>
      <div class="muted">${sp ? (sp.note ? esc(sp.note) + ' · ' : '') + (SPECIAL[sp.type].credit ? 'zählt als Soll erfüllt' : 'Soll bleibt, wird vom Konto abgezogen') : 'Gesetzlicher Feiertag – kein Soll'}</div></div></div>` : '';
  const empty = !list.length ? `<div class="empty">${isToday ? 'Heute noch nichts gestempelt' : 'Keine Einträge an diesem Tag'}</div>` : '';
  $('v-tag').innerHTML = `
    <div class="datebar"><button onclick="ui.date=addDays(ui.date,-1);render()" aria-label="Vorheriger Tag">‹</button>
      <h2 onclick="pickDate()">${longDate(k)}</h2>
      <button onclick="ui.date=addDays(ui.date,1);render()" aria-label="Nächster Tag">›</button></div>
    <div class="card stats">
      <div><span>Gearbeitet</span><b>${durHM(net)}</b></div>
      <div><span>Tagessaldo</span><b class="${cls(net - soll)}">${net - soll >= 0 ? '+' : ''}${durHM(net - soll)}</b></div>
      <div><span>Stundenkonto</span><b class="${cls(bal)}">${bal >= 0 ? '+' : ''}${durHM(bal)}</b></div>
    </div>
    ${clock}${specCard}
    <div class="card">${list.map((x, i) => (i ? `<div class="tl-seg gap">Unterbrechung · ${durHM(x.start - (list[i-1].end ?? now))}</div>` : '') + timelineHTML(x, now)).join('') || empty}</div>
    <div class="card" id="dayPhotos" hidden><h3>Fotos</h3><div class="thumbs" id="dayThumbs"></div></div>
    <div class="btns" style="grid-template-columns:1fr 1fr 1fr">
      <button class="small" onclick="openEdit(null, ui.date)">+ Eintrag</button>
      <button class="small" onclick="openSpecial(null, ui.date)">+ Besonderer Tag</button>
      <button class="small" onclick="scanPick(true)">📷 Zettel</button>
    </div>
    <p class="muted" style="text-align:center">Soll an diesem Tag: ${dur(soll)} · Wischen zum Blättern</p>`;
  loadDayPhotos(k);
};
function pickDate() {
  const i = document.createElement('input'); i.type = 'date'; i.value = ui.date;
  i.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(i);
  i.onchange = () => { if (i.value) { ui.date = i.value; render(); } i.remove(); };
  i.onblur = () => setTimeout(() => i.remove(), 300);
  i.showPicker ? i.showPicker() : i.click();
}
// Wischen auf der Tagesansicht
(() => {
  let x0 = null, y0 = null;
  const el = $('v-tag');
  el.addEventListener('touchstart', ev => { x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', ev => {
    if (x0 == null) return;
    const dx = ev.changedTouches[0].clientX - x0, dy = ev.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) { ui.date = addDays(ui.date, dx < 0 ? 1 : -1); render(); }
  });
})();
function openShareDay() {
  const k = ui.date, list = entriesOf(k), sp = specialOf(k);
  const lines = [`${longDate(k)}`];
  if (sp) lines.push(`${SPECIAL[sp.type].icon} ${SPECIAL[sp.type].name}${sp.half ? ' (halber Tag)' : ''}`);
  for (const e of list) { const c = calc(e); lines.push(`${hm(e.start)}–${e.end ? hm(e.end) : 'läuft'}  Pause ${dur(c.brk)}  Arbeit ${dur(c.net)}${e.note ? '  ' + e.note : ''}`); }
  lines.push(`Gesamt: ${dur(netOf(k))} (Soll ${dur(sollOf(k))})`);
  shareText(lines.join('\n'));
}

// ================= Ansicht: Woche =================
function dayRowHTML(k, now) {
  const n = netOf(k, now), s = sollOf(k), sp = specialOf(k), hol = holidayOf(k), l = entriesOf(k);
  const pct = s ? Math.min(100, n / s * 100) : (n ? 100 : 0);
  const info = [sp ? `${SPECIAL[sp.type].icon} ${SPECIAL[sp.type].name}` : '', hol ? `🎉 ${hol}` : '',
    l.length ? l.map(e => `${hm(e.start)}–${e.end ? hm(e.end) : '…'}`).join(', ') : ''].filter(Boolean).join(' · ');
  return `<div class="row click" onclick="go('tag',{date:'${k}'})" style="display:block">
    <div style="display:flex;justify-content:space-between"><b>${shortDate(k)}</b>
      <span class="t">${dur(n)} <span class="muted">/ ${dur(s)}</span></span></div>
    ${info ? `<div class="muted">${info}</div>` : ''}
    ${s || n ? `<div class="bar"><i class="${n >= s && s ? 'over' : ''}" style="width:${pct}%"></i></div>` : ''}</div>`;
}
RENDER.woche = () => {
  topbar(act("go('auszug',{rep:{preset:'custom',from:ui.week,to:addDays(ui.week,6)}})", ICON.share, 'Auszug'));
  const now = Date.now(), from = ui.week, to = addDays(from, 6);
  const st = rangeStats(from, to, now);
  const kw = isoWeek(parseKey(from));
  $('v-woche').innerHTML = `
    <div class="datebar"><button onclick="ui.week=addDays(ui.week,-7);render()">‹</button>
      <h2 onclick="ui.week=mondayOf(todayKey());render()">KW ${kw} · ${parseKey(from).getDate()}.${parseKey(from).getMonth()+1}. – ${parseKey(to).getDate()}.${parseKey(to).getMonth()+1}.</h2>
      <button onclick="ui.week=addDays(ui.week,7);render()">›</button></div>
    ${statsCard(st)}
    <div class="card">${[...days(from, to)].map(k => dayRowHTML(k, now)).join('')}</div>`;
};
function isoWeek(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / DAY + 1) / 7); }
const statsCard = st => `<div class="card stats">
  <div><span>Ist</span><b>${dur(st.ist)}</b></div><div><span>Soll</span><b>${dur(st.soll)}</b></div>
  <div><span>Saldo</span><b class="${cls(st.saldo)}">${dur(st.saldo, true)}</b></div></div>`;

// ================= Ansicht: Monat =================
RENDER.monat = () => {
  const [y, m] = ui.month.split('-').map(Number);
  const from = `${ui.month}-01`, to = dateKey(new Date(y, m, 0));
  topbar(act(`go('auszug',{rep:{preset:'custom',from:'${from}',to:'${to}'}})`, ICON.share, 'Auszug'));
  const now = Date.now(), st = rangeStats(from, to, now), today = todayKey();
  const lead = (parseKey(from).getDay() + 6) % 7;
  let cells = ['Mo','Di','Mi','Do','Fr','Sa','So'].map(w => `<div class="wd">${w}</div>`).join('') + '<div></div>'.repeat(lead);
  for (const k of days(from, to)) {
    const n = netOf(k, now), s = sollOf(k), sp = specialOf(k), hol = holidayOf(k);
    const c = sp || hol ? 'spec' : n && s && n >= s - M ? 'full' : n ? 'part' : (!s ? 'off' : '');
    cells += `<div class="d ${c} ${k === today ? 'today' : ''}" onclick="go('tag',{date:'${k}'})">
      <span class="n">${+k.slice(8)}</span><span>${sp ? SPECIAL[sp.type].icon : hol ? '🎉' : ''}</span><span class="h">${n ? dur(n) : ''}</span></div>`;
  }
  $('v-monat').innerHTML = `
    <div class="datebar"><button onclick="shiftMonth(-1)">‹</button>
      <h2 onclick="ui.month=todayKey().slice(0,7);render()">${MONTHS[m-1]} ${y}</h2>
      <button onclick="shiftMonth(1)">›</button></div>
    ${statsCard(st)}
    <div class="card"><div class="cal">${cells}</div>
      <p class="muted" style="margin:10px 0 0">🟩 Soll erreicht · 🟧 teilweise · 🟦 besonderer Tag / Feiertag</p></div>
    <div class="card"><div class="row"><span>Arbeitstage mit Einträgen</span><b>${st.workdays}</b></div>
      <div class="row"><span>Pausen gesamt</span><b>${dur(st.brk)}</b></div>
      <div class="row"><span>Ø pro Arbeitstag</span><b>${st.workdays ? dur(st.ist / st.workdays) : '–'}</b></div></div>`;
};
function shiftMonth(n) { const [y, m] = ui.month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); ui.month = `${d.getFullYear()}-${pad(d.getMonth()+1)}`; render(); }

// ================= Ansicht: Jahr =================
function vacationUsed(y) { return db.specials.filter(s => s.type === 'urlaub' && s.date.startsWith(y + '-')).reduce((a, s) => a + (s.half ? .5 : 1), 0); }
RENDER.jahr = () => {
  const y = ui.year;
  topbar(act(`go('auszug',{rep:{preset:'custom',from:'${y}-01-01',to:'${y}-12-31'}})`, ICON.share, 'Auszug'));
  const now = Date.now(), st = rangeStats(`${y}-01-01`, `${y}-12-31`, now);
  const rows = MONTHS.map((name, i) => {
    const from = `${y}-${pad(i+1)}-01`, to = dateKey(new Date(y, i + 1, 0)), s = rangeStats(from, to, now);
    const pct = s.soll ? Math.min(100, s.ist / s.soll * 100) : 0;
    return `<div class="row click" style="display:block" onclick="go('monat',{month:'${y}-${pad(i+1)}'})">
      <div style="display:flex;justify-content:space-between"><b>${name}</b><span class="t">${dur(s.ist)} <span class="muted">/ ${dur(s.soll)}</span> · <span class="${cls(s.saldo)}">${dur(s.saldo, true)}</span></span></div>
      <div class="bar"><i class="${s.ist >= s.soll && s.soll ? 'over' : ''}" style="width:${pct}%"></i></div></div>`;
  }).join('');
  const cnt = t => db.specials.filter(s => s.type === t && s.date.startsWith(y + '-')).reduce((a, s) => a + (s.half ? .5 : 1), 0);
  $('v-jahr').innerHTML = `
    <div class="datebar"><button onclick="ui.year--;render()">‹</button><h2 onclick="ui.year=new Date().getFullYear();render()">${y}</h2><button onclick="ui.year++;render()">›</button></div>
    ${statsCard(st)}
    <div class="card stats">
      <div><span>Urlaub</span><b>${cnt('urlaub')} / ${db.settings.vacation}</b></div>
      <div><span>Krank</span><b>${cnt('krank')}</b></div>
      <div><span>Rest-Urlaub</span><b>${db.settings.vacation - cnt('urlaub')}</b></div></div>
    <div class="card">${rows}</div>`;
};

// ================= Besondere Tage =================
RENDER.besondere = () => {
  topbar(act("openSpecial(null, todayKey())", ICON.plus, 'Hinzufügen'));
  const y = ui.specYear;
  const list = db.specials.filter(s => s.date.startsWith(y + '-')).sort((a, b) => b.date.localeCompare(a.date));
  const counts = Object.entries(SPECIAL).map(([t, d]) => {
    const c = list.filter(s => s.type === t).reduce((a, s) => a + (s.half ? .5 : 1), 0);
    return c ? `<span class="chip">${d.icon} ${d.name}: ${c}</span>` : '';
  }).join('');
  const hol = Object.entries(holidaysOf(y, db.settings.land));
  $('v-besondere').innerHTML = `
    <div class="datebar"><button onclick="ui.specYear--;render()">‹</button><h2>${y}</h2><button onclick="ui.specYear++;render()">›</button></div>
    <div class="card">${counts || '<span class="muted">Noch keine besonderen Tage in diesem Jahr</span>'}
      <div class="btns" style="margin-top:12px"><button class="primary full" onclick="openSpecial(null, todayKey())">+ Urlaub, Krank & Co. eintragen</button></div></div>
    <div class="card"><h3>Eingetragen</h3>${list.map(s => `<div class="row click" onclick="openSpecial('${s.id}')">
      <span>${SPECIAL[s.type].icon} <b>${shortDate(s.date)}</b> ${SPECIAL[s.type].name}${s.half ? ' (½)' : ''}</span><span class="muted">${esc(s.note || '')}</span></div>`).join('') || '<div class="empty">–</div>'}</div>
    <div class="card"><h3>Gesetzliche Feiertage ${y}</h3><p class="muted" style="margin-top:0">${esc(BUNDESLAENDER[db.settings.land])} · ändern in den Einstellungen</p>
      ${hol.map(([k, n]) => `<div class="row click" onclick="go('tag',{date:'${k}'})"><span>${shortDate(k)}</span><span>${n}</span></div>`).join('')}</div>`;
};
let specEditing = null;
function openSpecial(id, key) {
  const s = id ? db.specials.find(x => x.id === id) : null;
  specEditing = s;
  $('sType').innerHTML = Object.entries(SPECIAL).map(([k, d]) => `<option value="${k}">${d.icon} ${d.name}</option>`).join('');
  $('sType').value = s?.type || 'urlaub';
  $('sFrom').value = s?.date || key || ui.date; $('sTo').value = s?.date || key || ui.date;
  $('sToWrap').hidden = !!s; $('sHalf').checked = !!s?.half; $('sNote').value = s?.note || '';
  $('specTitle').textContent = s ? 'Besonderen Tag bearbeiten' : 'Besonderer Tag';
  $('sHint').textContent = s ? '' : 'Bei einem Zeitraum werden nur Arbeitstage eingetragen (Wochenenden und Feiertage werden übersprungen).';
  $('sDelete').hidden = !s;
  $('specDlg').showModal();
}
$('specForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const type = $('sType').value, half = $('sHalf').checked, note = $('sNote').value.trim();
  if (specEditing) { Object.assign(specEditing, { type, half, note, date: $('sFrom').value }); }
  else {
    const from = $('sFrom').value, to = $('sTo').value && $('sTo').value >= from ? $('sTo').value : from;
    let n = 0;
    for (const k of days(from, to)) {
      if (from !== to && (!db.settings.days.includes(parseKey(k).getDay()) || holidayOf(k))) continue;
      const old = db.specials.find(s => s.date === k); if (old) trashSpecial(old);
      db.specials.push({ id: uid(), date: k, type, half, note }); n++;
    }
    if (n > 1) toast(`${n} Tage eingetragen`);
  }
  $('specDlg').close(); save();
});
$('sDelete').onclick = () => { if (specEditing) { trashSpecial(specEditing); $('specDlg').close(); save(); toast('In den Papierkorb verschoben'); } };

// ================= Suchen =================
RENDER.suchen = () => {
  topbar();
  const sec = $('v-suchen');
  if (!sec.dataset.init) {
    sec.dataset.init = 1;
    sec.innerHTML = `<div class="card"><input type="search" id="qText" placeholder="Notiz, Tag oder Datum (z.B. 05.11.) suchen">
      <label>Tag</label><select id="qTag"></select>
      <div class="inline"><div><label>Von</label><input type="date" id="qFrom"></div><div><label>Bis</label><input type="date" id="qTo"></div></div></div>
      <div id="qResult"></div>`;
    ['qText', 'qTag', 'qFrom', 'qTo'].forEach(id => $(id).addEventListener('input', searchResults));
  }
  $('qTag').innerHTML = '<option value="">Alle</option>' + db.tags.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  $('qTag').value = ui.qTag;
  searchResults();
};
function searchResults() {
  const q = $('qText').value.trim().toLowerCase(), tag = ui.qTag = $('qTag').value, from = $('qFrom').value, to = $('qTo').value;
  const now = Date.now();
  let res = db.entries.filter(e => {
    const k = dateKey(e.start), d = parseKey(k);
    if (from && k < from) return false; if (to && k > to) return false;
    if (tag && !e.tags.includes(tag)) return false;
    if (!q) return true;
    const hay = [e.note, ...e.tags.map(id => db.tags.find(t => t.id === id)?.name), `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`,
      `${d.getDate()}.${d.getMonth()+1}.`, WDL[d.getDay()], MONTHS[d.getMonth()]].join(' ').toLowerCase();
    return hay.includes(q);
  }).sort((a, b) => b.start - a.start);
  const sum = res.reduce((s, e) => s + calc(e, now).net, 0);
  const specs = q ? db.specials.filter(s => (SPECIAL[s.type].name + ' ' + (s.note || '')).toLowerCase().includes(q) && (!from || s.date >= from) && (!to || s.date <= to)) : [];
  $('qResult').innerHTML = `<div class="card"><div class="row"><b>${res.length} Einträge</b><b class="t">${dur(sum)}</b></div>
    ${res.slice(0, 200).map(e => `<div class="row click" onclick="go('tag',{date:'${dateKey(e.start)}'})"><div><b>${shortDate(dateKey(e.start))}</b> ${parseKey(dateKey(e.start)).getFullYear()}
      <div class="muted">${hm(e.start)}–${e.end ? hm(e.end) : '…'} ${e.tags.map(tagChip).join('')} ${esc(e.note || '')}</div></div><b class="t">${dur(calc(e, now).net)}</b></div>`).join('')}</div>
    ${specs.length ? `<div class="card"><h3>Besondere Tage</h3>${specs.map(s => `<div class="row click" onclick="go('tag',{date:'${s.date}'})"><span>${SPECIAL[s.type].icon} ${shortDate(s.date)} ${s.date.slice(0,4)}</span><span>${SPECIAL[s.type].name}</span></div>`).join('')}</div>` : ''}`;
}

// ================= Tags =================
const COLORS = ['#0f766e','#2563eb','#7c3aed','#db2777','#dc2626','#ea580c','#ca8a04','#16a34a','#0891b2','#475569'];
RENDER.tags = () => {
  topbar(act('openTag(null)', ICON.plus, 'Neuer Tag'));
  const now = Date.now(), y = new Date().getFullYear();
  $('v-tags').innerHTML = `<div class="card"><p class="muted" style="margin-top:0">Mit Tags markierst du Einträge, z.B. nach Projekt, Baustelle oder Kunde. Zuweisen im Eintrag, auswerten unter Suchen, Diagramm und Auszug.</p>
    ${db.tags.map(t => {
      const es = db.entries.filter(e => e.tags.includes(t.id));
      const yr = es.filter(e => new Date(e.start).getFullYear() === y).reduce((s, e) => s + calc(e, now).net, 0);
      return `<div class="row click" onclick="openTag('${t.id}')"><span><span class="swatch" style="background:${t.color}"></span><b>${esc(t.name)}</b></span><span class="muted">${es.length} Einträge · ${dur(yr)} in ${y}</span></div>`;
    }).join('') || '<div class="empty">Noch keine Tags</div>'}
    <div class="btns" style="margin-top:12px"><button class="primary full" onclick="openTag(null)">+ Neuer Tag</button></div></div>`;
};
let tagEditing = null, tagColor = COLORS[0];
function openTag(id) {
  tagEditing = id ? db.tags.find(t => t.id === id) : null;
  tagColor = tagEditing?.color || COLORS[db.tags.length % COLORS.length];
  $('tName').value = tagEditing?.name || '';
  $('tagTitle').textContent = tagEditing ? 'Tag bearbeiten' : 'Neuer Tag';
  $('tDelete').hidden = !tagEditing;
  drawColors(); $('tagDlg').showModal();
}
function drawColors() { $('tColors').innerHTML = COLORS.map(c => `<button type="button" onclick="tagColor='${c}';drawColors()" style="width:36px;height:36px;border-radius:50%;padding:0;background:${c};${c === tagColor ? 'outline:3px solid var(--text);outline-offset:2px' : ''}"></button>`).join(''); }
$('tagForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const name = $('tName').value.trim(); if (!name) return;
  if (tagEditing) Object.assign(tagEditing, { name, color: tagColor }); else db.tags.push({ id: uid(), name, color: tagColor });
  $('tagDlg').close(); save();
});
$('tDelete').onclick = () => {
  if (!tagEditing || !confirm(`Tag „${tagEditing.name}“ löschen? Die Einträge bleiben erhalten.`)) return;
  const id = tagEditing.id; db.tags = db.tags.filter(t => t.id !== id); db.entries.forEach(e => e.tags = e.tags.filter(x => x !== id));
  $('tagDlg').close(); save();
};

// ================= Diagramm =================
RENDER.diagramm = () => {
  topbar();
  const now = Date.now(), mode = ui.chart, ref = ui.chartRef;
  let bars = [], title = '';
  if (mode === 'woche') {
    const from = mondayOf(ref); title = `KW ${isoWeek(parseKey(from))}`;
    bars = [...days(from, addDays(from, 6))].map(k => ({ l: WD[parseKey(k).getDay()], v: netOf(k, now), s: sollOf(k), k }));
  } else if (mode === 'monat') {
    const d = parseKey(ref), y = d.getFullYear(), m = d.getMonth(); title = `${MONTHS[m]} ${y}`;
    bars = [...days(dateKey(new Date(y, m, 1)), dateKey(new Date(y, m + 1, 0)))].map(k => ({ l: String(+k.slice(8)), v: netOf(k, now), s: sollOf(k), k }));
  } else {
    const y = parseKey(ref).getFullYear(); title = String(y);
    bars = MONTHS.map((n, i) => { const st = rangeStats(`${y}-${pad(i+1)}-01`, dateKey(new Date(y, i + 1, 0)), now); return { l: n.slice(0, 3), v: st.ist, s: st.soll }; });
  }
  const W = 340, Hh = 180, pl = 30, pb = 22, max = Math.max(1, ...bars.map(b => Math.max(b.v, b.s))) * 1.1;
  const bw = (W - pl) / bars.length, ys = v => Hh - pb - (v / max) * (Hh - pb - 8);
  const step = max / H > 150 ? 50 : max / H > 60 ? 20 : max / H > 20 ? 5 : 2;
  let grid = '';
  for (let h = 0; h * H <= max; h += step) grid += `<line x1="${pl}" x2="${W}" y1="${ys(h*H)}" y2="${ys(h*H)}" stroke="var(--line)"/><text x="${pl-4}" y="${ys(h*H)+3}" font-size="9" text-anchor="end" fill="var(--muted)">${h}h</text>`;
  const svg = bars.map((b, i) => {
    const x = pl + i * bw + bw * .15, w = bw * .7;
    return `<g ${b.k ? `onclick="go('tag',{date:'${b.k}'})" style="cursor:pointer"` : ''}>
      <rect x="${x}" y="${ys(b.v)}" width="${w}" height="${Math.max(0, Hh - pb - ys(b.v))}" rx="2" fill="${b.v >= b.s && b.s ? 'var(--ok)' : 'var(--accent)'}"/>
      ${b.s ? `<line x1="${x - 1}" x2="${x + w + 1}" y1="${ys(b.s)}" y2="${ys(b.s)}" stroke="var(--warn)" stroke-width="2"/>` : ''}
      ${bars.length <= 12 || i % 5 === 0 || i === bars.length - 1 ? `<text x="${x + w/2}" y="${Hh - 6}" font-size="9" text-anchor="middle" fill="var(--muted)">${b.l}</text>` : ''}</g>`;
  }).join('');
  const sum = bars.reduce((s, b) => s + b.v, 0), soll = bars.reduce((s, b) => s + b.s, 0);
  // Verteilung nach Tags im Zeitraum
  const rangeFrom = mode === 'jahr' ? `${parseKey(ref).getFullYear()}-01-01` : bars[0].k, rangeTo = mode === 'jahr' ? `${parseKey(ref).getFullYear()}-12-31` : bars[bars.length - 1].k;
  const byTag = new Map();
  for (const e of db.entries) { const k = dateKey(e.start); if (k < rangeFrom || k > rangeTo) continue; const n = calc(e, now).net; for (const t of (e.tags.length ? e.tags : [''])) byTag.set(t, (byTag.get(t) || 0) + n); }
  const tagRows = [...byTag.entries()].sort((a, b) => b[1] - a[1]).map(([id, v]) => {
    const t = db.tags.find(x => x.id === id);
    return `<div class="row"><span><span class="swatch" style="background:${t?.color || 'var(--pause)'}"></span>${t ? esc(t.name) : 'ohne Tag'}</span><span class="t">${dur(v)} · ${sum ? Math.round(v / sum * 100) : 0}%</span></div>`;
  }).join('');
  const shift = n => mode === 'woche' ? `ui.chartRef=addDays(ui.chartRef,${7*n})` : mode === 'monat' ? `ui.chartRef=(d=>dateKey(new Date(d.getFullYear(),d.getMonth()+${n},1)))(parseKey(ui.chartRef))` : `ui.chartRef=(d=>dateKey(new Date(d.getFullYear()+${n},0,1)))(parseKey(ui.chartRef))`;
  $('v-diagramm').innerHTML = `
    <div class="seg">${['woche','monat','jahr'].map(m => `<button class="${m === mode ? 'on' : ''}" onclick="ui.chart='${m}';render()">${VIEWS[m]}</button>`).join('')}</div>
    <div class="datebar"><button onclick="${shift(-1)};render()">‹</button><h2>${title}</h2><button onclick="${shift(1)};render()">›</button></div>
    <div class="card"><svg class="chart" viewBox="0 0 ${W} ${Hh}">${grid}${svg}</svg>
      <p class="muted" style="margin:8px 0 0"><span class="swatch" style="background:var(--accent)"></span>Ist <span class="swatch" style="background:var(--ok);margin-left:10px"></span>Soll erreicht <span class="swatch" style="background:var(--warn);margin-left:10px;border-radius:2px;height:4px"></span>Soll</p></div>
    <div class="card stats"><div><span>Ist</span><b>${dur(sum)}</b></div><div><span>Soll</span><b>${dur(soll)}</b></div><div><span>Differenz</span><b class="${cls(sum - soll)}">${dur(sum - soll, true)}</b></div></div>
    ${tagRows ? `<div class="card"><h3>Nach Tags</h3>${tagRows}</div>` : ''}`;
};

// ================= Inkonsistentes =================
function issues() {
  const out = [], now = Date.now(), first = idx().first, today = todayKey();
  if (!first) return out;
  const sorted = [...db.entries].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i], k = dateKey(e.start), end = e.end ?? now;
    if (e.end == null && now - e.start > 14 * H) out.push({ k, t: '⏰ Eintrag läuft seit über 14 Stunden – Ausstempeln vergessen?' });
    if (e.end != null && e.breaks.some(b => b.end == null)) out.push({ k, t: '☕ Offene Pause in einem beendeten Eintrag' });
    if (e.breaks.some(b => b.start < e.start || (b.end ?? now) > end)) out.push({ k, t: '☕ Pause liegt außerhalb der Arbeitszeit' });
    const nx = sorted[i + 1];
    if (nx && nx.start < end) out.push({ k, t: `⛔ Überschneidung mit dem Eintrag ab ${hm(nx.start)} (${shortDate(dateKey(nx.start))})` });
    if (db.settings.checkLaw && nx && e.end != null && dateKey(nx.start) !== k && nx.start - e.end < 11 * H && nx.start > e.end)
      out.push({ k: dateKey(nx.start), t: `🛌 Nur ${dur(nx.start - e.end)} Ruhezeit seit dem Vortag (gesetzlich 11 Std.)` });
  }
  for (const k of days(first, addDays(today, -1))) {
    const n = netOf(k, now), l = entriesOf(k);
    if (db.settings.checkLaw && n > 10 * H) out.push({ k, t: `📈 ${dur(n)} gearbeitet – mehr als 10 Stunden (Arbeitszeitgesetz)` });
    if (db.settings.checkLaw && !db.settings.autoBreak && l.length) {
      const gross = l.reduce((s, e) => s + calc(e, now).gross, 0), b = gross - n;
      if (n > 9 * H && b < 45 * M) out.push({ k, t: `☕ Nur ${dur(b)} Pause bei über 9 Std. (Pflicht: 45 Min.)` });
      else if (n > 6 * H && b < 30 * M) out.push({ k, t: `☕ Nur ${dur(b)} Pause bei über 6 Std. (Pflicht: 30 Min.)` });
    }
    if (sollOf(k) > 0 && !l.length && !specialOf(k)) out.push({ k, t: '❓ Arbeitstag ohne Eintrag – Urlaub, krank oder vergessen?', missing: true });
  }
  return out.sort((a, b) => b.k.localeCompare(a.k));
}
RENDER.inkonsistent = () => {
  topbar();
  const list = issues();
  $('v-inkonsistent').innerHTML = `<div class="card"><p class="muted" style="margin-top:0">Die App prüft deine Einträge auf vergessene Stempel, Überschneidungen, fehlende Pausen, Ruhezeiten und Arbeitstage ohne Eintrag.</p>
    ${list.length ? list.map(x => `<div class="row" style="display:block"><div class="click" onclick="go('tag',{date:'${x.k}'})"><b>${shortDate(x.k)} ${x.k.slice(0,4)}</b><div>${x.t}</div></div>
      ${x.missing ? `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${['urlaub','krank','frei'].map(t => `<button class="small" onclick="quickSpecial('${x.k}','${t}')">${SPECIAL[t].icon} ${SPECIAL[t].name}</button>`).join('')}<button class="small" onclick="openEdit(null,'${x.k}')">+ Eintrag</button></div>` : ''}</div>`).join('')
      : '<div class="empty">✅ Alles in Ordnung</div>'}</div>`;
};
function quickSpecial(k, type) { db.specials.push({ id: uid(), date: k, type, half: false, note: '' }); save(); toast(`${SPECIAL[type].name} eingetragen`); }

// ================= Fotos (IndexedDB) =================
const PDB = {
  _db: null,
  open() { return this._db ||= new Promise((ok, fail) => {
    const r = indexedDB.open('stempeluhr-fotos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' }).createIndex('date', 'date');
    r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); }); },
  async run(mode, fn) { const d = await this.open(); return new Promise((ok, fail) => { const t = d.transaction('photos', mode); const req = fn(t.objectStore('photos')); t.oncomplete = () => ok(req?.result); t.onerror = () => fail(t.error); }); },
  put(p) { return this.run('readwrite', s => s.put(p)); },
  del(id) { return this.run('readwrite', s => s.delete(id)); },
  all() { return this.run('readonly', s => s.getAll()); },
  byDate(k) { return this.run('readonly', s => s.index('date').getAll(k)); },
};
const urls = new Map();
const photoUrl = p => { if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.blob)); return urls.get(p.id); };
async function loadDayPhotos(k) {
  try {
    const ps = await PDB.byDate(k);
    if (ui.view !== 'tag' || ui.date !== k) return;
    $('dayPhotos').hidden = !ps.length;
    $('dayThumbs').innerHTML = ps.map(p => `<img src="${photoUrl(p)}" onclick="openPhoto('${p.id}')" alt="Foto">`).join('');
  } catch (e) {}
}
RENDER.fotos = async () => {
  topbar(act("$('photoCam').click()", ICON.plus, 'Foto hinzufügen'));
  const sec = $('v-fotos');
  sec.innerHTML = '<div class="empty">Lade …</div>';
  let ps = [];
  try { ps = (await PDB.all()).sort((a, b) => b.created - a.created); } catch (e) {}
  if (ui.view !== 'fotos') return;
  const groups = {};
  for (const p of ps) (groups[p.date.slice(0, 7)] ||= []).push(p);
  sec.innerHTML = `<div class="card"><p class="muted" style="margin-top:0">Fotos von Stundenzetteln werden beim Scannen automatisch gespeichert (abschaltbar in den Einstellungen). Eigene Fotos fügst du mit + hinzu – sie gehören zum gewählten Tag.</p>
    <div class="btns"><button class="full" onclick="$('photoCam').click()">📷 Foto zum ${shortDate(ui.date)} hinzufügen</button></div></div>
    ${Object.entries(groups).map(([ym, list]) => `<div class="sec">${MONTHS[+ym.slice(5) - 1].toUpperCase()} ${ym.slice(0, 4)}</div><div class="grid3" style="margin-bottom:16px">${list.map(p => `<img src="${photoUrl(p)}" onclick="openPhoto('${p.id}')" alt="Foto vom ${p.date}">`).join('')}</div>`).join('')
    || '<div class="empty">Noch keine Fotos</div>'}`;
};
let photoOpen = null;
async function openPhoto(id) {
  const ps = await PDB.all(); const p = ps.find(x => x.id === id); if (!p) return;
  photoOpen = p; $('pImg').src = photoUrl(p);
  $('pInfo').textContent = `${longDate(p.date)}${p.note ? ' · ' + p.note : ''}`;
  $('photoDlg').showModal();
}
$('pDelete').onclick = async () => { if (!photoOpen || !confirm('Foto löschen?')) return; await PDB.del(photoOpen.id); $('photoDlg').close(); render(); toast('Foto gelöscht'); };
$('pDay').onclick = () => { $('photoDlg').close(); go('tag', { date: photoOpen.date }); };
async function storePhoto(blob, date, note) { await PDB.put({ id: uid(), date, created: Date.now(), blob, note }); }
$('photoCam').addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  try { const { blob } = await prepImage(f, 1800); await storePhoto(blob, ui.date, ''); toast('Foto gespeichert'); render(); }
  catch (e) { toast('Foto fehlgeschlagen: ' + e.message); }
});
// Bild verkleinern -> { blob, base64 }
function prepImage(file, max = 2400) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      const base64 = c.toDataURL('image/jpeg', 0.9).split(',')[1];
      c.toBlob(blob => ok({ blob, base64 }), 'image/jpeg', 0.85);
    };
    img.onerror = () => fail(new Error('Bild konnte nicht geladen werden'));
    img.src = URL.createObjectURL(file);
  });
}

// ================= Auszug =================
function repRange() {
  const r = ui.rep, t = todayKey(), d = parseKey(t);
  switch (r.preset) {
    case 'woche': return [mondayOf(t), addDays(mondayOf(t), 6)];
    case 'vorwoche': return [addDays(mondayOf(t), -7), addDays(mondayOf(t), -1)];
    case 'monat': return [dateKey(new Date(d.getFullYear(), d.getMonth(), 1)), dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
    case 'vormonat': return [dateKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)), dateKey(new Date(d.getFullYear(), d.getMonth(), 0))];
    case 'jahr': return [`${d.getFullYear()}-01-01`, `${d.getFullYear()}-12-31`];
    default: return [r.from, r.to >= r.from ? r.to : r.from];
  }
}
const PRESETS = { woche: 'Diese Woche', vorwoche: 'Letzte Woche', monat: 'Dieser Monat', vormonat: 'Letzter Monat', jahr: 'Dieses Jahr', custom: 'Eigener Zeitraum' };
RENDER.auszug = () => {
  topbar();
  const [from, to] = repRange(), now = Date.now(), st = rangeStats(from, to, now);
  const spec = {}; for (const k of days(from, to)) { const s = specialOf(k); if (s) spec[s.type] = (spec[s.type] || 0) + (s.half ? .5 : 1); }
  $('v-auszug').innerHTML = `<div class="card">
      <label style="margin-top:0">Zeitraum</label><select id="rPreset">${Object.entries(PRESETS).map(([k, n]) => `<option value="${k}" ${k === ui.rep.preset ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <div class="inline"><div><label>Von</label><input type="date" id="rFrom" value="${from}"></div><div><label>Bis</label><input type="date" id="rTo" value="${to}"></div></div></div>
    ${statsCard(st)}
    <div class="card"><div class="row"><span>Arbeitstage</span><b>${st.workdays}</b></div><div class="row"><span>Pausen</span><b>${dur(st.brk)}</b></div>
      ${Object.entries(spec).map(([t, n]) => `<div class="row"><span>${SPECIAL[t].icon} ${SPECIAL[t].name}</span><b>${n} Tage</b></div>`).join('')}
      <div class="row"><span>Stundenkonto am ${shortDate(to < todayKey() ? to : todayKey())}</span><b class="${cls(balanceUntil(to, now))}">${dur(balanceUntil(to, now), true)}</b></div></div>
    <div class="btns"><button class="primary" onclick="exportReport()">📄 Bericht teilen</button><button onclick="exportCSV()">📊 CSV (Excel)</button></div>
    <p class="muted">Der Bericht ist eine HTML-Datei – im Browser öffnen und über „Drucken“ als PDF speichern.</p>`;
  $('rPreset').onchange = ev => { ui.rep.preset = ev.target.value; render(); };
  const custom = () => { ui.rep = { preset: 'custom', from: $('rFrom').value, to: $('rTo').value }; render(); };
  $('rFrom').onchange = custom; $('rTo').onchange = custom;
};
function reportRows(from, to) {
  const now = Date.now(), rows = [];
  for (const k of days(from, to)) {
    const l = entriesOf(k), sp = specialOf(k), hol = holidayOf(k), s = sollOf(k);
    if (!l.length && !sp && !hol && !s) continue;
    const n = netOf(k, now), b = brkOf(k, now);
    rows.push({ k, l, sp, hol, s, n, b,
      start: l.length ? hm(l[0].start) : '', end: l.length ? (l[l.length - 1].end ? hm(l[l.length - 1].end) : 'läuft') : '',
      tags: [...new Set(l.flatMap(e => e.tags))].map(id => db.tags.find(t => t.id === id)?.name).filter(Boolean).join(', '),
      note: [sp ? SPECIAL[sp.type].name + (sp.half ? ' (½)' : '') : '', hol || '', ...l.map(e => e.note).filter(Boolean)].filter(Boolean).join(' · ') });
  }
  return rows;
}
function exportCSV() {
  const [from, to] = repRange(), num = ms => (ms / H).toFixed(2).replace('.', ',');
  const out = [['Datum','Wochentag','Beginn','Ende','Pause (Std)','Arbeitszeit (Std)','Arbeitszeit','Soll (Std)','Saldo (Std)','Besonderes / Notiz','Tags']];
  for (const r of reportRows(from, to)) out.push([parseKey(r.k).toLocaleDateString('de-DE'), WD[parseKey(r.k).getDay()], r.start, r.end, num(r.b), num(r.n), dur(r.n), num(r.s), num(r.n - r.s), r.note, r.tags]);
  const st = rangeStats(from, to);
  out.push([], ['Summe Ist', '', '', '', num(st.brk), num(st.ist), dur(st.ist), num(st.soll), num(st.ist - st.soll)]);
  const csv = '﻿' + out.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  saveFile(`Arbeitszeiten_${from}_bis_${to}.csv`, csv, 'text/csv').catch(e => toast('Export fehlgeschlagen: ' + e.message));
}
function exportReport() {
  const [from, to] = repRange(), st = rangeStats(from, to), now = Date.now();
  const rows = reportRows(from, to).map(r => `<tr><td>${shortDate(r.k)}</td><td>${r.start}</td><td>${r.end}</td><td>${dur(r.b)}</td><td><b>${dur(r.n)}</b></td><td>${dur(r.s)}</td><td class="${r.n - r.s < 0 ? 'neg' : ''}">${dur(r.n - r.s, true)}</td><td>${esc(r.note)}${r.tags ? ' <i>' + esc(r.tags) + '</i>' : ''}</td></tr>`).join('');
  const html = `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Arbeitszeiten ${from} bis ${to}</title>
<style>body{font-family:system-ui,Segoe UI,Roboto,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}p{color:#555;margin:0 0 16px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f1f5f5}
.sum{display:flex;gap:24px;margin:16px 0}.sum div{font-size:13px;color:#555}.sum b{display:block;font-size:18px;color:#111}.neg{color:#c00}</style>
<h1>Arbeitszeiten</h1><p>${parseKey(from).toLocaleDateString('de-DE')} – ${parseKey(to).toLocaleDateString('de-DE')} · erstellt am ${new Date().toLocaleDateString('de-DE')}</p>
<div class="sum"><div>Ist<b>${dur(st.ist)}</b></div><div>Soll<b>${dur(st.soll)}</b></div><div>Saldo<b>${dur(st.saldo, true)}</b></div><div>Pausen<b>${dur(st.brk)}</b></div><div>Stundenkonto<b>${dur(balanceUntil(to, now), true)}</b></div></div>
<table><thead><tr><th>Tag</th><th>Beginn</th><th>Ende</th><th>Pause</th><th>Arbeit</th><th>Soll</th><th>Saldo</th><th>Bemerkung</th></tr></thead><tbody>${rows}</tbody></table></html>`;
  saveFile(`Arbeitszeiten_${from}_bis_${to}.html`, html, 'text/html').catch(e => toast('Export fehlgeschlagen: ' + e.message));
}

// ================= Papierkorb =================
RENDER.papierkorb = () => {
  topbar();
  const list = [...db.trash].sort((a, b) => b.at - a.at);
  $('v-papierkorb').innerHTML = `<div class="card"><p class="muted" style="margin-top:0">Gelöschte Einträge und besondere Tage bleiben hier 30 Tage, dann werden sie endgültig entfernt.</p>
    ${list.map(t => {
      const i = t.item, txt = t.kind === 'entry' ? `${shortDate(dateKey(i.start))} ${hm(i.start)}–${i.end ? hm(i.end) : '…'} · ${dur(calc(i).net)}` : `${SPECIAL[i.type].icon} ${shortDate(i.date)} ${SPECIAL[i.type].name}`;
      return `<div class="row"><div>${txt}<div class="muted">gelöscht am ${new Date(t.at).toLocaleDateString('de-DE')}</div></div><button class="small" onclick="restoreTrash('${t.id}')">Wiederherstellen</button></div>`;
    }).join('') || '<div class="empty">Der Papierkorb ist leer</div>'}
    ${list.length ? '<div class="btns" style="margin-top:12px"><button class="danger full" onclick="emptyTrash()">Papierkorb leeren</button></div>' : ''}</div>`;
};
function restoreTrash(id) {
  const t = db.trash.find(x => x.id === id); if (!t) return;
  db.trash = db.trash.filter(x => x.id !== id);
  if (t.kind === 'entry') db.entries.push(t.item);
  else { const old = db.specials.find(s => s.date === t.item.date); if (old) trashSpecial(old); db.specials.push(t.item); }
  save(); toast('Wiederhergestellt');
}
function emptyTrash() { if (!confirm('Papierkorb endgültig leeren?')) return; db.trash = []; save(); }

// ================= Einstellungen =================
RENDER.settings = () => {
  topbar();
  const s = db.settings;
  $('v-settings').innerHTML = `
    <div class="card"><h3>Arbeitszeit</h3>
      <label>Sollstunden pro Arbeitstag</label><input type="number" id="setTarget" step="0.25" min="0" max="24" value="${s.target}">
      <label>Arbeitstage</label><div class="weekdays">${[1,2,3,4,5,6,0].map(d => `<label><input type="checkbox" data-day="${d}" ${s.days.includes(d) ? 'checked' : ''}>${WD[d]}</label>`).join('')}</div>
      <label class="check" style="margin-top:16px"><input type="checkbox" id="setAutoBreak" ${s.autoBreak ? 'checked' : ''}> Gesetzliche Mindestpause automatisch abziehen (30 Min. ab 6 Std., 45 Min. ab 9 Std.)</label>
      <label>Startsaldo (Überstunden von vor der App, z.B. 2.5 oder -1)</label><input type="number" id="setStartBalance" step="0.25" value="${s.startBalance || 0}">
      <label>Urlaubsanspruch pro Jahr (Tage)</label><input type="number" id="setVacation" step="0.5" min="0" value="${s.vacation}">
      <label>Bundesland für Feiertage</label><select id="setLand">${Object.entries(BUNDESLAENDER).map(([k, n]) => `<option value="${k}" ${k === s.land ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="card"><h3>Zettel-Scan & Fotos</h3>
      <label class="check"><input type="checkbox" id="setSavePhotos" ${s.savePhotos ? 'checked' : ''}> Fotos gescannter Zettel unter „Fotos“ aufbewahren</label>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="setCheckLaw" ${s.checkLaw ? 'checked' : ''}> Unter „Prüfen“ auch Arbeitszeitgesetz-Regeln anzeigen (Pausen, max. 10 Std., 11 Std. Ruhezeit)</label></div>
    <div class="card"><h3>Daten</h3>
      <p class="muted">Alle Daten bleiben nur auf deinem Handy. Mach ab und zu ein Backup – beim Deinstallieren der App sind sie sonst weg. (Fotos sind nicht im Backup enthalten.)</p>
      <div class="btns"><button onclick="exportBackup()">Backup speichern</button><button onclick="$('importFile').click()">Backup laden</button>
        <button onclick="go('tags')">Tags verwalten</button><button onclick="go('papierkorb')">Papierkorb</button>
        <button class="danger full" onclick="wipeAll()">Alle Daten löschen</button></div></div>
    <div class="card"><h3>App</h3><p class="muted">${window.APP_BUILD ? `Version 1.${APP_BUILD} (Build ${APP_BUILD})` : 'Entwicklerversion'}</p>
      <label class="check"><input type="checkbox" id="setAutoUpdate" ${s.autoUpdate ? 'checked' : ''}> Beim Start automatisch nach Updates suchen</label>
      <div class="btns" style="margin-top:12px"><button class="full" onclick="checkUpdate(true)">Nach Updates suchen</button></div></div>`;
};
$('v-settings').addEventListener('change', () => {
  const s = db.settings;
  s.target = parseFloat($('setTarget').value) || 0;
  s.autoBreak = $('setAutoBreak').checked;
  s.startBalance = parseFloat($('setStartBalance').value) || 0;
  s.vacation = parseFloat($('setVacation').value) || 0;
  s.land = $('setLand').value;
  s.savePhotos = $('setSavePhotos').checked;
  s.checkLaw = $('setCheckLaw').checked;
  s.autoUpdate = $('setAutoUpdate').checked;
  s.days = [...document.querySelectorAll('#v-settings [data-day]:checked')].map(i => +i.dataset.day);
  save(false); toast('Gespeichert');
});

// ================= Eintrag bearbeiten =================
let editingId = null, editTags = [];
function addBreakRow(s = '', e = '') {
  const div = document.createElement('div'); div.className = 'breakrow';
  div.innerHTML = `<input type="time" value="${s}"><span>–</span><input type="time" value="${e}"><button type="button">✕</button>`;
  div.querySelector('button').onclick = () => div.remove();
  $('eBreaks').appendChild(div);
}
$('eAddBreak').onclick = () => addBreakRow();
function drawEditTags() {
  $('eTags').innerHTML = (db.tags.map(t => `<button type="button" class="chip ${editTags.includes(t.id) ? 'on' : ''}" style="background:${t.color}${editTags.includes(t.id) ? '55' : '22'};color:${t.color};border:0;font-size:14px;padding:6px 12px" data-t="${t.id}">${esc(t.name)}</button>`).join(' ')
    || '<span class="muted">Noch keine Tags – </span>') + ` <button type="button" class="ghost small" onclick="$('editDlg').close();go('tags')">Tags verwalten</button>`;
  $('eTags').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const id = b.dataset.t; editTags = editTags.includes(id) ? editTags.filter(x => x !== id) : [...editTags, id]; drawEditTags(); });
}
function openEdit(id, key) {
  editingId = id;
  const e = id ? db.entries.find(x => x.id === id) : null;
  editTags = e ? [...e.tags] : [];
  $('editTitle').textContent = e ? 'Eintrag bearbeiten' : 'Eintrag hinzufügen';
  $('eDate').value = e ? dateKey(e.start) : key;
  $('eStart').value = e ? hm(e.start) : '08:00';
  $('eEnd').value = e ? (e.end ? hm(e.end) : '') : '16:30';
  $('eNote').value = e?.note || '';
  $('eBreaks').innerHTML = '';
  if (e) e.breaks.forEach(b => addBreakRow(hm(b.start), b.end ? hm(b.end) : '')); else addBreakRow('12:00', '12:30');
  $('eDelete').hidden = !e;
  drawEditTags();
  $('editDlg').showModal();
}
$('editForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const key = $('eDate').value, start = fromKeyTime(key, $('eStart').value), endV = $('eEnd').value;
  const fix = t => (t < start ? t + DAY : t);
  const end = endV ? fix(fromKeyTime(key, endV)) : null;
  if (end == null && db.entries.some(x => x.end == null && x.id !== editingId)) { toast('Es läuft schon ein anderer Eintrag'); return; }
  const breaks = [];
  for (const r of $('eBreaks').querySelectorAll('.breakrow')) {
    const [a, b] = r.querySelectorAll('input'); if (!a.value) continue;
    const bs = fix(fromKeyTime(key, a.value)), be = b.value ? fix(fromKeyTime(key, b.value)) : null;
    if (be != null && be < bs) { toast('Pausenende liegt vor Pausenbeginn'); return; }
    if (be == null && end != null) { toast('Pause braucht ein Ende'); return; }
    breaks.push({ start: bs, end: be });
  }
  breaks.sort((x, y) => x.start - y.start);
  const data = { start, end, breaks, note: $('eNote').value.trim(), tags: editTags };
  if (editingId) Object.assign(db.entries.find(x => x.id === editingId), data); else db.entries.push({ id: uid(), ...data });
  $('editDlg').close(); ui.date = key; save(); toast('Gespeichert');
});
$('eDelete').onclick = () => {
  const e = db.entries.find(x => x.id === editingId); if (!e) return;
  trashEntry(e); $('editDlg').close(); save(); toast('In den Papierkorb verschoben');
};
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());

// ================= Zettel-Scan =================
let scanDays = [], scanBlob = null;
function scanPick(camera) {
  if (!window.Capacitor?.isNativePlatform?.()) { toast('Scannen geht nur in der installierten App'); return; }
  $(camera ? 'scanCam' : 'scanGal').click();
}
async function scanFile(file) {
  const { Filesystem, TextRecognition } = window.Capacitor.Plugins;
  toast('Zettel wird gelesen …');
  const { base64, blob } = await prepImage(file);
  scanBlob = blob;
  const { uri } = await Filesystem.writeFile({ path: 'scan.jpg', data: base64, directory: 'CACHE' });
  const res = await TextRecognition.processImage({ path: uri });
  const rows = ocrRows(res);
  $('scanRaw').textContent = rows.join('\n');
  scanDays = parseTimesheet(rows).map(d => {
    const existing = entriesOf(d.key), exNet = existing.reduce((s, e) => s + calc(e).net, 0), running = existing.some(e => e.end == null);
    let status, checked;
    if (!existing.length) { status = 'neu'; checked = true; }
    else if (running) { status = 'läuft noch ein Eintrag – wird nicht ersetzt'; checked = false; }
    else if (Math.abs(exNet - d.net) < 2 * M && Math.abs(existing[0].start - d.segments[0].start) < 2 * M) { status = 'schon vorhanden'; checked = false; }
    else { status = `ersetzt vorhandene ${dur(exNet)}`; checked = true; }
    return { ...d, status, checked, running };
  });
  showScan();
}
function showScan() {
  $('scanInfo').textContent = scanDays.length
    ? 'Haken = wird übernommen.' + (scanDays.some(d => d.suspicious) ? ' Gelb markierte Tage bitte prüfen – die Summe passt nicht zum Zettel.' : ' Alle Tagessummen stimmen mit dem Zettel überein ✓')
    : 'Keine Arbeitszeiten erkannt. Tipp: Zettel flach hinlegen, gutes Licht, ganz im Bild.';
  $('scanList').innerHTML = scanDays.map((d, i) => `<label class="row check" style="margin:0;${d.suspicious ? 'background:rgba(217,119,6,.15);border-radius:8px;padding:10px 6px' : ''}">
      <input type="checkbox" data-i="${i}" ${d.checked ? 'checked' : ''} ${d.running ? 'disabled' : ''}>
      <div style="flex:1"><b>${shortDate(d.key)}</b> <span class="t">${dur(d.net)}</span>${d.suspicious ? ` <span class="chip">Zettel: ${dur(d.printedNet)}</span>` : ''}
      <div class="muted">${d.segments.map(s => `${hm(s.start)}–${hm(s.end)}`).join(', ')}</div><div class="muted">${d.status}</div></div></label>`).join('');
  $('scanOk').disabled = !scanDays.length;
  $('scanDlg').showModal();
}
$('scanList').addEventListener('change', ev => { const i = ev.target.dataset.i; if (i != null) scanDays[i].checked = ev.target.checked; });
$('scanForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const sel = scanDays.filter(d => d.checked && !d.running);
  for (const d of sel) {
    entriesOf(d.key).forEach(trashEntry);
    db.entries.push({ id: uid(), tags: [], ...dayToEntry(d) });
  }
  $('scanDlg').close();
  if (sel.length) ui.date = sel[sel.length - 1].key;
  save();
  if (scanBlob && db.settings.savePhotos && scanDays.length) { try { await storePhoto(scanBlob, scanDays[scanDays.length - 1].key, 'Stundenzettel'); render(); } catch (e) {} }
  toast(sel.length ? `${sel.length} Tag(e) übernommen` : 'Nichts übernommen');
  if (sel.length && ui.view !== 'tag') go('tag');
});
for (const id of ['scanCam', 'scanGal']) $(id).addEventListener('change', ev => {
  const f = ev.target.files[0]; ev.target.value = '';
  if (f) scanFile(f).catch(e => toast('Scan fehlgeschlagen: ' + (e.message || e)));
});

// ================= Dateien teilen / Backup =================
async function saveFile(name, text, mime) {
  const C = window.Capacitor;
  if (C?.isNativePlatform?.()) {
    const { Filesystem, Share } = C.Plugins;
    const r = await Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
    await Share.share({ title: name, url: r.uri, dialogTitle: 'Datei speichern / teilen' });
    return;
  }
  const file = new File([text], name, { type: mime });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function shareText(text) {
  const C = window.Capacitor;
  try {
    if (C?.isNativePlatform?.()) await C.Plugins.Share.share({ text, dialogTitle: 'Teilen' });
    else if (navigator.share) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); toast('In die Zwischenablage kopiert'); }
  } catch (e) {}
}
function exportBackup() { saveFile(`Stempeluhr_Backup_${todayKey()}.json`, JSON.stringify(db, null, 1), 'application/json').catch(e => toast('Backup fehlgeschlagen: ' + e.message)); }
$('importFile').addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.entries)) throw new Error('Keine gültige Backup-Datei');
    if (!confirm(`Backup mit ${d.entries.length} Einträgen laden? Aktuelle Daten werden ersetzt.`)) return;
    localStorage.setItem(KEY, JSON.stringify(d)); db = load(); save(); toast('Backup geladen');
  } catch (e) { toast('Fehler: ' + e.message); }
});
function wipeAll() {
  if (!confirm('Wirklich ALLE Einträge löschen?') || !confirm('Sicher? Das kann nicht rückgängig gemacht werden.')) return;
  localStorage.removeItem(KEY); db = load(); save(); toast('Alles gelöscht');
}

// ================= Updates =================
const REPO = 'Barry2040/stempeluhr';
async function checkUpdate(manual) {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(r.status === 404 ? 'Keine Releases gefunden' : 'GitHub antwortet nicht (' + r.status + ')');
    const rel = await r.json();
    const latest = parseInt(String(rel.tag_name).replace(/\D/g, ''), 10) || 0;
    const apk = (rel.assets || []).find(a => a.name.endsWith('.apk'));
    if (apk && latest > (window.APP_BUILD || 0)) {
      if (confirm(`Update verfügbar: Build ${latest}\n${rel.body || ''}\n\nJetzt herunterladen? Danach die Datei öffnen und „Installieren“ tippen – deine Daten bleiben erhalten.`)) location.href = apk.browser_download_url;
    } else if (manual) toast('Du hast die neueste Version');
  } catch (e) { if (manual) toast('Update-Prüfung fehlgeschlagen: ' + e.message); }
}

// ================= Start =================
if (!location.hash) history.replaceState(null, '', '#tag');
show();
setInterval(() => { if (ui.view === 'tag' && !document.querySelector('dialog[open]')) render(); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !document.querySelector('dialog[open]')) { if (ui.view === 'tag' && ui.date < todayKey() && active()) ui.date = todayKey(); render(); } });
if (db.settings.autoUpdate && window.APP_BUILD) setTimeout(() => checkUpdate(false), 3000);
