// ---------- modern epilogue ----------
// Same story and same decisions as the original EPILOG.BIN (text decoded from it, branch logic and code check
// verified by running the original program on every letter), shown as a full-screen modern sequence.
// The original drops the last line of the starvation ending ("…le diaphragme sur le vide !!! Noir !"): it is
// restored here, every paragraph is shown whole.
const EPI_TEXT = {
  oxy: { chap: 'Dans la navette', p: [
    "L'oxygène se raréfie rapidement. Vous essayez de respirer moins fort, pour gâcher le moins d'air possible.",
    "Vous vous sentez si seul. Le seul homme à des années-lumière à la ronde. Peut-être la solution du commandant était-elle la meilleure ; peut-être aurait-il dû vous laisser mourir sans jamais savoir.",
    "L'air est de plus en plus lourd. Vous sentez déjà que vous vous affaiblissez. Non, vous ne regrettez rien. Il est dans la nature de l'homme de lutter, jusqu'au bout.",
    "Vous avez commis une erreur. Mais si c'était à refaire, l'oxygène ne serait sûrement plus un problème…"] },
  escape: { chap: 'Loin du vaisseau', flash: true, p: [
    "Tout danger est enfin écarté. Il est mort. Le vaisseau, lui aussi, est détruit : il a explosé peu après votre départ.",
    "Étrange, cette explosion. Une lueur vous a ébloui, puis vous avez été frappé de plein fouet par une forte bouffée de chaleur. Tout cela dans le silence le plus absolu. Une scène un peu irréelle.",
    "Puis vous vous êtes endormi d'un sommeil agité…"] },
  hunger: { chap: 'Le réveil', noir: true, p: [
    "Vous vous réveillez. Vous avez faim… Vous n'avez pas de provisions. Si on ne vous retrouve pas très vite, vous allez mourir de faim. Quelle dérision, après tant d'épreuves.",
    "Vous vous rappelez subitement une phrase du commandant : <em>le plus proche vaisseau est à Éridan !</em> S'il vient vous chercher, ce ne sera pas avant au moins un mois.",
    "Vous n'avez aucune chance. Vous préférez mourir vite… Vous ouvrez le diaphragme sur le vide !!!"] },
  alone: { chap: 'Le réveil', noir: true, p: [
    "Au réveil, vous avez mangé un tiers de ration ! Il fallait que vos provisions suffisent pour attendre l'arrivée des secours !",
    "Un doute horrible vous envahit. Quels secours attendiez-vous ? Qui savait que vous étiez perdu dans cette navette ? Qui savait même que votre vaisseau avait explosé ?",
    "L'espoir qui restait encore en vous s'amenuisait d'heure en heure. Peut-être le commandant avait-il envoyé un SOS par l'ERTP avant de vous réveiller. Vous n'arriviez pas à vous en convaincre. Non, il ne l'avait sûrement pas fait !!!",
    "Un mois et demi plus tard, vos provisions épuisées depuis deux semaines déjà, à bout de force, vous en étiez enfin convaincu. Vous ne vouliez plus souffrir.",
    "Un simple geste vous suffisait pour ouvrir la porte sur l'espace… Vous l'avez fait !!!"] },
  wait: { chap: 'Le réveil', p: [
    "Au réveil, vous mangez un tiers de ration ! Il faut que vos provisions suffisent pour attendre l'arrivée des secours !",
    "Le vaisseau le plus proche est dans le système d'Éridan ! Il lui faudra au moins un mois pour vous rejoindre…"] },
  silence: { chap: 'Trente jours plus tard', noir: true, p: [
    "Trente jours se sont écoulés. Aucun vaisseau n'est venu vous secourir. L'inquiétude vous gagne peu à peu.",
    "Vous vous souvenez d'une phrase que vous avez lue quelque part : <em>« … aucun secours ne sera envoyé, sauf si la demande est confirmée par l'indicatif du vaisseau. »</em>",
    "Vous avez composé un des indicatifs standards au lieu du code du vaisseau, « NMI ». Personne ne viendra, maintenant vous en êtes sûr.",
    "Vous préférez une mort rapide. Vous ouvrez la navette sur le vide !!!"] },
  rescue: { chap: 'Trente-troisième jour', p: [
    "Trente-troisième jour de solitude dans cette navette. Une voix vous parle à travers le communicateur.",
    "Un vaisseau doit se trouver à seulement quelques minutes-lumière. Enfin, vous avez échappé à tous les pièges de l'espace."] },
  prison: { chap: 'Sur Terre', bars: true, p: [
    "En arrivant sur Terre, vous êtes accueilli par un tribunal militaire. On vous accuse de mutinerie. Votre histoire est déclarée ridicule.",
    "Tout le monde semble penser que vous n'êtes qu'un tueur sanguinaire qui a détruit le vaisseau pour cacher ses crimes.",
    "L'accusation ne peut pas prouver ses affirmations, faute de preuves matérielles. Vous êtes seulement condamné au bagne à perpétuité.",
    "Vous vous demandez encore comment vous auriez pu prouver votre innocence. Peut-être en ramenant le carnet de bord… Qui sait ?",
    "La grille d'une porte de prison se referme sur vous… Des pas s'éloignent… Silence."] },
  hero: { chap: 'Sur Terre', earth: true, p: [
    "Vous revenez enfin sur Terre. Après tant d'épreuves, vous n'espériez plus la revoir.",
    "D'abord, vous avez eu du mal à convaincre les autorités de la véracité de votre histoire. Mais le journal de bord du capitaine, enregistré en code sur sa carte magnétique, confirme votre version des faits.",
    "Le Conseil militaire galactique décide de prendre des mesures contre les monstres. L'homme n'a pas encore gagné, mais il est prêt à lutter.",
    "On vous accorde une forte prime de risque qui pourrait vous permettre de vivre aisément jusqu'à la fin de vos jours.",
    "Mais en vous-même, vous savez que vous ne pourrez avoir de véritable repos tant que tous les monstres ne seront pas exterminés…",
    "Car le temps de la colère est venu, et l'homme devra prouver qu'il est bien l'espèce la plus teigneuse et la plus coriace de la galaxie."] },
};
const EPI_ENDS = {
  oxy: { title: 'Asphyxie', tint: '255, 140, 120', n: 1, line: "L'air de la navette ne suffisait pas.", hint: "Il fallait installer les bouteilles d'oxygène pleines dans la navette." },
  hunger: { title: 'Famine', tint: '255, 160, 110', n: 2, line: 'Rien à manger, et personne pour venir.', hint: 'Il fallait emporter une ration intacte.' },
  alone: { title: 'Oubli', tint: '170, 180, 255', n: 3, line: 'Personne ne savait.', hint: "Il fallait émettre un message de détresse avec l'ERTP avant de partir." },
  silence: { title: 'Silence radio', tint: '150, 200, 255', n: 4, line: 'Le message ne portait pas le bon indicatif.', hint: "Le message devait porter l'indicatif du vaisseau : NMI." },
  prison: { title: 'Le bagne', tint: '200, 205, 215', n: 5, line: 'Sauvé, mais condamné.', hint: 'Il fallait ramener la carte du commandant : elle contient le journal de bord.' },
  hero: { title: 'Le temps de la colère', tint: '255, 205, 120', n: 6, line: 'La meilleure fin : vous êtes rentré, et cru.', hint: null },
};
// code check of the original: letter 1 K/R, 2 E/N, 3 C/M, 4 B/C, 5 F–N, 6 A or J–N
const epiTxt = k => (LANG !== 'fr' ? Object.assign({}, EPI_TEXT[k], EN.epiText[k], (LD().epiText || {})[k]) : EPI_TEXT[k]);
const epiEnd = k => (LANG !== 'fr' ? Object.assign({}, EPI_ENDS[k], EN.epiEnds[k], (LD().epiEnds || {})[k]) : EPI_ENDS[k]);
function epiValid(code) { return /^[KR][EN][CM][BC][F-N][AJ-N]$/.test(code); }
function epiPath(code) {
  if (code[0] === 'K') return ['oxy'];
  const p = ['escape'];
  if (code[1] !== 'N') return p.concat('hunger');
  if (code[3] !== 'C') return p.concat('alone');
  p.push('wait');
  if (code[5] !== 'J') return p.concat('silence');
  p.push('rescue');
  return p.concat(code[2] === 'C' ? 'hero' : 'prison');
}
function epiSummary(code) {
  const ok = (b, y, n) => [b, (b ? '✓ ' : '✗ ') + T(b ? y : n)];
  return [
    ok(code[0] === 'R', 'R · assez d\'oxygène dans la navette', 'K · l\'oxygène va manquer'),
    ok(code[1] === 'N', 'N · une ration à bord', 'E · pas de provisions'),
    ok(code[3] === 'C', 'C · message de détresse envoyé', 'B · personne n\'a été prévenu'),
    ok(code[5] === 'J', 'J · indicatif du vaisseau NMI', T(code[3] === 'C' ? '{0} · indicatif standard : personne ne viendra' : '{0} · pas de message', code[5])),
    ok(code[2] === 'C', 'C · la carte du commandant (journal de bord)', 'M · aucune preuve de votre innocence'),
  ];
}

