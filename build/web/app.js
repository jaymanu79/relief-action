// Relief Action — browser edition: user interface on top of the emulated original game.
(function () {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const D = window.RELIEF_DATA;            // mem (base64), map, icons, names, rooms

// ---------- preferences ----------
const PREF_KEY = 'relief-action-prefs-v1';
const prefs = Object.assign({ mode: 'solid', map: true, monster: true, cpc: false, turbo: true, hotspots: false, monsterBlink: true, infTime: true, invertY: false, sens: 1 }, (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; } })());
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {} };

// ---------- language: French (the original) by default, English edition on demand ----------
const EN = window.I18N_EN;
// languages: French (the original), English, and any translation script loaded (window.I18N_XX); English is the fallback
const LANGS = { fr: null, en: EN };
for (const k of Object.keys(window)) { const m = /^I18N_([A-Z]{2})$/.exec(k); if (m && m[1] !== 'EN') LANGS[m[1].toLowerCase()] = window[k]; }
const LANG_NAMES = { fr: 'Français', en: 'English' };
for (const [c, d] of Object.entries(LANGS)) if (d && d.meta && d.meta.name) LANG_NAMES[c] = d.meta.name;
let LANG = LANGS[prefs.lang] !== undefined ? prefs.lang : 'fr';
const LD = () => LANGS[LANG] || EN;                                  // dictionary of the current language (not French)
const tx = (part, k) => { const d = LD()[part]; return d && d[k] !== undefined && d[k] !== '' ? d[k] : EN[part][k]; };
const uiOf = s => { const d = LD().ui; return d[s] !== undefined ? d[s] : EN.ui[s]; };
let phCache = {};
function T(str, ...a) { let r = LANG !== 'fr' && uiOf(str) !== undefined ? uiOf(str) : str; a.forEach((v, i) => { r = r.split('{' + i + '}').join(v); }); return r; }
const PHL = () => { if (LANG === 'fr') return window.PHRASES_FR; if (LANG === 'en') return window.PHRASES_EN;
  const own = window['PHRASES_' + LANG.toUpperCase()] || []; return phCache[LANG] || (phCache[LANG] = window.PHRASES_EN.map((p, i) => own[i] || p)); };
const deckOrd = k => (LANG !== 'fr' ? (LD().decks.ord[k] || EN.decks.ord[k]) : ['1er', '2e', '3e'][k] + ' étage');

// ---------- game ----------
const mem = Uint8Array.from(atob(D.mem), c => c.charCodeAt(0));
const g = new Relief(mem, { monsterOff: !prefs.monster });
window.game = g;
g.turbo = prefs.turbo;

let R = null;
try { R = new ReliefRenderer($('#view')); } catch (e) {
  $('#nogl').hidden = false;
  // name the culprit when it is a browser known to ship without (or with a broken) WebGL
  const ua = navigator.userAgent, who = /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /MiuiBrowser/i.test(ua) ? 'Mi Browser' : /UCBrowser/i.test(ua) ? 'UC Browser' : /HuaweiBrowser/i.test(ua) ? 'Huawei Browser' : /Opera Mini|OPiOS/i.test(ua) ? 'Opera Mini' : null;
  if (who) { const p = $('#nogl .nogl-who'); p.hidden = false; p.dataset.who = who; p.textContent = T('Vous utilisez {0} : sur téléphone, installez ou ouvrez plutôt Chrome ou Firefox.', who); }
}
if (R) R.mode = prefs.mode;
window.renderer = R;

const VERBS = [[1, 'Poser'], [2, 'Prendre'], [4, 'Utiliser'], [5, 'Appuyer'], [6, 'Régler'], [7, 'Verser'], [8, 'Relief'], [9, 'Dormir'], [10, 'Manger'], [11, 'Boire']];
const VERB_KEYS = { 1: '1', 2: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9', 11: '0' };
const DECK_OF_LIFT = { 0x02: 0, 0x2F: 1, 0x13: 2 };

// ---------- icons ----------
const iconCache = {};
// icons are 3x3 font tiles (table &BE20, font &B660); the detector's tiles are rewritten live by the game
const DETECTOR = 0x12;
function liveIconHex(type) {
  let out = '';
  for (let r = 0; r < 24; r++) for (let c = 0; c < 3; c++) {
    const t = g.read(0xBE20 + type * 9 + ((r >> 3) * 3 + c));
    out += g.read(0xB660 + t * 8 + (r & 7)).toString(16).padStart(2, '0');
  }
  return out;
}
function detectorSig() { let s = ''; for (let k = 0; k < 9; k++) s += g.read(0xBE20 + DETECTOR * 9 + k) + ','; return s; }
function iconURL(type) {
  if (type === DETECTOR) {
    const sig = 'det' + detectorSig();
    if (iconCache[sig]) return iconCache[sig];
    return (iconCache[sig] = drawIcon(liveIconHex(type)));
  }
  if (iconCache[type]) return iconCache[type];
  const hex = D.icons[type.toString(16).toUpperCase().padStart(2, '0')];
  if (!hex) return null;
  return (iconCache[type] = drawIcon(hex));
}
function drawIcon(hex) {
  const c = document.createElement('canvas'); c.width = 24; c.height = 24;
  const x = c.getContext('2d'), im = x.createImageData(24, 24);
  for (let r = 0; r < 24; r++) for (let k = 0; k < 24; k++) {
    const byte = parseInt(hex.substr((r * 3 + (k >> 3)) * 2, 2), 16);
    const on = (byte >> (7 - (k & 7))) & 1, o = (r * 24 + k) * 4;
    im.data[o] = 235; im.data[o + 1] = 242; im.data[o + 2] = 255; im.data[o + 3] = on ? 255 : 0;
  }
  x.putImageData(im, 0, 0);
  return c.toDataURL();
}
// the detector animates (monster moving): refresh its slot image as soon as its tiles change
let detPrev = '';
let detBlink = 0, detTimer = null;
g.on('detector', () => {          // the game flashes the centre light 8 times: replay it at a visible pace
  if (detTimer) return;
  detBlink = 8;
  detTimer = setInterval(() => {
    const on = detBlink % 2 === 0;
    $('#detbox').classList.toggle('ping', on);
    $$('#inv .slot').forEach((b, i) => { const o = g.state().inv[i]; b.classList.toggle('ping', on && o != null && g.objType(o) === DETECTOR); });
    if (--detBlink < 0) { clearInterval(detTimer); detTimer = null; $('#detbox').classList.remove('ping'); $$('#inv .slot').forEach(b => b.classList.remove('ping')); }
  }, 160);
});
function pumpDetector() {
  const st = g.state();
  const has = st.inv.some(o => o != null && g.objType(o) === DETECTOR);
  $('#detbox').hidden = !has;
  const sig = detectorSig(); if (sig === detPrev && !(has && !$('#det-img').src)) return; detPrev = sig;
  if (has) $('#det-img').src = iconURL(DETECTOR);
  $$('#inv .slot').forEach((b, i) => { const o = st.inv[i]; if (o != null && g.objType(o) === DETECTOR) b.querySelector('img').src = iconURL(DETECTOR); });
  $$('#here .slot').forEach((b, i) => { const o = st.here[i]; if (o !== undefined && g.objType(o) === DETECTOR) b.querySelector('img').src = iconURL(DETECTOR); });
}
const objName = n => { const k = g.objType(n).toString(16).toUpperCase().padStart(2, '0'); return (LANG !== 'fr' ? tx('names', k) : D.names[k]) || T('Objet {0}', n); };

// ---------- subtitles ----------
const subs = $('#subs');
let lastSub = '', lastSubT = 0;
function say(text, cls, page) {
  const now = performance.now();
  if (text === lastSub && now - lastSubT < 4000) return;
  lastSub = text; lastSubT = now;
  const el = document.createElement('div');
  el.className = 'sub ' + (cls || '');
  el.textContent = text;
  if (page) {                 // book page: "1/3 ▸" while pages remain (blinking), "3/3 ■" on the last one
    const pg = document.createElement('span'); pg.className = 'pg';
    pg.textContent = ' ' + (page.i + 1) + '/' + page.n + ' ';
    const m = document.createElement('span'); m.className = page.i + 1 < page.n ? 'more' : 'end'; m.textContent = page.i + 1 < page.n ? '▸' : '■';
    pg.appendChild(m); el.appendChild(pg);
  }
  subs.appendChild(el);
  while (subs.children.length > 4) subs.firstChild.remove();
  requestAnimationFrame(() => el.classList.add('in'));
  const hold = 3500 + text.length * 55;
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 900); }, hold);
}
let lastCode = null;
function readCode() {      // the epilogue code word lives at &54CC (letters, last one has bit 7)
  let s = ''; for (let a = 0x54CC; a < 0x54DC; a++) { const v = g.read(a); s += String.fromCharCode(64 + (v & 0x1F)); if (v & 0x80) break; }
  return s;
}
let lastPhraseId = -1;
// books: Use reads one page at a time (pointer table &774E indexed by the object, page lists of phrase ids - 1 at &7780-&77A7)
function bookPage(id) {
  const inst = g.read(0xE7EC + g.read(0xD7D9)); if (inst === 0xFF) return null;
  const p = g.read(0x774E + 2 * inst) | g.read(0x774F + 2 * inst) << 8;
  if (p < 0x7780 || p >= 0x77A8) return null;
  const L = []; for (let a = p; g.read(a) && L.length < 24; a++) L.push(g.read(a) + 1);
  const i = L.indexOf(id); return i < 0 || L.length < 2 ? null : { i, n: L.length };
}
let bookHintShown = (() => { try { return !!localStorage.getItem('relief-book-hint'); } catch (e) { return false; } })();
const LOOPING = new Set([188, 191]);   // end of game: the original reprints these forever (it expects a reset), show them once
g.on('phrase', id => {
  let t = PHL()[id] || '';
  if (!t) return;
  const again = LOOPING.has(id) && id === lastPhraseId; lastPhraseId = id;
  if (again) return;
  if (id === 191) {
    const first = true;
    lastCode = readCode(); t = t.replace('{CODE}', lastCode); try { localStorage.setItem('relief-action-code', lastCode); } catch (e) {}
    if (first) { const box = $('#code-card'); $('#code-word').textContent = lastCode; const ul = $('#code-lines'); ul.innerHTML = ''; for (const l of codeSummary(lastCode)) { const li = document.createElement('li'); li.textContent = l; li.className = l[0] === '✓' ? 'ok' : l[0] === '✗' ? 'ko' : ''; ul.appendChild(li); } box.hidden = false; }
  }
  const st = g.state();
  // room names printed on entering a room become the location card, not a subtitle
  if (id === st.room + 1 && D.rooms[st.room] && performance.now() - roomChangeT < 4000) { showLocation(); return; }
  const page = bookPage(id);
  say(t, id >= 173 && id <= 180 ? 'radio' : '', page);
  if (page && page.i === 0 && !bookHintShown) {
    bookHintShown = true; try { localStorage.setItem('relief-book-hint', '1'); } catch (e) {}
    setTimeout(() => say(T('Utiliser à nouveau pour tourner la page.'), 'sys'), 400);
  }
});

