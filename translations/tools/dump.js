// dumps every translatable string of the web version as JSON (input of make_template.py): node dump.js
global.window = global;
const fs = require('fs'), path = require('path'), W = path.join(__dirname, '..', '..', 'build', 'web') + '/';
require(W + 'phrases_fr.js'); require(W + 'phrases_en.js'); require(W + 'i18n_en.js');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const m = html.match(/window\.RELIEF_DATA = (\{.*?\});<\/script>/s); const D = JSON.parse(m[1]);
const app = fs.readFileSync(W + 'app.js', 'utf8');
const VERBS = eval(app.match(/const VERBS = (\[.*?\]);/)[1]);
const epi = fs.readFileSync(W + 'epilogue2.js', 'utf8');
const grab = name => { const i = epi.indexOf('const ' + name + ' = {'); let d = 0, j = epi.indexOf('{', i);
  for (let k = j; k < epi.length; k++) { if (epi[k] === '{') d++; else if (epi[k] === '}' && --d === 0) return eval('(' + epi.slice(j, k + 1) + ')'); } };
const EN = global.I18N_EN;
fs.writeFileSync(path.join(__dirname, 'src.json'), JSON.stringify({ pf: PHRASES_FR, pe: PHRASES_EN, ui: EN.ui, roomsFr: D.rooms, roomsEn: EN.rooms, namesFr: D.names, namesEn: EN.names,
  deckShortFr: D.deckShort, deckNamesFr: D.deckNames, decksEn: EN.decks, verbsFr: VERBS, verbsEn: EN.verbs, cpcVerbsEn: EN.cpcVerbs,
  epiTextFr: grab('EPI_TEXT'), epiTextEn: EN.epiText, epiEndsFr: grab('EPI_ENDS'), epiEndsEn: EN.epiEnds }, null, 1));