const E2 = { el: $('#epi2'), col: $('#epi2-col'), steps: [], i: -1, code: '', end: null, raf: 0, revealT: [], busy: false };
// sky: slow drifting stars, an optional planet rising for the best ending
const sky = { c: $('#epi2-sky'), stars: [], t0: 0, earth: 0, earthTarget: 0, speed: 1 };
function skyInit() {
  sky.stars = []; for (let i = 0; i < 420; i++) sky.stars.push({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(), b: Math.random() });
}
function skyFrame(t) {
  if (E2.el.hidden) { E2.raf = 0; return; }
  const c = sky.c, dpr = Math.min(2, window.devicePixelRatio || 1), W = c.clientWidth * dpr, H = c.clientHeight * dpr;
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const x = c.getContext('2d'); x.fillStyle = '#020308'; x.fillRect(0, 0, W, H);
  const dt = sky.t0 ? Math.min(50, t - sky.t0) : 16; sky.t0 = t;
  const cx = W / 2, cy = H * 0.45, R = Math.max(W, H) * 0.6;
  for (const s of sky.stars) {
    s.z -= dt * 0.000018 * sky.speed; if (s.z <= 0.02) { s.z = 1; s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; }
    const px = cx + s.x / s.z * R * 0.35, py = cy + s.y / s.z * R * 0.35;
    if (px < 0 || py < 0 || px > W || py > H) continue;
    const a = Math.min(1, (1 - s.z) * 1.4) * (0.45 + 0.55 * s.b), r = (1 - s.z) * 1.6 * dpr + 0.3;
    x.fillStyle = `rgba(230,238,251,${a})`; x.beginPath(); x.arc(px, py, r, 0, 6.283); x.fill();
  }
  sky.earth += (sky.earthTarget - sky.earth) * Math.min(1, dt / 2500);
  if (sky.earth > 0.01) {   // a blue planet rising from the bottom edge
    const pr = Math.max(W, H) * 0.9, py = H + pr - H * 0.2 * sky.earth;
    const g2 = x.createRadialGradient(cx - pr * 0.25, py - pr * 0.35, pr * 0.1, cx, py, pr);
    g2.addColorStop(0, `rgba(120,180,255,${0.9 * sky.earth})`); g2.addColorStop(0.55, `rgba(30,80,170,${0.85 * sky.earth})`); g2.addColorStop(1, `rgba(5,15,40,${sky.earth})`);
    x.fillStyle = g2; x.beginPath(); x.arc(cx, py, pr, 0, 6.283); x.fill();
    x.strokeStyle = `rgba(160,210,255,${0.6 * sky.earth})`; x.lineWidth = 2 * dpr; x.beginPath(); x.arc(cx, py, pr + dpr, 0, 6.283); x.stroke();
  }
  E2.raf = requestAnimationFrame(skyFrame);
}
function e2Tint(rgb) { E2.el.style.setProperty('--tint', rgb); }
function e2Reset() {
  E2.revealT.forEach(clearTimeout); E2.revealT = []; E2.noirPending = null; E2.busy = false;
  E2.el.querySelector('.black').classList.remove('on'); E2.el.querySelector('.bars').classList.remove('on');
  E2.el.querySelector('.flash').classList.remove('go'); sky.earthTarget = 0; sky.earth = 0; sky.speed = 1; e2Tint('230, 238, 251');
}
function openEpilogue2(code) {
  $('#start').hidden = true; running = true; closeOverlays(); $('#code-card').hidden = true;
  E2.el.hidden = false; e2Reset(); skyInit(); if (!E2.raf) E2.raf = requestAnimationFrame(skyFrame);
  let saved = null; try { saved = localStorage.getItem('relief-action-code'); } catch (e) {}
  if (code && epiValid(code)) e2Begin(code); else e2Entry(code || saved || '');
}
function e2Entry(pre) {
  E2.steps = []; E2.i = -1; $('#epi2-dots').innerHTML = ''; $('#epi2-hint').textContent = '';
  E2.col.innerHTML = `<div class="entry"><h2>${T('Épilogue')}</h2><p>${T('Entrez le code donné par le jeu à la fin de votre partie. Six lettres : elles racontent ce que vous avez emporté et fait avant de partir.')}</p>
    <input id="epi2-code" maxlength="6" autocomplete="off" spellcheck="false" value="${(pre || '').replace(/[^A-Za-z]/g, '').slice(0, 6)}" aria-label="${T('Code de fin de partie')}">
    <div class="err" id="epi2-err"></div><div class="row"><button class="btn primary" id="epi2-go">${T("Lire l'épilogue")}</button></div></div>`;
  const inp = $('#epi2-code'); setTimeout(() => inp.focus(), 50);
  const go = () => { const c = inp.value.toUpperCase().trim(); if (epiValid(c)) e2Begin(c); else $('#epi2-err').textContent = T(c.length < 6 ? 'Le code fait six lettres.' : 'Ce code n\'est pas valide : le programme d\'origine le refuserait aussi.'); };
  $('#epi2-go').onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } e.stopPropagation(); };
}
function e2Begin(code) {
  E2.code = code; try { localStorage.setItem('relief-action-code', code); } catch (e) {}
  const path = epiPath(code); E2.end = path[path.length - 1];
  E2.steps = [];
  for (const k of path) { const s = epiTxt(k); s.p.forEach((t, j) => E2.steps.push({ k, t, first: j === 0, last: j === s.p.length - 1, sec: s })); }
  E2.steps.push({ end: true });
  $('#epi2-dots').innerHTML = path.map(() => '<i></i>').join('') + '<i></i>';
  $('#epi2-hint').textContent = T('Clic, Espace ou Entrée pour continuer');
  E2.i = -1; e2Next();
}
function e2Dots() {
  const st = E2.steps[E2.i]; const path = epiPath(E2.code); const idx = st.end ? path.length : path.indexOf(st.k);
  [...$('#epi2-dots').children].forEach((d, i) => d.classList.toggle('on', i <= idx));
}
function e2Reveal(container) {
  const words = [...container.querySelectorAll('.w')];
  words.forEach((w, i) => E2.revealT.push(setTimeout(() => w.classList.add('in'), 40 + i * 55)));
  E2.busy = true; E2.revealT.push(setTimeout(() => { E2.busy = false; }, 40 + words.length * 55 + 300));
}
function wrapWords(html) {
  // split text (keeping <em> tags) into word spans for the soft reveal
  const tmp = document.createElement('div'); tmp.innerHTML = html; const out = document.createElement('p');
  const walk = (node, into) => node.childNodes.forEach(n => {
    if (n.nodeType === 3) n.textContent.split(/(\s+)/).forEach(part => { if (!part) return; if (/^\s+$/.test(part)) into.appendChild(document.createTextNode(' ')); else { const s = document.createElement('span'); s.className = 'w'; s.textContent = part; into.appendChild(s); } });
    else { const c = n.cloneNode(false); into.appendChild(c); walk(n, c); }
  });
  walk(tmp, out); return out;
}
function e2Next() {
  if (E2.busy) { E2.revealT.forEach(clearTimeout); E2.revealT = []; E2.col.querySelectorAll('.w').forEach(w => w.classList.add('in')); E2.busy = false; return; }
  if (E2.noirPending) { E2.noirPending(); return; }
  if (E2.i >= E2.steps.length - 1) return;
  E2.revealT.forEach(clearTimeout); E2.revealT = [];
  E2.i++; const st = E2.steps[E2.i]; e2Dots();
  if (st.end) { e2End(); return; }
  if (st.first) {
    E2.col.innerHTML = `<div class="chap">${st.sec.chap}</div><div class="txt"></div>`;
    requestAnimationFrame(() => E2.col.querySelector('.chap').classList.add('in'));
    if (st.sec.flash) { const f = E2.el.querySelector('.flash'); f.classList.remove('go'); void f.offsetWidth; E2.revealT.push(setTimeout(() => f.classList.add('go'), 1600)); }
    if (st.sec.earth) { sky.earthTarget = 1; e2Tint(EPI_ENDS.hero.tint); }
    if (st.k === 'rescue') { sky.speed = 0.5; }
  }
  const txt = E2.col.querySelector('.txt');
  // keep the page readable: at most three paragraphs on screen, older ones fade out
  while (txt.children.length >= 3) txt.firstChild.remove();
  const p = wrapWords(st.t); txt.appendChild(p); e2Reveal(p);
  if (st.last && st.sec.noir) {
    const noir = () => { E2.noirPending = null; E2.revealT.forEach(clearTimeout); E2.revealT = []; E2.busy = false; E2.el.querySelector('.black').classList.add('on'); E2.col.innerHTML = '<div class="noir">' + T('Noir') + '</div>'; requestAnimationFrame(() => E2.col.querySelector('.noir').classList.add('in')); };
    E2.revealT.push(setTimeout(() => { E2.noirPending = noir; }, 300));
    E2.revealT.push(setTimeout(noir, 4200 + st.t.length * 20));
  }
  if (st.last && st.sec.bars) E2.revealT.push(setTimeout(() => E2.el.querySelector('.bars').classList.add('on'), 2600));
}
function e2End() {
  const e = epiEnd(E2.end); e2Tint(e.tint);
  E2.el.querySelector('.black').classList.remove('on');
  const items = epiSummary(E2.code).map(([ok, t]) => `<li class="${ok ? 'ok' : 'ko'}">${t}</li>`).join('');
  E2.col.innerHTML = `<div class="end"><div class="kicker">${T('Fin {0} sur 6', e.n)}</div><h2>${e.title}</h2><p class="sub2">${e.line}${e.hint ? '<br>' + e.hint : ''}</p>
    <div class="code">${E2.code}</div><br><ul>${items}</ul>
    <div class="row"><button class="btn primary" id="epi2-new">${T('Nouvelle partie')}</button><button class="btn" id="epi2-again">${T('Relire')}</button><button class="btn" id="epi2-other">${T('Autre code')}</button></div></div>`;
  $('#epi2-hint').textContent = '';
  $('#epi2-new').onclick = () => { closeEpilogue2(); g.reset(); g.setMonster(prefs.monster); g.setInfiniteTime(prefs.infTime); sceneSig = ''; sceneRoom = -1; camInit = false; shownRoom = -1; lastCode = null; lastPhraseId = -1; say(T('Nouvelle partie.'), 'sys'); };
  $('#epi2-again').onclick = () => { e2Reset(); e2Begin(E2.code); };
  $('#epi2-other').onclick = () => { e2Reset(); e2Entry(''); };
}
function closeEpilogue2() { e2Reset(); E2.el.hidden = true; }
$('#epi2-close').onclick = closeEpilogue2;
$('#epi2-cpc').onclick = () => { const c = E2.code; closeEpilogue2(); startEpilogue(c && epiValid(c) ? c : null); };
E2.el.addEventListener('click', e => { if (e.target.closest('button, input, .top')) return; e2Next(); });
window.addEventListener('keydown', e => {
  if (E2.el.hidden) return;
  if (e.target.tagName === 'INPUT') return;
  e.stopImmediatePropagation();
  if (e.key === 'Escape') { closeEpilogue2(); e.preventDefault(); return; }
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); if (!e.repeat) e2Next(); }
}, true);

// switching language while the epilogue is open: redraw the current screen in the new language
function e2Relang() {
  if (E2.el.hidden) return;
  if (E2.i < 0) { const inp = $('#epi2-code'); e2Entry(inp ? inp.value : ''); return; }
  const at = E2.i; e2Reset(); e2Begin(E2.code); E2.revealT.forEach(clearTimeout); E2.revealT = []; E2.busy = false;
  if (E2.steps[at] && E2.steps[at].end) { E2.i = at; e2Dots(); e2End(); return; }
  // jump back to the start of the current section
  let j = at; while (j > 0 && !E2.steps[j].first) j--; E2.i = j - 1; E2.busy = false; e2Next();
}