// ---------- epilogue code: live reading of what the end code will say (routine &79D4) ----------
// letters: 1 oxygen (R ok, K lacking), 2 ration (N) , 3 commander's card / logbook (C), 4 distress message (C),
// 5 recipient (no effect on the ending), 6 call sign: J = NMI, the ship's own, the only one that brings help
function codeState() {
  const rd = g.read;
  let ration = false;
  for (let n = 3; n <= 6; n++) if (g.objLoc(n) > 0x23 && g.objType(n) === 0x0D) ration = true;
  const c = g.objLoc(25), card = c !== 0x32 && c >= 0x24;
  const sent = !!rd(0x64AA), nmi = sent && rd(0x64AC) === 9;
  const oxyBad = !!rd(0x64A6) && !rd(0xE7DB);
  const L = [oxyBad ? 'K' : 'R', ration ? 'N' : 'E', card ? 'C' : 'M', sent ? 'C' : 'B',
    String.fromCharCode(70 + (sent ? rd(0x64AB) : 0)), String.fromCharCode(65 + (sent ? rd(0x64AC) : 0))];
  return { ration, card, sent, nmi, oxyBad, code: L.join('') };
}
const CODE_ITEMS = [
  ['ration', 'Bravo ! Vous emportez une ration intacte : vous aurez de quoi manger en attendant les secours (lettre 2 du code : N).', 'La ration n\'est plus avec vous : vous n\'auriez rien à manger (lettre 2 : E).'],
  ['card', 'Bravo ! Vous avez la carte du commandant : son journal de bord prouvera votre innocence (lettre 3 : C).', 'La carte du commandant n\'est plus avec vous (lettre 3 : M).'],
  ['sent', 'Bravo ! Message de détresse émis par l\'ERTP (lettre 4 : C).', null],
  ['nmi', 'Bravo ! Le message porte l\'indicatif du vaisseau, NMI : cette fois les secours viendront (lettre 6 : J).', null],
];
let codePrev = null;
function watchCode() {
  if (!running || g.epilogue) return;
  const s = codeState();
  if (codePrev) for (const [k, good, bad] of CODE_ITEMS) {
    if (s[k] && !codePrev[k]) say(T(good), 'bravo');
    else if (!s[k] && codePrev[k] && bad) say(T(bad), 'sys');
  }
  codePrev = s;
}
function codeSummary(code) {
  const s = codeState(), ok = (b, y, n) => (b ? '✓ ' + T(y) : '✗ ' + T(n));
  return [
    ok(code[0] === 'R', 'R · assez d\'oxygène dans la navette', 'K · l\'oxygène va manquer'),
    ok(code[1] === 'N', 'N · une ration à bord', 'E · pas de provisions'),
    ok(code[2] === 'C', 'C · la carte du commandant (journal de bord)', 'M · aucune preuve de votre innocence'),
    ok(code[3] === 'C', 'C · message de détresse envoyé', 'B · personne n\'a été prévenu'),
    T('· {0} · destinataire du message (sans effet sur la fin)', code[4]),
    ok(code[5] === 'J', 'J · indicatif du vaisseau NMI', T(code[3] === 'C' ? '{0} · indicatif standard : personne ne viendra' : '{0} · pas de message', code[5])),
  ];
}

// ---------- HUD ----------
let roomChangeT = 0, shownRoom = -1;
function roomLabel(r) {
  if (r >= 0x80) return T('Coursive');
  return (LANG !== 'fr' ? tx('rooms', r) : D.rooms[r]) || T('Salle &{0}', r.toString(16).toUpperCase());
}
function deckOf(st) {
  const r = st.room;
  if (r === 0x14) return DECK_OF_LIFT[st.lift] !== undefined ? DECK_OF_LIFT[st.lift] : 1;
  const key = r.toString(16).toUpperCase().padStart(2, '0');
  for (let k = 0; k < D.map.length; k++) if (D.map[k].spaces[key]) return k;
  if (r === 0x0A) return 0;
  return -1;
}
function showLocation() {
  const st = g.state();
  $('#loc-name').textContent = roomLabel(st.room);
  const dk = deckOf(st);
  $('#loc-deck').textContent = dk >= 0 ? (LANG !== 'fr' ? LD().decks.names[dk] || EN.decks.names[dk] : D.deckNames[dk]) : '';
  const card = $('#loc'); card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
}

// panel
const elInv = $('#inv'), elHere = $('#here'), elVerbs = $('#verbs');
for (let s = 1; s <= 9; s++) {
  const b = document.createElement('button'); b.className = 'slot'; b.dataset.slot = s;
  b.innerHTML = '<img alt=""><span class="k">' + s + '</span>';
  b.addEventListener('click', () => { g.push({ type: 'slot', s, tries: 0 }); });
  elInv.appendChild(b);
}
for (let k = 0; k < 4; k++) {
  const b = document.createElement('button'); b.className = 'slot box'; b.dataset.box = k;
  b.innerHTML = '<img alt="">';
  b.addEventListener('click', () => clickBox(k));
  elHere.appendChild(b);
}
for (const [v, name] of VERBS) {
  const b = document.createElement('button'); b.className = 'verb'; b.dataset.verb = v;
  b.innerHTML = '<span class="k">' + VERB_KEYS[v] + '</span><span class="vn"></span>'; b.querySelector('.vn').textContent = name; b._fr = name;
  b.addEventListener('click', () => doVerb(v));
  elVerbs.appendChild(b);
}
// drag and drop between the inventory and the room (mouse and touch): an object dragged from the inventory onto the
// room panel or the 3D view is dropped (slot + Poser), an object dragged from the room onto the inventory is taken
// (Prendre + its box). A short tap keeps its usual meaning.
const dnd = { on: false, from: null, k: 0, x0: 0, y0: 0, id: -1, ghost: null, target: null, justDropped: 0 };
const dropZone = (x, y) => {
  const el = document.elementFromPoint(x, y); if (!el) return null;
  if (el.closest('#inv') || el.closest('.sect') === elInv.closest('.sect')) return 'inv';
  if (el.closest('#here') || el.closest('.sect') === elHere.closest('.sect') || el.closest('#view') || el.id === 'stage') return 'here';
  return null;
};
function dragStart(e, from, k) {
  if (e.button > 0) return;
  const st = g.state(), o = from === 'inv' ? st.inv[k] : st.here[k];
  if (o == null) return;
  Object.assign(dnd, { on: false, from, k, x0: e.clientX, y0: e.clientY, id: e.pointerId, obj: o, target: null });
}
window.addEventListener('pointermove', e => {
  if (dnd.id !== e.pointerId || dnd.from === null) return;
  if (!dnd.on) {
    if (Math.hypot(e.clientX - dnd.x0, e.clientY - dnd.y0) < 10) return;
    dnd.on = true;
    const gh = dnd.ghost = document.createElement('div'); gh.className = 'dragghost';
    gh.innerHTML = '<img alt="">'; gh.querySelector('img').src = iconURL(g.objType(dnd.obj)) || '';
    document.body.appendChild(gh); document.body.classList.add('dragging', 'drag-from-' + dnd.from);
  }
  const lift = e.pointerType === 'touch' ? 64 : 28;             // above the finger, so it stays visible
  dnd.ghost.style.transform = 'translate(' + (e.clientX - 28) + 'px,' + (e.clientY - lift) + 'px)';
  const z = dropZone(e.clientX, e.clientY), t = z && z !== dnd.from ? z : null;
  if (t !== dnd.target) { dnd.target = t; document.body.classList.toggle('drop-ok', !!t); }
  e.preventDefault();
}, { passive: false });
function dragEnd(e) {
  if (dnd.id !== e.pointerId) return;
  if (dnd.on) {
    dnd.ghost.remove(); document.body.classList.remove('dragging', 'drag-from-inv', 'drag-from-here', 'drop-ok');
    dnd.justDropped = performance.now();          // swallow the click that follows the release
    const z = e.type === 'pointerup' ? dropZone(e.clientX, e.clientY) : null;
    if (z === 'here' && dnd.from === 'inv') {
      if (g.ctx === 'box') cancelBox();
      g.push({ type: 'slot', s: dnd.k + 1, tries: 0 }); g.push({ type: 'verb', v: 1, tries: 0 });
    } else if (z === 'inv' && dnd.from === 'here') {
      // released on an empty inventory square: select it first, the game puts what it takes in the selected slot
      const el = document.elementFromPoint(e.clientX, e.clientY), sq = el && el.closest('#inv .slot');
      if (sq && g.state().inv[+sq.dataset.slot - 1] == null && g.ctx !== 'box') g.push({ type: 'slot', s: +sq.dataset.slot, tries: 0 });
      if (g.ctx === 'box') g.push({ type: 'box', b: dnd.k, tries: 0 });
      else { g.push({ type: 'verb', v: 2, tries: 0 }); g.push({ type: 'box', b: dnd.k, tries: 0 }); }
    }
  }
  dnd.from = null; dnd.on = false; dnd.id = -1;
}
window.addEventListener('pointerup', dragEnd); window.addEventListener('pointercancel', dragEnd);
$$('#inv .slot').forEach((b, i) => b.addEventListener('pointerdown', e => dragStart(e, 'inv', i)));
$$('#here .slot').forEach((b, i) => b.addEventListener('pointerdown', e => dragStart(e, 'here', i)));
document.addEventListener('click', e => { if (performance.now() - dnd.justDropped < 400 && e.target.closest && e.target.closest('.slot')) { e.stopPropagation(); e.preventDefault(); } }, true);
// door remote (object type 9, "boîtier à antenne"): select it and Use it; the game opens the remote doors in view
function useRemote() {
  const st = g.state();
  const k = st.inv.findIndex(o => o != null && g.objType(o) === 9);
  if (k < 0) { say(T('Vous n\'avez pas la télécommande.'), 'sys'); return; }
  if (g.ctx === 'box') cancelBox();
  g.push({ type: 'slot', s: k + 1, tries: 0 });
  g.push({ type: 'verb', v: 4, tries: 0 });
}
$('#b-remote').onclick = () => useRemote();
function doVerb(v) {
  if (g.ctx === 'box') { cancelBox(); }
  g.push({ type: 'verb', v, tries: 0 });
}
function clickBox(k) {
  if (g.ctx === 'box') { g.push({ type: 'box', b: k, tries: 0 }); return; }
  const st = g.state();
  if (st.here[k] === undefined) return;
  // shortcut: clicking an object lying in the room takes it
  g.push({ type: 'verb', v: 2, tries: 0 }); g.push({ type: 'box', b: k, tries: 0 });
}
function cancelBox() {
  const st = g.state();
  let empty = [0, 1, 2, 3].find(k => st.here[k] === undefined);
  g.push({ type: 'box', b: empty === undefined ? st.box & 3 : empty, tries: 0 });
}

let hudKey = '';
function updateHUD() {
  const st = g.state();
  const key = JSON.stringify([st.inv, st.here, st.slot, st.verb, st.ctx, st.room, st.box, g.queue.length, [...st.inv, ...st.here].map(n => n == null ? -1 : g.objType(n))]);
  if (key !== hudKey) {
    hudKey = key;
    $$('#inv .slot').forEach((b, i) => {
      const o = st.inv[i]; const img = b.querySelector('img');
      if (o != null) { img.src = iconURL(g.objType(o)) || ''; img.hidden = false; b.title = objName(o) + T(' — glisser vers la pièce pour poser'); b.classList.add('full'); }
      else { img.hidden = true; b.title = T('Emplacement vide'); b.classList.remove('full'); }
      b.classList.toggle('cur', st.slot === i + 1);
    });
    $$('#here .slot').forEach((b, i) => {
      const o = st.here[i]; const img = b.querySelector('img');
      if (o !== undefined) { img.src = iconURL(g.objType(o)) || ''; img.hidden = false; b.title = objName(o) + T(' — cliquer ou glisser vers l\'inventaire pour prendre'); b.classList.add('full'); }
      else { img.hidden = true; b.title = ''; b.classList.remove('full'); }
      b.classList.toggle('cur', st.ctx === 'box' && (st.box & 3) === i);
    });
    $('#here-more').textContent = '';
    // more than 4 objects: the game only shows the first 4 (lowest numbers); flag the rest on the last box
    // (before the game has set up its object table every object reads as being in room 0: ignore that)
    const extra = g.epilogue || st.hereAll.length > 24 ? [] : st.hereAll.slice(4), last = $$('#here .slot')[3];   // the epilogue program overwrites the game's tables
    let badge = last.querySelector('.more');
    if (extra.length) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'more'; last.appendChild(badge); }
      badge.textContent = '+' + extra.length;
      last.title = (last.title ? last.title + '\n' : '') + T('Aussi dans la pièce : {0} (prenez un objet pour faire apparaître les suivants)', extra.map(objName).join(', '));
    } else if (badge) badge.remove();
    $$('#verbs .verb').forEach(b => b.classList.toggle('cur', +b.dataset.verb === st.verb && st.ctx !== 'move'));
    $('#panel').classList.toggle('choosing', st.ctx === 'box');
    $('#mode').textContent = T(st.ctx === 'move' ? 'Déplacement' : st.ctx === 'menu' ? 'Action' : st.ctx === 'box' ? 'Choisissez un objet de la pièce' : '');
    const selName = st.inv[st.slot - 1] != null ? objName(st.inv[st.slot - 1]) : '—';
    $('#sel').textContent = selName;
    $('#b-remote').hidden = !st.inv.some(o => o != null && g.objType(o) === 9);
  }
  if (st.room !== shownRoom) { shownRoom = st.room; roomChangeT = performance.now(); showLocation(); }
  watchCode();
  handleContext(st);
  if (prefs.map) drawMap(st);
}

// ---------- special contexts (code entry, terminal, game over) ----------
const SPECIAL = { code: 'Saisie au clavier', mini: 'Moniteur — S : sortie · Z : adresse · 0-9 A-F : valeur', over: 'Fin de partie', epilogue: 'Épilogue' };
let specialShown = false;
function handleContext(st) {
  const c = st.ctx;
  const special = !!c && !(c === 'move' || c === 'menu' || c === 'box' || c === 'wait');
  const showCPC = prefs.cpc || special;
  $('#cpcwrap').hidden = !showCPC;
  $('#cpcwrap').classList.toggle('modal', special && !prefs.cpc);
  $('#cpcwrap').classList.toggle('over-only', c === 'over' && !prefs.cpc);
  $('#cpc-title').textContent = special ? (SPECIAL[c] !== undefined ? T(SPECIAL[c]) : T('Écran d\'origine')) : T('Écran d\'origine (Amstrad CPC)');
  $('#keys').hidden = !(special && c !== 'over');
  $('#over-btns').hidden = c !== 'over';
  $('#cpc-close').hidden = c !== 'mini';
  $('#epi-btns').hidden = c !== 'epilogue';
  $('#epi-cta').hidden = !(lastCode && c !== 'epilogue');
  if (special !== specialShown) { specialShown = special; }
}

// ---------- CPC screen ----------
const cpcCanvas = $('#cpc'), cpcCtx = cpcCanvas.getContext('2d');
const cpcImg = cpcCtx.createImageData(640, 200);
function drawCPC() {
  if ($('#cpcwrap').hidden) return;
  g.cpc.render(cpcImg.data, 640);
  cpcCtx.putImageData(cpcImg, 0, 0);
}

// ---------- map ----------
const mapCanvas = $('#mapc'), mapCtx = mapCanvas.getContext('2d');
let mapKey = '';
function rot(x, z, phi) { const t = phi * Math.PI / 128, c = Math.cos(t), s = Math.sin(t); return [x * c - z * s, x * s + z * c]; }
// outline of a space as one polygon: chain its wall segments end to end (convex hull if they do not close)
const outlineCache = new Map();
function outline(sp) {
  if (outlineCache.has(sp)) return outlineCache.get(sp);
  const segs = sp.segs.map(s => [[s[0], s[1]], [s[2], s[3]]]);
  const near = (p, q) => Math.abs(p[0] - q[0]) < 0.6 && Math.abs(p[1] - q[1]) < 0.6;
  let best = null;
  for (let s0 = 0; s0 < segs.length && !best; s0++) {
    const used = new Set([s0]), poly = [segs[s0][0], segs[s0][1]];
    for (;;) {
      const end = poly[poly.length - 1];
      let k = -1, rev = false;
      for (let i = 0; i < segs.length; i++) { if (used.has(i)) continue; if (near(segs[i][0], end)) { k = i; break; } if (near(segs[i][1], end)) { k = i; rev = true; break; } }
      if (k < 0) break;
      used.add(k); poly.push(rev ? segs[k][0] : segs[k][1]);
      if (near(poly[poly.length - 1], poly[0])) { if (used.size >= segs.length * 0.6) best = poly; break; }
    }
  }
  if (!best) {   // convex hull of all endpoints
    const pts = segs.flat().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of pts.slice().reverse()) { while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    best = lo.slice(0, -1).concat(hi.slice(0, -1));
  }
  outlineCache.set(sp, best);
  return best;
}
function fillSpace(x, sp, P) {
  const poly = outline(sp); if (poly.length < 3) return;
  x.beginPath(); poly.forEach((p, i) => { const q = P(p[0], p[1]); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); }); x.closePath(); x.fill();
}
function monsterDeck(st) {
  const key = st.monster.toString(16).toUpperCase().padStart(2, '0');
  for (let k = 0; k < D.map.length; k++) if (D.map[k].spaces[key]) return k;
  return -1;
}
// rotating airlock (&05): its single opening turns to the door stored at &411E; the plan was built for door &0E
const SAS_ANGLE = { 0x0E: 0, 0x27: 64, 0x26: 128 }, SAS_PIVOT = [27.5, 30];
const sas = { cur: null, target: 0, t: 0 };
function sasStep() {
  const tgt = SAS_ANGLE[g.read(0x411E)]; if (tgt === undefined) return false;
  const now = performance.now(), dt = Math.min(100, now - (sas.t || now)); sas.t = now;
  if (sas.cur === null) sas.cur = tgt;
  sas.target = tgt;
  let d = ((tgt - sas.cur) % 256 + 256) % 256;                  // always turn the same way, like the game's cycle
  if (d < 0.5) { sas.cur = tgt; return false; }
  sas.cur = (sas.cur + Math.min(d, dt * 0.09)) % 256;            // ~0.7 s per quarter turn
  return true;
}
function doorKey(dk) { let k = ''; for (const dd of (D.deckDoors[dk] || [])) k += g.read(0x448F + 9 * dd[0] + 2) & 3; return k; }
function drawMap(st) {
  const dk = deckOf(st);
  const sasMoving = sasStep();
  const mdk = monsterDeck(st);
  const blinking = prefs.monsterBlink && g.ctx !== 'epilogue';
  const phase = blinking ? 0.5 + 0.5 * Math.cos(performance.now() * Math.PI / 450) : 0;   // ~1,1 s par battement
  const key = [dk, st.room, Math.round(st.x), Math.round(st.z), st.heading, st.monster, blinking, blinking ? Math.round(phase * 12) : 0, Math.round(sas.cur || 0), doorKey(dk), mapCanvas.clientWidth].join(',');
  if (key === mapKey) return; mapKey = key;
  const W = mapCanvas.clientWidth, H = mapCanvas.clientHeight, dpr = window.devicePixelRatio || 1;
  if (!W || !H) return;
  mapCanvas.width = W * dpr; mapCanvas.height = H * dpr;
  const x = mapCtx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
  $('#map-title').textContent = dk >= 0 ? (LANG !== 'fr' ? LD().decks.short[dk] || EN.decks.short[dk] : D.deckShort[dk]) : T('Hors plan');
  const away = $('#map-mon');
  away.hidden = !(blinking && mdk >= 0 && mdk !== dk && st.monster !== 0x14);
  if (!away.hidden) { away.textContent = T('Monstre · {0}', deckOrd(mdk)); away.style.opacity = 0.45 + 0.55 * phase; }
  if (dk < 0) return;
  const deck = D.map[dk];
  const [x0, z0, x1, z1] = deck.bbox;
  const pad = 10, sc = Math.min((W - 2 * pad) / (x1 - x0), (H - 2 * pad) / (z1 - z0));
  // the game's z axis points "north"; draw it upwards
  const ox = (W - (x1 - x0) * sc) / 2, oy = (H - (z1 - z0) * sc) / 2;
  const P = (X, Z) => [ox + (X - x0) * sc, H - (oy + (Z - z0) * sc)];
  const cur = st.room.toString(16).toUpperCase().padStart(2, '0');
  const mon = st.monster.toString(16).toUpperCase().padStart(2, '0');
  // map transform of a space: the airlock is turned about its pivot
  const sasSp = deck.spaces['05'];
  let sasC = null;
  if (sasSp) { const [cx, cz] = rot(SAS_PIVOT[0], SAS_PIVOT[1], sasSp.phi); sasC = [cx + sasSp.t[0], cz + sasSp.t[1]]; }
  const PS = (X, Z) => { const [rx, rz] = rot(X - sasC[0], Z - sasC[1], sas.cur || 0); return P(rx + sasC[0], rz + sasC[1]); };
  for (const [id, sp0] of Object.entries(deck.spaces)) {
    const sp = sp0, Pm = id === '05' && sasC ? PS : P;
    const r = parseInt(id, 16);
    const visited = r < 0x80 && (g.roomFlags(r) & 0x80);
    const isMon = blinking && id === mon;
    if (isMon) {
      x.fillStyle = `rgba(255,50,50,${(0.12 + 0.5 * phase).toFixed(3)})`;
      fillSpace(x, sp, Pm);
    }
    x.strokeStyle = id === cur ? '#7fe3ff' : isMon ? `rgba(255,90,90,${(0.45 + 0.55 * phase).toFixed(3)})` : visited ? 'rgba(200,215,235,.75)' : 'rgba(150,165,190,.38)';
    x.lineWidth = id === cur || isMon ? 2 : 1;
    x.beginPath();
    for (const s of sp.segs) { const a = Pm(s[0], s[1]), b = Pm(s[2], s[3]); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); }
    x.stroke();
  }
  // doors: green when open, amber when closed, white while moving
  for (const [d, ax, az, bx, bz] of (D.deckDoors[dk] || [])) {
    const st2 = g.read(0x448F + 9 * d + 2) & 3;
    const p1 = P(ax, az), p2 = P(bx, bz);
    x.strokeStyle = st2 === 1 || st2 === 3 ? '#5fe08a' : st2 === 2 ? '#ffffff' : '#ffaa3c';
    x.lineWidth = 3; x.lineCap = 'round';
    x.beginPath(); x.moveTo(p1[0], p1[1]); x.lineTo(p2[0], p2[1]); x.stroke();
  }
  x.lineCap = 'butt';
  // room symbols: breakers (lightning bolt) and bedrooms (bed)
  const ICONS = { '08': 'bolt', '15': 'bolt', '11': 'bed', '1B': 'bed', '1C': 'bed', '17': 'bed' };
  for (const [id, kind] of Object.entries(ICONS)) {
    const isp = deck.spaces[id]; if (!isp) continue;
    const c = P(isp.c[0], isp.c[1]), s = Math.max(6, Math.min(9, sc * 12));
    x.save(); x.translate(c[0], c[1]);
    if (kind === 'bolt') {
      x.fillStyle = '#ffd36b';
      x.beginPath(); x.moveTo(s * 0.25, -s * 1.1); x.lineTo(-s * 0.55, s * 0.1); x.lineTo(-s * 0.05, s * 0.1); x.lineTo(-s * 0.3, s * 1.1); x.lineTo(s * 0.55, -s * 0.15); x.lineTo(s * 0.05, -s * 0.15); x.closePath(); x.fill();
    } else {
      x.strokeStyle = '#cfe6ff'; x.fillStyle = '#cfe6ff'; x.lineWidth = Math.max(1.2, s * 0.18); x.lineJoin = 'round';
      x.beginPath(); x.moveTo(-s, -s * 0.7); x.lineTo(-s, s * 0.7); x.moveTo(-s, s * 0.15); x.lineTo(s, s * 0.15); x.lineTo(s, s * 0.7); x.stroke();   // headboard, frame, foot
      x.fillRect(-s * 0.85, -s * 0.3, s * 0.55, s * 0.4);                                                              // pillow
      x.beginPath(); x.moveTo(-s * 0.2, -s * 0.15); x.lineTo(s, -s * 0.15); x.lineTo(s, s * 0.12); x.lineTo(-s * 0.2, s * 0.12); x.closePath(); x.fill();   // blanket
    }
    x.restore();
  }
  // lift: two arrows up and down at the centre of the cabin
  const liftSp = deck.spaces['14'];
  if (liftSp) {
    const c = P(liftSp.c[0], liftSp.c[1]), s = Math.max(6, Math.min(9, sc * 12));
    x.fillStyle = '#cfe6ff';
    x.beginPath(); x.moveTo(c[0] - s * 1.1, c[1] - s * 0.15); x.lineTo(c[0] - s * 0.15, c[1] - s * 0.15); x.lineTo(c[0] - s * 0.62, c[1] - s * 1.05); x.closePath(); x.fill();   // up
    x.beginPath(); x.moveTo(c[0] + s * 0.15, c[1] + s * 0.15); x.lineTo(c[0] + s * 1.1, c[1] + s * 0.15); x.lineTo(c[0] + s * 0.62, c[1] + s * 1.05); x.closePath(); x.fill();   // down
  }
  if (sasSp && sasC) {
    // the airlock's single opening (exit zone x 52-60, z 18-42), drawn as a bright mark that turns with it
    const L = (lx, lz) => { const [qx, qz] = rot(lx, lz, sasSp.phi); return PS(qx + sasSp.t[0], qz + sasSp.t[1]); };
    const a1 = L(58, 18), a2 = L(58, 42), c0 = L(SAS_PIVOT[0], SAS_PIVOT[1]), m = L(52, 30);
    x.strokeStyle = sasMoving ? '#ffd36b' : 'rgba(255,211,107,.85)'; x.lineWidth = 3; x.lineCap = 'round';
    x.beginPath(); x.moveTo(a1[0], a1[1]); x.lineTo(a2[0], a2[1]); x.stroke();
    x.lineWidth = 1; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(c0[0], c0[1]); x.lineTo(m[0], m[1]); x.stroke(); x.setLineDash([]); x.lineCap = 'butt';
  }
  const sp = deck.spaces[cur] || (st.room === 0x0A ? deck.spaces['01'] : null);
  if (sp) {
    const inSas = cur === '05' && sasC;
    const [lx, lz] = rot(st.x, st.z, sp.phi);
    const p = (inSas ? PS : P)(lx + sp.t[0], lz + sp.t[1]);
    const th = st.heading * Math.PI / 128;
    const [dx, dz] = rot(-Math.sin(th), Math.cos(th), sp.phi + (inSas ? sas.cur : 0));
    const ang = Math.atan2(-dz, dx);
    x.save(); x.translate(p[0], p[1]); x.rotate(ang);
    x.fillStyle = '#ffd36b'; x.beginPath(); x.moveTo(8, 0); x.lineTo(-5, 5); x.lineTo(-2, 0); x.lineTo(-5, -5); x.closePath(); x.fill();
    x.restore();
  }
}

// ---------- 3D scene ----------
let sceneSig = '', sceneRoom = -1, winRoom = -1, holeRoom = '', lightKey = '';
// rooms whose open side looks onto space (shuttle cockpit windscreen, meditation bay): stars behind; elsewhere gaps stay black
const SPACE_VIEW = new Set([]);
// meditation room (and Eureka): glass end wall; the two plates floating outside stay as outlines so both show against the stars
const MEDIT = [
  { pts: [[188, 0, 0], [188, 0, 160], [188, 60, 160], [188, 60, 0]], stars: true, hole: true },
  { pts: [[226, 10, 30], [226, 10, 130], [226, 50, 130], [226, 50, 30]], stars: true, hole: true },
  { pts: [[255, 25, 70], [255, 25, 90], [255, 35, 90], [255, 35, 70]], stars: true, hole: true }];
// windows the reconstruction fills with a face, or leaves open: drawn black (with stars when they look onto space)
// shuttle windscreen: space only shows once the hangar's outer door is open (&E7D7 = 0) or the shuttle has left (&649F)
const OUTER_OPEN = () => g.read(0xE7D7) === 0 || g.read(0x649F) !== 0;
const WINDOWS = {
  // meditation room (and Eureka, same model): the end wall is glass, with the two plates floating outside
  0x1D: MEDIT, 0x1E: MEDIT,
  0x19: [{ pts: [[160, 3, 73], [160, 3, 97], [160, 17, 97], [160, 17, 73]], state: 0x02, when: 1 }],   // officers' mess: the safe, once open
  // shuttle hangar: the octagonal outer door at the x = 0 end opens onto space when the door is open (&E7D7 = 0)
  // and the bay at the other end (x = 200) is closed by a plain panel
  0x24: [{ pts: [[0, 10, 48], [0, 0, 58], [0, 0, 88], [0, 56, 88], [0, 56, 58], [0, 46, 48]], stars: true, show: OUTER_OPEN },
         { pts: [[0, 10, 48], [0, 0, 58], [0, 0, 88], [0, 56, 88], [0, 56, 58], [0, 46, 48]], fill: true, show: () => !OUTER_OPEN() },
         { pts: [[200, 12, 12], [200, 12, 56], [200, 52, 56], [200, 52, 12]], fill: true }],
  0x04: [{ pts: [[45, 30, 60], [100, 30, 60], [100, 50, 60], [45, 50, 60]], view: true }],   // hangar control: window onto the hangar (drawn through it, see HANGAR_VIEW)
  // maintenance hatches: open when the model's state is 0 (state 1 draws the closed grille and its screws)
  0x06: [{ pts: [[0, 5, 48], [0, 5, 74], [0, 19, 74], [0, 19, 48]], state: 0x16 }],
  0x21: [{ pts: [[0, 5, 48], [0, 5, 74], [0, 19, 74], [0, 19, 48]], state: 0x16 }],
  0x09: [{ pts: [[8, 5, 0], [34, 5, 0], [34, 19, 0], [8, 19, 0]], state: 0x16 },
         { pts: [[7, 60, 45], [33, 60, 45], [33, 60, 60], [7, 60, 60]] }],                    // shaft up the ladder
  0x20: [{ pts: [[8, 5, 0], [34, 5, 0], [34, 19, 0], [8, 19, 0]], state: 0x17 },
         { pts: [[7, 0, 45], [33, 0, 45], [33, 0, 60], [7, 0, 60]] }],                        // shaft down the ladder
  // bedrooms: the double-framed rectangle above the bed (&11), the high band of the end wall (&1B, &1C) look onto space
  0x11: [{ pts: [[20, 30, 80], [65, 30, 80], [65, 50, 80], [20, 50, 80]], stars: true }],
  0x1B: [{ pts: [[0,25,148],[104,25,148],[104,52,148],[0,52,148]], stars: true }],
  0x1C: [{ pts: [[0,25,148],[104,25,148],[104,52,148],[0,52,148]], stars: true }],
  // commander's room: the two slanted faces of the bow point, above the desk, are a bay window (frame and centre post stay)
  // (the panes sit 1.5 units inside the room: the wall behind them is slightly warped and would poke through)
  0x17: [{ pts: [[4.83,24,161.45],[56.83,24,196.05],[56.83,56,196.05],[4.83,56,161.45]], stars: true },
         { pts: [[63.17,24,196.05],[115.17,24,161.45],[115.17,56,161.45],[63.17,56,196.05]], stars: true }],
  // trans-photonic transceiver: the three upper rings of the dome are glass (bottom ring and cap stay opaque)
  0x0C: [{ pts: [[224,41,163],[205,77,155],[205,77,85],[224,41,77]], stars: true }, { pts: [[163,41,224],[155,77,205],[205,77,155],[224,41,163]], stars: true }, { pts: [[155,77,35],[140,77,30],[140,41,9],[163,41,16]], stars: true }, { pts: [[143,104,65],[140,77,30],[155,77,35]], stars: true }, { pts: [[175,104,97],[175,104,143],[139,118,128],[139,118,112]], stars: true }, { pts: [[77,41,224],[85,77,205],[155,77,205],[163,41,224]], stars: true }, { pts: [[175,104,143],[143,104,175],[128,118,139],[139,118,128]], stars: true }, { pts: [[101,118,112],[101,118,128],[65,104,143],[65,104,97]], stars: true }, { pts: [[16,41,163],[35,77,155],[85,77,205],[77,41,224]], stars: true }, { pts: [[143,104,175],[97,104,175],[112,118,139],[128,118,139]], stars: true }, { pts: [[100,41,9],[100,77,30],[85,77,35],[77,41,16]], stars: true }, { pts: [[224,41,77],[205,77,85],[155,77,35],[163,41,16]], stars: true }, { pts: [[205,77,155],[175,104,143],[175,104,97],[205,77,85]], stars: true }, { pts: [[155,77,205],[143,104,175],[175,104,143],[205,77,155]], stars: true }, { pts: [[85,77,35],[35,77,85],[16,41,77],[77,41,16]], stars: true }, { pts: [[16,41,77],[35,77,85],[35,77,155],[16,41,163]], stars: true }, { pts: [[85,77,205],[97,104,175],[143,104,175],[155,77,205]], stars: true }, { pts: [[100,77,30],[97,104,65],[85,77,35]], stars: true }, { pts: [[85,77,35],[97,104,65],[65,104,97],[35,77,85]], stars: true }, { pts: [[35,77,155],[65,104,143],[97,104,175],[85,77,205]], stars: true }, { pts: [[65,104,143],[101,118,128],[112,118,139],[97,104,175]], stars: true }, { pts: [[205,77,85],[175,104,97],[143,104,65],[155,77,35]], stars: true }, { pts: [[175,104,97],[139,118,112],[143,104,65]], stars: true }, { pts: [[97,104,65],[101,118,112],[65,104,97]], stars: true }, { pts: [[35,77,85],[65,104,97],[65,104,143],[35,77,155]], stars: true }],
  // transmission and astrogation rooms: slanted glass roof above the consoles
  0x0E: [{ pts: [[66,72,84],[78,60,120],[0,60,120],[0,72,84]], stars: true }, { pts: [[78,60,120],[84,48,132],[0,48,132],[0,60,120]], stars: true }],
  0x0F: [{ pts: [[168,72,84],[168,60,120],[90,60,120],[102,72,84]], stars: true }, { pts: [[168,60,120],[168,48,132],[84,48,132],[90,60,120]], stars: true }],
  0x25: [                                                                                       // shuttle cockpit windscreen
    { pts: [[4, 24, 53], [25, 24, 74], [25, 40, 74], [4, 40, 53]], stars: true, show: OUTER_OPEN },
    { pts: [[25, 24, 74], [55, 24, 74], [55, 40, 74], [25, 40, 74]], stars: true, show: OUTER_OPEN },
    { pts: [[55, 24, 74], [76, 24, 53], [76, 40, 53], [55, 40, 74]], stars: true, show: OUTER_OPEN }],
};
window.reliefWindows = WINDOWS;
// the hangar seen from its control room: the hangar's own model (room table &4044) drawn behind the window. The lower deck
// assembly would put the window edge-on to the outer door, so the hangar is laid out as seen down its length from the far
// bay: hangar +z -> control +x, hangar -x -> control +z (a quarter turn), the octagonal outer door facing the window.
// The door is a plain panel while closed and opens onto space when &E7D7 = 0.
const HANGAR_DOOR = [[0, 10, 48], [0, 0, 58], [0, 0, 88], [0, 56, 88], [0, 56, 58], [0, 46, 48]];
const HANGAR_CUT = 125;   // only the far part of the hangar (x < 125) lies beyond the window
const HANGAR_TO_CTRL = p => [72 + (p[2] - 44), p[1] + 14, 64 + (HANGAR_CUT - p[0])];
let viewKey = '';
function hangarView() {
  const ptr = g.read(0x4044 + 2 * 0x24) | g.read(0x4045 + 2 * 0x24) << 8;
  const m = ReliefGeom.decodeModel(g.read, ptr, n => g.read(0xE7D0 + n));
  const mv = HANGAR_TO_CTRL;
  const open = OUTER_OPEN();
  return { verts: m.verts.map(v => v && v[0] <= HANGAR_CUT ? mv(v) : null), lines: m.lines, fills: open ? [] : [HANGAR_DOOR.map(mv)], sky: open ? [HANGAR_DOOR.map(mv)] : [] };
}
const cam = { x: 40, y: 28, z: 32, yaw: 0, pitch: 0, focal: 150 };
let camInit = false;
// vector sequences drawn by the game outside of the rooms (death skull...): replay its 2D lines crisp and full size
let vecLines = null, vecUntil = 0;
const vecCanvas = $('#vec'), vecCtx = vecCanvas.getContext('2d');
function drawVec() {
  const show = !!vecLines && (performance.now() < vecUntil || g.ctx === 'over');
  vecCanvas.hidden = !show;
  if (!show) return;
  const W = vecCanvas.clientWidth, H = vecCanvas.clientHeight, dpr = window.devicePixelRatio || 1;
  if (vecCanvas.width !== Math.round(W * dpr) || vecCanvas.height !== Math.round(H * dpr)) { vecCanvas.width = Math.round(W * dpr); vecCanvas.height = Math.round(H * dpr); }
  const x = vecCtx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  // window 223 x 127 CPC mode-1 pixels, displayed at the CPC's pixel aspect (about 0.83)
  const aw = 223 * 0.83, ah = 127, sc = Math.min(W * 0.92 / aw, H * 0.82 / ah);
  const ox = (W - aw * sc) / 2, oy = (H - ah * sc) / 2 - H * 0.04;
  x.lineCap = 'round'; x.strokeStyle = '#eef4ff'; x.lineWidth = Math.max(1.5, sc * 0.9);
  x.shadowColor = 'rgba(140,190,255,.85)'; x.shadowBlur = sc * 5;
  x.beginPath();
  const L = vecLines;
  for (let i = 0; i < L.length; i += 4) { x.moveTo(ox + L[i] * 0.83 * sc, oy + L[i + 1] * sc); x.lineTo(ox + L[i + 2] * 0.83 * sc, oy + L[i + 3] * sc); }
  x.stroke(); x.shadowBlur = 0;
}
g.on('scene', s => {
  // a render without the room model but with lines is one of the game's vector sequences
  if (s.dark && s.lines2d && s.lines2d.length >= 8) { vecLines = s.lines2d.slice(); vecUntil = performance.now() + 1500; }
  else if (!s.dark) { vecLines = null; }
  if (!R) return;
  const sig = (s.portals || []).map(p => p.door + ':' + p.open).join(',') + '#' + s.models.map(m => m.kind + m.ptr + ':' + m.lines.length + ':' + m.verts.filter(Boolean).map(v => v.map(c => Math.round(c * 4)).join(',')).join('|')).join(';') + '|' + s.room;
  const holeKey = s.room + ':' + (WINDOWS[s.room] || []).filter(w => w.hole).length;
  if (holeKey !== holeRoom) { holeRoom = holeKey; R.setHoles((WINDOWS[s.room] || []).filter(w => w.hole)); sceneSig = ''; }
  if (sig !== sceneSig) { sceneSig = sig; R.setScene(s); }
  R.anaglyph = !!s.relief;
  R.starsBg = SPACE_VIEW.has(s.room);
  // lift: the floor indicator the game draws (state 1: 0 = 1er, 1 = 2e, 2 = 3e) lit in amber
  const lk = s.room === 0x14 ? 'lift' + g.read(0xE7D1) : '';
  if (lk !== lightKey) { lightKey = lk;
    if (lk) { const z0 = [30, 21, 12][g.read(0xE7D1)] || 30; R.setLights([{ pts: [[60, 54, z0], [60, 54, z0 + 3], [60, 57, z0 + 3], [60, 57, z0]], col: [1, 0.78, 0.32] }]); }
    else R.setLights([]);
  }
  const wl = (WINDOWS[s.room] || []).filter(w => w.show ? w.show() : w.state === undefined || g.read(0xE7D0 + w.state) === (w.when || 0));
  const wk = s.room + ':' + wl.length + ':' + wl.map(w => w.pts[0].join(',')).join(';');
  if (wk !== winRoom) { winRoom = wk; R.setWindows(wl); }
  const vk = s.room === 0x04 ? 'hangar' + OUTER_OPEN() : '';
  if (vk !== viewKey && R.setView) { viewKey = vk; try { R.setView(vk ? hangarView() : null); } catch (e) { R.setView(null); } }
  if (s.room !== sceneRoom || !camInit) {
    sceneRoom = s.room; camInit = true;
    cam.x = s.cam.x; cam.y = s.cam.y; cam.z = s.cam.z; cam.yaw = s.cam.heading * Math.PI / 128; cam.pitch = s.cam.pitch * Math.PI / 128;
  }
  updateMarkers(s.room);
});
function updateMarkers(room) {
  if (!R || !R.setMarkers) return;
  if (!prefs.hotspots) { R.setMarkers([]); return; }
  const mk = [];
  for (let i = 0; i < 43; i++) {
    const a = 0x6DDC + i * 4, r = g.read(a);
    if ((r & 0x7F) !== room) continue;
    mk.push({ x: g.read(a + 1), y: g.read(a + 2), z: g.read(a + 3), on: !!(r & 0x80) });
  }
  R.setMarkers(mk);
}
function updateCamera(dt) {
  const st = g.state();
  if (st.room === sceneRoom) {
    const k = 1 - Math.exp(-dt / 70);
    cam.x += (st.x - cam.x) * k; cam.z += (st.z - cam.z) * k; cam.y += (st.y - cam.y) * k;
    let ty = st.heading * Math.PI / 128, d = ty - cam.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    cam.yaw += d * k;
    cam.pitch += (st.pitch * Math.PI / 128 - cam.pitch) * k;
  }
  cam.focal += ((st.focal || 150) - cam.focal) * (1 - Math.exp(-dt / 160));   // visor / glasses: ease the change of perspective
  if (R) { R.cam.x = cam.x; R.cam.y = cam.y; R.cam.z = cam.z; R.cam.yaw = cam.yaw; R.cam.pitch = cam.pitch; R.cam.focal = cam.focal; }
}

// ---------- input: keyboard ----------
const held = new Set();
const KEYMAP = { KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'sl', KeyD: 'sr', ArrowLeft: 'tl', ArrowRight: 'tr', KeyQ: 'tl', KeyE: 'tr', KeyR: 'up', KeyF: 'down', PageUp: 'up', PageDown: 'down' };
function specialCtx() { const c = g.ctx; if (c === 'epilogue') return true; return !!c && !(c === 'move' || c === 'menu' || c === 'box' || c === 'wait'); }
function cpcKeyFromEvent(e) {
  if (e.key.length === 1) {
    const ch = e.key.toUpperCase();
    if (/[A-Z0-9]/.test(ch)) return ch;
    if (ch === ' ') return 'SPACE';
    if (ch === '.') return '.';
  }
  return { Enter: 'RETURN', Backspace: 'DEL', Escape: 'ESC', Delete: 'CLR', Tab: 'TAB', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', Shift: 'SHIFT', Control: 'CTRL' }[e.key] || null;
}
const cpcHeld = new Map();
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if ($('#start') && !$('#start').hidden) { if (e.key === 'Enter' || e.key === ' ') { startGame(); e.preventDefault(); } return; }
  if (e.key === 'F5' || e.key === 'F9') { e.preventDefault(); if (!e.repeat) { if (e.key === 'F5') saveSlot(0); else loadSlot(0); } return; }
  if (specialCtx()) {
    const k = cpcKeyFromEvent(e);
    if (k) { if (!e.repeat) { g.cpc.key(k, true); cpcHeld.set(e.code, { k, polls: g.polls }); } e.preventDefault(); }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const it = KEYMAP[e.code];
  if (it) { held.add(e.code); syncIntent(); e.preventDefault(); return; }
  if (e.repeat) return;
  const digit = e.code.startsWith('Digit') ? e.code.slice(5) : e.code.startsWith('Numpad') ? e.code.slice(6) : null;
  if (digit !== null && /^[0-9]$/.test(digit)) {
    if (g.ctx === 'box') { const k = +digit - 1; if (k >= 0 && k < 4) g.push({ type: 'box', b: k, tries: 0 }); }
    else { const v = Object.keys(VERB_KEYS).find(v => VERB_KEYS[v] === digit); if (v) doVerb(+v); }
    e.preventDefault(); return;
  }
  switch (e.code) {
    case 'KeyT': doVerb(2); break;                     // take
    case 'KeyU': doVerb(4); break;                     // use
    case 'KeyO': case 'Space': useRemote(); break;     // door remote
    case 'KeyM': toggle('map'); break;
    case 'KeyV': toggle('mode'); break;
    case 'KeyC': toggle('cpc'); break;
    case 'KeyH': case 'F1': openHelp(); break;
    case 'Escape': if (g.ctx === 'box') cancelBox(); closeOverlays(); break;
    case 'BracketLeft': case 'Comma': { const s = g.state().slot; g.push({ type: 'slot', s: s === 1 ? 9 : s - 1, tries: 0 }); break; }
    case 'BracketRight': case 'Period': case 'Tab': { const s = g.state().slot; g.push({ type: 'slot', s: s === 9 ? 1 : s + 1, tries: 0 }); break; }
    case 'Enter': if (g.ctx === 'box') g.push({ type: 'box', b: g.state().box & 3, tries: 0 }); else doVerb(g.state().verb === 3 ? 2 : g.state().verb); break;
    default: return;
  }
  e.preventDefault();
});
window.addEventListener('keyup', e => {
  if (cpcHeld.has(e.code)) { const h = cpcHeld.get(e.code); cpcHeld.delete(e.code); releaseAfterPoll(h.k, h.polls); }
  if (held.delete(e.code)) syncIntent();
});
window.addEventListener('blur', () => { held.clear(); syncIntent(); for (const h of cpcHeld.values()) g.cpc.key(h.k, false); cpcHeld.clear(); });
// a CPC key must stay down until the game has polled the keyboard at least twice
function releaseAfterPoll(k, polls0) {
  const t0 = performance.now();
  const iv = setInterval(() => { if (g.polls >= polls0 + 2 || performance.now() - t0 > 3000) { g.cpc.key(k, false); clearInterval(iv); } }, 15);
}

// pointer-driven turning target (mouse drag / touch look)
// pointer look: a target heading / pitch (game units, 256 per turn), dropped once reached or after a short delay
const look = { h: null, p: null, t: 0 };
const LOOK_TIMEOUT = 220;                    // ms after the last pointer movement
function lookDiffs(st) {
  const dh = look.h === null ? 0 : ((look.h - st.heading) % 256 + 384) % 256 - 128;
  const dp = look.p === null ? 0 : look.p - st.pitch;
  return [dh, dp];
}
const stick = { x: 0, y: 0 };               // virtual joystick / gamepad left stick (-1..1)
const stickR = { x: 0, y: 0 };              // gamepad right stick
function syncIntent() {
  if (window.__autopilot) return;
  const it = { fwd: 0, back: 0, sl: 0, sr: 0, tl: 0, tr: 0, up: 0, down: 0 };
  for (const c of held) it[KEYMAP[c]] = 1;
  if (stick.y < -0.35) it.fwd = 1; if (stick.y > 0.35) it.back = 1;
  if (stick.x < -0.45) it.sl = 1; if (stick.x > 0.45) it.sr = 1;
  if (stickR.x < -0.35) it.tl = 1; if (stickR.x > 0.35) it.tr = 1;
  if (stickR.y < -0.5) it[prefs.invertY ? 'down' : 'up'] = 1; if (stickR.y > 0.5) it[prefs.invertY ? 'up' : 'down'] = 1;
  if (it.tl || it.tr) look.h = null;
  if (it.up || it.down) look.p = null;
  if (look.h !== null || look.p !== null) {
    const [dh, dp] = lookDiffs(g.state());
    if (dh >= 4) it.tl = 1; else if (dh <= -4) it.tr = 1;
    if (dp >= 4) it.up = 1; else if (dp <= -4) it.down = 1;
  }
  // the game: joystick "up" with fire pitches down; Relief maps it in game.js through J_UP for 'up'
  g.intent.fwd = it.fwd; g.intent.back = it.back; g.intent.sl = it.sl; g.intent.sr = it.sr;
  g.intent.tl = it.tl; g.intent.tr = it.tr; g.intent.up = it.down; g.intent.down = it.up;
}
// consume pointer look as the game turns
let lastHeading = null, lastPitch = null;
function trackLook() {
  if (look.h !== null || look.p !== null) {
    const st = g.state(), [dh, dp] = lookDiffs(st);
    if (Math.abs(dh) < 4) look.h = null;
    if (Math.abs(dp) < 4 || (st.pitch <= -32 && dp < 0) || (st.pitch >= 31 && dp > 0)) look.p = null;
    if (performance.now() - look.t > LOOK_TIMEOUT || specialCtx() || g.ctx === 'box') { look.h = null; look.p = null; }
  }
  syncIntent();
}

// ---------- mouse / touch on the view ----------
const view = $('#view');
let drag = null;
view.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.42 && touchUI) return; // left side: joystick
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  view.setPointerCapture(e.pointerId);
});
view.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  const k = 0.32 * prefs.sens;
  addLook(-dx * k, -dy * k * (prefs.invertY ? -1 : 1));
  syncIntent();
});
const endDrag = e => { if (drag && e.pointerId === drag.id) drag = null; };
view.addEventListener('pointerup', endDrag); view.addEventListener('pointercancel', endDrag);
view.addEventListener('wheel', e => { addLook(0, -Math.sign(e.deltaY) * 8); e.preventDefault(); }, { passive: false });
function addLook(dyaw, dpitch) {
  const st = g.state();
  if (dyaw) { if (look.h === null) look.h = st.heading; const cur = ((look.h - st.heading) % 256 + 384) % 256 - 128; look.h = st.heading + Math.max(-14, Math.min(14, cur + dyaw)); }
  if (dpitch) { if (look.p === null) look.p = st.pitch; look.p = Math.max(Math.max(-32, st.pitch - 12), Math.min(Math.min(31, st.pitch + 12), look.p + dpitch)); }
  look.t = performance.now();
  syncIntent();
}

// virtual joystick
const touchUI = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', touchUI);
const joy = $('#joy'), knob = $('#knob');
let joyId = null, joyC = null;
joy.addEventListener('pointerdown', e => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); const r = joy.getBoundingClientRect(); joyC = [r.left + r.width / 2, r.top + r.height / 2, r.width / 2]; moveJoy(e); });
joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) moveJoy(e); });
const endJoy = e => { if (e.pointerId !== joyId) return; joyId = null; stick.x = stick.y = 0; knob.style.transform = ''; syncIntent(); };
joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
function moveJoy(e) {
  let dx = (e.clientX - joyC[0]) / joyC[2], dy = (e.clientY - joyC[1]) / joyC[2];
  const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
  stick.x = dx; stick.y = dy; knob.style.transform = `translate(${dx * joyC[2] * 0.6}px, ${dy * joyC[2] * 0.6}px)`;
  syncIntent();
}

// ---------- gamepad ----------
let padPrev = [], padActive = false, padRest = [];
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = [...pads].find(x => x && x.connected);
  if (!p) return;
  // some devices report as gamepads with axes resting off-centre: only listen once a button was pressed,
  // and measure each axis's rest value at that moment
  if (!padActive) {
    if (!p.buttons.some(b => b.pressed)) return;
    padActive = true; padRest = p.axes.map(v => (Math.abs(v) < 0.6 ? v : 0));
  }
  const ax = i => (p.axes[i] || 0) - (padRest[i] || 0);
  const dz = v => Math.abs(v) < 0.25 ? 0 : v;
  stick.x = dz(ax(0)); stick.y = dz(ax(1));
  stickR.x = dz(ax(2)); stickR.y = dz(ax(3));
  const b = i => p.buttons[i] && p.buttons[i].pressed;
  const pressed = i => b(i) && !padPrev[i];
  // D-pad drives the original menus directly (verbs up/down, inventory left/right, room objects)
  let raw = 0;
  if (b(12)) raw |= 1; if (b(13)) raw |= 2; if (b(14)) raw |= 4; if (b(15)) raw |= 8;
  if (b(0)) raw |= 16;
  const c = g.ctx;
  g.rawJoy = (c === 'menu' || c === 'box') ? raw : 0;
  if (raw && c === 'move') g.push({ type: 'exitMove', tries: 0 });
  if (pressed(1)) { if (c === 'box') cancelBox(); closeOverlays(); }
  if (pressed(2)) doVerb(2);
  if (pressed(4)) useRemote();
  if (pressed(3)) toggle('map');
  if (pressed(8)) toggle('mode');
  if (pressed(9)) openSettings();
  padPrev = p.buttons.map(x => x.pressed);
  syncIntent();
  document.body.classList.add('pad');
}

// ---------- toggles / settings ----------
function toggle(what) {
  if (what === 'mode') { prefs.mode = prefs.mode === 'solid' ? 'wire' : 'solid'; if (R) R.mode = prefs.mode; }
  else prefs[what] = !prefs[what];
  applyPrefs(); savePrefs();
}
function applyPrefs() {
  $('#mapbox').hidden = !prefs.map; mapKey = '';
  $('#b-map').classList.toggle('on', prefs.map);
  $('#b-mode').classList.toggle('on', prefs.mode === 'wire');
  $('#b-mode').title = T(prefs.mode === 'solid' ? 'Passer en fil de fer (V)' : 'Passer en faces pleines (V)');
  $('#b-cpc').classList.toggle('on', prefs.cpc);
  $('#b-monster').classList.toggle('off', !prefs.monster);
  $('#b-monster .lbl').textContent = T(prefs.monster ? 'Monstre' : 'Monstre désactivé');
  if (g.monsterOff === prefs.monster) g.setMonster(prefs.monster);
  if (!!g.infTime !== !!prefs.infTime) g.setInfiniteTime(prefs.infTime);
  g.turbo = prefs.turbo;
  $$('#settings input[data-pref]').forEach(i => { i.checked = !!prefs[i.dataset.pref]; });
  updateMarkers(g.state().room);
}
$('#b-map').onclick = () => toggle('map');
$('#b-mode').onclick = () => toggle('mode');
$('#b-cpc').onclick = () => toggle('cpc');
$('#b-monster').onclick = () => { toggle('monster'); say(T(prefs.monster ? 'Monstre activé.' : 'Monstre désactivé : il ne bouge plus et ne tue plus.'), 'sys'); };
$('#b-set').onclick = () => openSettings();
$('#b-help').onclick = () => openHelp();
$('#b-full').onclick = () => { const d = document.documentElement, D = document;   // Safari still uses the webkit-prefixed names
  if (!(D.fullscreenElement || D.webkitFullscreenElement)) (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); else (D.exitFullscreen || D.webkitExitFullscreen).call(D); };
$$('#settings input[data-pref]').forEach(i => i.addEventListener('change', () => { prefs[i.dataset.pref] = i.checked; applyPrefs(); savePrefs(); }));
function openSettings() { $('#settings').hidden = false; }
function openHelp() { $('#help').hidden = false; }
function closeOverlays() { $('#settings').hidden = true; $('#help').hidden = true; const sv = $('#saves'); if (sv) sv.hidden = true; }
$$('.close').forEach(b => b.onclick = closeOverlays);
$('#panel-toggle').onclick = () => document.body.classList.toggle('panel-hidden');

// save / load (emulator snapshot)
const SAVE_KEY = 'relief-action-save-v1';
function snapshot() {
  const c = g.cpc;
  let bin = ''; const ram = c.ram; for (let i = 0; i < ram.length; i += 8192) bin += String.fromCharCode.apply(null, ram.subarray(i, i + 8192));
  return JSON.stringify({ ram: btoa(bin), cpu: c.cpu.getState(), ink: [...c.ga.ink], mode: c.ga.mode, crtc: [...c.crtc.reg], t: Date.now(), scene: g.scene || null });
}
function restore(js) {
  const s = JSON.parse(js), c = g.cpc;
  c.ram.set(Uint8Array.from(atob(s.ram), ch => ch.charCodeAt(0)));
  c.cpu.setState(s.cpu); c.ga.ink.set(s.ink); c.ga.mode = s.mode; c.crtc.reg.set(s.crtc);
  g.queue = []; g.release = 0; lastPhraseId = -1; sceneSig = ''; sceneRoom = -1; camInit = false; shownRoom = -1; codePrev = null;
  g.setMonster(prefs.monster); g.setInfiniteTime(prefs.infTime); applyCpcVerbs();
  // the game only redraws when it moves: bring back the view that was on screen when the game was saved
  g.scene = s.scene || null;
  if (s.scene) (g.listeners.scene || []).forEach(f => f(s.scene));
}
// ---------- save slots ----------
const SLOT_KEY = n => 'relief-action-slot-' + n;          // 0 = sauvegarde rapide, 1..3
const SLOT_NAMES = ['Sauvegarde rapide', 'Emplacement 1', 'Emplacement 2', 'Emplacement 3'];
try { const old = localStorage.getItem(SAVE_KEY); if (old && !localStorage.getItem(SLOT_KEY(1))) { localStorage.setItem(SLOT_KEY(1), old); localStorage.removeItem(SAVE_KEY); } } catch (e) {}
function snapMeta() {
  const st = g.state();
  const items = st.inv.filter(o => o != null).length;
  return { room: roomLabel(st.room), deck: deckOf(st), items, monster: prefs.monster };
}
function readSlot(n) { try { const s = localStorage.getItem(SLOT_KEY(n)); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function canSave() { return running && g.ctx !== 'epilogue' && g.ctx !== 'over'; }
function saveSlot(n) {
  if (!canSave()) { say(T('Impossible de sauvegarder maintenant.'), 'sys'); return false; }
  const s = JSON.parse(snapshot()); s.meta = snapMeta();
  try { localStorage.setItem(SLOT_KEY(n), JSON.stringify(s)); } catch (e) { say(T('Sauvegarde impossible : stockage du navigateur plein ou indisponible.'), 'sys'); return false; }
  say(T('{0} : partie sauvegardée ({1}).', T(SLOT_NAMES[n]), s.meta.room), 'sys'); renderSlots(); return true;
}
function loadSlot(n) {
  const s = readSlot(n); if (!s) { say(T('{0} : vide.', T(SLOT_NAMES[n])), 'sys'); return false; }
  loadSnap(s); say(T('{0} chargée{1}.', T(SLOT_NAMES[n]), s.meta ? ' (' + s.meta.room + ')' : ''), 'sys'); return true;
}
function loadSnap(s) {
  if (!s || !s.ram || !s.cpu) throw new Error('fichier invalide');
  if (g.epilogue) { g.reset(); }
  $('#start').hidden = true; running = true;
  restore(JSON.stringify(s)); closeOverlays();
}
const fmtDate = t => { try { return new Date(t).toLocaleString(LANG === 'fr' ? 'fr-FR' : LANG === 'en' ? 'en-GB' : (LD().meta && LD().meta.locale) || LANG, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
function renderSlots() {
  const box = $('#slots'); box.innerHTML = '';
  for (let n = 0; n < 4; n++) {
    const s = readSlot(n), row = document.createElement('div'); row.className = 'slot-row';
    const meta = document.createElement('div'); meta.className = 'meta';
    const b = document.createElement('b'); b.textContent = T(SLOT_NAMES[n]) + (n === 0 ? ' · F5 / F9' : '');
    const sm = document.createElement('small');
    sm.textContent = s ? [s.meta ? s.meta.room : '', s.meta && s.meta.deck >= 0 ? deckOrd(s.meta.deck) : '', s.meta ? T(s.meta.items > 1 ? '{0} objets' : '{0} objet', s.meta.items) : '', fmtDate(s.t)].filter(Boolean).join(' · ') : T('Vide');
    meta.append(b, sm);
    const bs = document.createElement('button'); bs.className = 'btn'; bs.textContent = T('Sauver'); bs.disabled = !canSave();
    bs.onclick = () => { if (!s || confirm(T('Remplacer « {0} » ?', T(SLOT_NAMES[n])))) saveSlot(n); };
    const bl = document.createElement('button'); bl.className = 'btn primary'; bl.textContent = T('Charger'); bl.disabled = !s;
    bl.onclick = () => loadSlot(n);
    row.append(meta, bs, bl); box.appendChild(row);
  }
}
function openSaves() { renderSlots(); $('#saves').hidden = false; }
$('#b-saves').onclick = openSaves;
$('#b-open-saves').onclick = () => { closeOverlays(); openSaves(); };
// in the claude.ai viewer files go through the downloads capability; a standalone file uses a plain link
let dlNs; const dlReady = (window.claude && window.claude.use) ? window.claude.use('downloads').then(n => (dlNs = n)).catch(() => (dlNs = null)) : Promise.resolve(dlNs = null);
$('#b-export').onclick = async () => {
  if (!canSave()) { say(T('Lancez une partie avant d\'exporter.'), 'sys'); return; }
  const s = JSON.parse(snapshot()); s.meta = snapMeta(); s.format = 'relief-action-browser-1';
  const data = JSON.stringify(s);
  const name = 'relief-action-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '') + '.json';
  await dlReady;
  if (dlNs) {
    try { await dlNs.save({ filename: name, data }); say(T('Partie exportée : {0}', name), 'sys'); }
    catch (e) { if (e && e.code === 'declined') return; say(T('Export impossible ici : téléchargez la page pour exporter vos parties.'), 'sys'); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  say(T('Partie exportée : {0}', name), 'sys');
};
$('#b-import').onclick = () => $('#f-import').click();
$('#f-import').onchange = e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { try { const s = JSON.parse(rd.result); loadSnap(s); say(T('Partie importée{0}.', s.meta ? ' (' + s.meta.room + ')' : ''), 'sys'); } catch (err) { say(T('Ce fichier n\'est pas une sauvegarde de Relief Action.'), 'sys'); } e.target.value = ''; };
  rd.readAsText(f);
};
// start screen: continue the most recent save
function latestSlot() { let best = -1, t = 0; for (let n = 0; n < 4; n++) { const s = readSlot(n); if (s && s.t > t) { t = s.t; best = n; } } return best; }
function refreshContinue() { const n = latestSlot(); const b = $('#b-continue'); if (n >= 0) { b.hidden = false; b.textContent = T('Continuer · {0}', (readSlot(n).meta || {}).room || T(SLOT_NAMES[n])); b.onclick = () => { track('partie-reprise', 'Partie reprise'); loadSlot(latestSlot()); }; } }
if (latestSlot() >= 0) $('#b-start').textContent = 'Nouvelle partie';     // French source text, translated with the page
refreshContinue();
$('#b-restart2').onclick = () => { if (confirm(T('Recommencer une nouvelle partie ? La partie en cours sera perdue si elle n\'est pas sauvegardée.'))) $('#b-restart').onclick(); };
$('#b-restart').onclick = () => { g.reset(); g.setMonster(prefs.monster); sceneSig = ''; sceneRoom = -1; camInit = false; shownRoom = -1; closeOverlays(); say(T('Nouvelle partie.'), 'sys'); };

// on-screen keys for code entry / terminal
const KEYROWS = ['1234567890', 'AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'];
const keysEl = $('#keys');
KEYROWS.forEach(row => { const d = document.createElement('div'); d.className = 'krow'; for (const ch of row) d.appendChild(mkKey(ch, ch)); keysEl.appendChild(d); });
{ const d = document.createElement('div'); d.className = 'krow'; d.appendChild(mkKey(T('Échap'), 'ESC', 'wide')); d.appendChild(mkKey('←', 'LEFT')); d.appendChild(mkKey('↑', 'UP')); d.appendChild(mkKey('↓', 'DOWN')); d.appendChild(mkKey('→', 'RIGHT')); d.appendChild(mkKey('⌫', 'DEL')); keysEl.appendChild(d); }
{ const d = document.createElement('div'); d.className = 'krow'; d.appendChild(mkKey(T('Espace'), 'SPACE', 'wide')); d.appendChild(mkKey(T('Entrée'), 'RETURN', 'wide')); keysEl.appendChild(d); }
function mkKey(label, key, cls) {
  const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls;
  b.addEventListener('pointerdown', e => { e.preventDefault(); g.cpc.key(key, true); releaseAfterPoll(key, g.polls); });
  return b;
}
// monitor: the cross types S (exit), like the original key
$('#cpc-close').onclick = () => { g.cpc.key('S', true); releaseAfterPoll('S', g.polls); };
g.on('ctx', c => { if (c === 'mini') say(T('Moniteur : appuyez sur S pour sortir (ou sur la croix).'), 'sys'); });
$('#over-yes').onclick = () => {
  // the game reads the O key between two prints of the question: hold it until the game restarts
  g.cpc.key('O', true);
  const t0 = performance.now();
  const iv = setInterval(() => { if (g.ctx !== 'over' || performance.now() - t0 > 6000) { g.cpc.key('O', false); clearInterval(iv); } }, 50);
};

// ---------- epilogue ----------
const EPI = Uint8Array.from(atob(D.epilog), c => c.charCodeAt(0));
let typing = null;
function startEpilogue(code) {
  $('#start').hidden = true; running = true; closeOverlays();
  g.startEpilogue(EPI);
  // type the code once the program asks for it (about two seconds after start)
  typing = code ? { keys: [...code, 'RETURN'], at: g.cpc.frames + 110, down: false } : null;
}
function pumpTyping() {
  if (!typing || g.cpc.frames < typing.at) return;
  const k = typing.keys[0];
  if (!typing.down) { g.cpc.key(k, true); typing.down = true; typing.at = g.cpc.frames + 6; }
  else { g.cpc.key(k, false); typing.down = false; typing.keys.shift(); typing.at = g.cpc.frames + 6; if (!typing.keys.length) typing = null; }
}
$('#epi-cta').onclick = () => { $('#code-card').hidden = true; openEpilogue2(lastCode); };
$('#code-close').onclick = () => { $('#code-card').hidden = true; };
$('#b-epi').onclick = () => openEpilogue2(null);
$('#epi-quit').onclick = () => { g.reset(); g.setMonster(prefs.monster); sceneSig = ''; sceneRoom = -1; camInit = false; shownRoom = -1; lastCode = null; say(T('Nouvelle partie.'), 'sys'); };

// ---------- intro: the demo's vector title zooming in (renders captured from DEMO1/DEMO2) ----------
function playIntro() {
  const cv = $('#intro'); if (!cv || !D.intro) return;
  const F = D.intro, last = F[F.length - 1];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < last.length; i += 2) { x0 = Math.min(x0, last[i] * 0.83); x1 = Math.max(x1, last[i] * 0.83); y0 = Math.min(y0, last[i + 1]); y1 = Math.max(y1, last[i + 1]); }
  let t0 = null; const STEP = 90, DELAY = 450;    // the clock starts at the first painted frame, after a short pause
  $('#start h1').classList.remove('done');
  function frame(t) {
    const W = cv.clientWidth, H = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!W) { requestAnimationFrame(frame); return; }
    cv.width = W * dpr; cv.height = H * dpr;
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    if (t0 === null) t0 = t;
    if (t - t0 < DELAY) { requestAnimationFrame(frame); return; }
    const k = Math.min(F.length - 1, Math.floor((t - t0 - DELAY) / STEP)), L = F[k];
    // same scale as the final title, each frame centred: the word flies in towards the viewer
    let fx0 = 1e9, fy0 = 1e9, fx1 = -1e9, fy1 = -1e9;
    for (let i = 0; i < L.length; i += 2) { fx0 = Math.min(fx0, L[i] * 0.83); fx1 = Math.max(fx1, L[i] * 0.83); fy0 = Math.min(fy0, L[i + 1]); fy1 = Math.max(fy1, L[i + 1]); }
    const sc = Math.min(W * 0.96 / (x1 - x0), H * 0.8 / (y1 - y0));
    const ox = W / 2 - (fx0 + fx1) / 2 * sc, oy = H / 2 - (fy0 + fy1) / 2 * sc;
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#eef4ff'; x.lineWidth = Math.max(2, sc * 0.9);
    x.shadowColor = 'rgba(120,170,255,.9)'; x.shadowBlur = 14;
    x.beginPath();
    for (let i = 0; i < L.length; i += 4) { x.moveTo(ox + L[i] * 0.83 * sc, oy + L[i + 1] * sc); x.lineTo(ox + L[i + 2] * 0.83 * sc, oy + L[i + 3] * sc); }
    x.stroke();
    if (k < F.length - 1) requestAnimationFrame(frame); else $('#start h1').classList.add('done');
  }
  requestAnimationFrame(frame);
}
let introPlayed = false;
function introOnce() { if (introPlayed || document.hidden) return; introPlayed = true; playIntro(); }
if (document.readyState === 'complete') setTimeout(introOnce, 0); else window.addEventListener('load', () => setTimeout(introOnce, 0));
document.addEventListener('visibilitychange', introOnce);
$('#intro') && ($('#intro').onclick = playIntro);
window.addEventListener('resize', () => { if (!$('#start').hidden && $('#start h1').classList.contains('done')) playIntro(); });

// ---------- start ----------
let running = false;
// audience counter (GoatCounter, no cookies): page loads are counted by its script, games and endings as events
const track = (path, title) => { try { window.goatcounter && window.goatcounter.count && window.goatcounter.count({ path, title, event: true }); } catch (e) {} };
let endTracked = false;
function startGame() { track('partie-nouvelle', 'Nouvelle partie'); $('#start').hidden = true; running = true; say(T('Vous sortez d\'hibernation…'), 'sys'); }
$('#b-start').onclick = startGame;
$('#start-monster').checked = prefs.monster;
$('#start-time').checked = prefs.infTime;
$('#start-time').onchange = e => { prefs.infTime = e.target.checked; applyPrefs(); savePrefs(); };
$('#start-monster').onchange = e => { prefs.monster = e.target.checked; applyPrefs(); savePrefs(); };

// ---------- main loop ----------
let tPrev = performance.now(), hudT = 0;
function frame(t) {
  const dt = Math.min(100, t - tPrev); tPrev = t;
  pollPad();
  if (running) {
    const t0 = performance.now();
    pumpTyping();
    g.run(dt);
    if (!g.epilogue) pumpDetector(); else if (running && !endTracked) { endTracked = true; track('partie-finie', 'Fin de partie atteinte (épilogue)'); }
    const cost = performance.now() - t0;
    $('#perf').textContent = cost > 30 ? T('émulation lente') : '';
    trackLook();
  }
  updateCamera(dt);
  if (R) {
    const st0 = g.state();
    const smoky = !g.epilogue && st0.room < 0x80 && (g.roomFlags(st0.room) & 0x30) === 0x30;   // acid + solvent poured here
    R.dark = !!st0.lightsOff && !g.epilogue; R.dotDensity = smoky ? 0.14 : 0.22; R.render();
    $('#smoke').hidden = !smoky;
  }
  drawVec();
  if (prefs.map && sas.cur !== null && sas.cur !== sas.target) drawMap(g.state());
  hudT += dt;
  if (hudT > 90) { hudT = 0; updateHUD(); drawCPC(); }
  requestAnimationFrame(frame);
}

// ---------- language switch ----------
// static page text is translated in place (originals kept on the nodes); dynamic text goes through T()
function translateDom() {
  const skip = el => el.closest && el.closest('#subs, #slots, #epi2-col, #start h1, script, style');
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.parentElement || skip(n.parentElement)) continue;
    if (n.__fr === undefined) { const t = n.nodeValue.trim(); if (!t || EN.ui[t] === undefined) continue; n.__fr = n.nodeValue; }
    const t = n.__fr.trim(), lead = n.__fr.match(/^\s*/)[0], trail = n.__fr.match(/\s*$/)[0];
    n.nodeValue = LANG !== 'fr' ? lead + uiOf(t) + trail : n.__fr;
  }
  for (const el of document.querySelectorAll('[title], [aria-label], [alt]')) {
    if (skip(el)) continue;
    for (const a of ['title', 'aria-label', 'alt']) {
      if (!el.hasAttribute(a)) continue;
      el.__frA = el.__frA || {};
      if (el.__frA[a] === undefined) { const v = el.getAttribute(a); if (EN.ui[v] === undefined) continue; el.__frA[a] = v; }
      el.setAttribute(a, LANG !== 'fr' ? uiOf(el.__frA[a]) : el.__frA[a]);
    }
  }
}
// the original game's own verb menu (table &4B8F, 11 entries of 8 letters, the first 4 repeated after it)
const CPC_VERBS_FR = Array.from(mem.subarray(0x4B8F, 0x4B8F + 88));
function applyCpcVerbs() {
  if (g.epilogue) return;
  const t = CPC_VERBS_FR.slice();
  if (LANG !== 'fr') (LD().cpcVerbs || EN.cpcVerbs).forEach((w, i) => { if (w === null) return; for (let k = 0; k < 8; k++) t[i * 8 + k] = k < w.length ? w.charCodeAt(k) - 64 : 0; });
  t.forEach((v, i) => g.cpc.write(0x4B8F + i, v));
  for (let i = 0; i < 32; i++) g.cpc.write(0x4B8F + 88 + i, t[i]);
}
function setLang(l) {
  LANG = LANGS[l] !== undefined ? l : 'fr'; prefs.lang = LANG; savePrefs(); phCache = {};
  document.documentElement.lang = LANG;
  translateDom();
  $$('.verb').forEach(b => { const v = +b.dataset.verb; b.querySelector('.vn').textContent = LANG !== 'fr' ? tx('verbs', v) : b._fr; });
  $$('.lang-btn').forEach(b => { b.dataset.cur = LANG; b.querySelector('.lang-lbl').textContent = LANG.toUpperCase(); b.title = Object.keys(LANGS).map(c => LANG_NAMES[c]).join(' · '); });
  $$('.mvkeys').forEach(e => { e.innerHTML = (LANG === 'fr' ? 'ZQSD' : (LD().meta && LD().meta.wasd) || 'WASD').split('').map(c => '<kbd>' + c + '</kbd>').join(''); });
  if (typeof applyPrefs === 'function') applyPrefs();
  applyCpcVerbs();
  if (typeof refreshContinue === 'function') refreshContinue();
  hudKey = ''; mapKey = ''; shownRoom = -1;
  if (running && !g.epilogue) showLocation();
  { const p = $('#nogl .nogl-who'); if (p && p.dataset.who) p.textContent = T('Vous utilisez {0} : sur téléphone, installez ou ouvrez plutôt Chrome ou Firefox.', p.dataset.who); }
  if (!$('#saves').hidden) renderSlots();
  try { e2Relang(); } catch (e) { /* epilogue not initialised yet */ }
}
// language menu under each language button (with two languages only, a click simply switches)
function langMenu(btn) {
  const codes = Object.keys(LANGS);
  if (codes.length <= 2) { setLang(LANG === 'fr' ? 'en' : 'fr'); return; }
  let m = $('#langmenu');
  if (m) { m.remove(); if (m._for === btn) return; }
  m = document.createElement('div'); m.id = 'langmenu'; m._for = btn; m.setAttribute('role', 'menu');
  for (const c of codes) {
    const o = document.createElement('button'); o.className = 'lang-opt' + (c === LANG ? ' cur' : ''); o.dataset.cur = c; o.setAttribute('role', 'menuitem');
    o.innerHTML = '<span class="flag" aria-hidden="true"></span><span></span>'; o.lastChild.textContent = LANG_NAMES[c] || c.toUpperCase();
    o.onclick = e => { e.stopPropagation(); m.remove(); setLang(c); };
    m.appendChild(o);
  }
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();
  m.style.top = Math.round(r.bottom + 6) + 'px'; m.style.right = Math.round(window.innerWidth - r.right) + 'px';
  setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); } document.removeEventListener('click', off); }), 0);
}
$$('.lang-btn').forEach(b => b.onclick = e => { e.stopPropagation(); langMenu(b); });
{ const r0 = g.reset.bind(g); g.reset = function () { r0(); applyCpcVerbs(); }; }
setLang(LANG);
applyPrefs();
updateHUD();
requestAnimationFrame(frame);
})();
