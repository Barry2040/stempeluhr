// Brutto-Netto-Schätzung für Angestellte in Deutschland (Werte 2026, gesetzlich versichert).
// Vereinfachte Nachbildung des Lohnsteuer-Programmablaufplans – Abweichungen von einigen Euro sind normal.
const NETTO_YEAR = 2026;
const NT = {
  grundfrei: 12348, wk: 1230, sa: 36, entlastung: 4260, entlastungKind: 240, kindFb: 9756,
  soliFrei: 20350, bbgRV: 101400, bbgKV: 69750,
  rv: 9.3, av: 1.3, kv: 7.3, kvErm: 7.0, pv: 1.8, pvKinderlos: 0.6, pvSachsen: 0.5, pvKindAbschlag: 0.25,
  minijob: 603, midiBis: 2000, minijobRV: 3.6,
};
// Einkommensteuer-Tarif § 32a EStG 2026 (Jahresbetrag, ganze Euro)
function estTarif(x) {
  x = Math.floor(Math.max(0, x));
  if (x <= NT.grundfrei) return 0;
  if (x <= 17799) { const y = (x - NT.grundfrei) / 1e4; return Math.floor((914.51 * y + 1400) * y); }
  if (x <= 69878) { const z = (x - 17799) / 1e4; return Math.floor((173.10 * z + 2397) * z + 1034.87); }
  if (x <= 277825) return Math.floor(0.42 * x - 11135.63);
  return Math.floor(0.45 * x - 19470.38);
}
// Lohnsteuer pro Jahr für zu versteuerndes Jahreseinkommen x und Steuerklasse
function lstJahr(x, kl) {
  if (kl === 3) return 2 * estTarif(x / 2);
  if (kl === 5 || kl === 6) return Math.floor(Math.max(0.14 * x, 2 * (estTarif(1.25 * x) - estTarif(0.75 * x))));
  return estTarif(x);
}
/**
 * brutto: Monatsbrutto in €; o: { klasse 1–6, kinder (Anzahl), kirche (bool), kirchSatz (8|9), kinderlos (bool, PV-Zuschlag),
 *   pvKinder (Kinder unter 25 für PV-Abschlag), zusatz (KV-Zusatzbeitrag gesamt in %), sachsen (bool), rvBefreit (Minijob) }
 */
function bruttoNetto(brutto, o = {}) {
  const kl = +o.klasse || 1, kinder = Math.max(0, +o.kinder || 0), zusatz = o.zusatz ?? 2.9;
  const r = { brutto, art: 'normal', lst: 0, soli: 0, kist: 0, kv: 0, pv: 0, rv: 0, av: 0 };
  if (brutto <= 0) return { ...r, netto: 0, steuern: 0, sozial: 0 };
  // --- Minijob: keine Lohnsteuer für dich (Pauschalsteuer zahlt der Arbeitgeber), nur ggf. Rentenbeitrag
  if (brutto <= NT.minijob) {
    r.art = 'minijob';
    r.rv = o.rvBefreit === false ? round2(brutto * NT.minijobRV / 100) : 0;
    return finish(r);
  }
  // --- Sozialversicherung (Arbeitnehmeranteil)
  let pvSatz = NT.pv + (o.sachsen ? NT.pvSachsen : 0);
  if (o.kinderlos) pvSatz += NT.pvKinderlos;
  else if ((o.pvKinder || 0) >= 2) pvSatz -= NT.pvKindAbschlag * (Math.min(5, o.pvKinder) - 1);
  const kvSatz = NT.kv + zusatz / 2;
  // Übergangsbereich (Midijob): verringerte Bemessungsgrundlage für den Arbeitnehmeranteil
  let baseKV = Math.min(brutto, NT.bbgKV / 12), baseRV = Math.min(brutto, NT.bbgRV / 12);
  if (brutto <= NT.midiBis) {
    r.art = 'midijob';
    const bem = NT.midiBis / (NT.midiBis - NT.minijob) * (brutto - NT.minijob);
    baseKV = baseRV = bem;
  }
  r.kv = round2(baseKV * kvSatz / 100);
  r.pv = round2(baseKV * pvSatz / 100);
  r.rv = round2(baseRV * NT.rv / 100);
  r.av = round2(baseRV * NT.av / 100);
  // --- Lohnsteuer (Jahresbetrachtung)
  const jahr = brutto * 12;
  const vorsorge = 12 * (baseRV * (NT.rv + NT.av) / 100 + baseKV * (NT.kvErm + zusatz / 2 + pvSatz) / 100);
  let abzug = vorsorge;
  if (kl !== 6) abzug += NT.wk + NT.sa;
  if (kl === 2) abzug += NT.entlastung + NT.entlastungKind * Math.max(0, kinder - 1);
  const zve = Math.max(0, jahr - abzug);
  const lst = lstJahr(zve, kl);
  // Soli und Kirchensteuer mit Kinderfreibeträgen (Klasse IV: halber Freibetrag je Kind, V/VI: keiner)
  const zaehler = kl <= 3 ? kinder : kl === 4 ? kinder / 2 : 0;
  const lstKind = lstJahr(Math.max(0, zve - zaehler * NT.kindFb), kl);
  const frei = kl === 3 ? 2 * NT.soliFrei : NT.soliFrei;
  const soli = lstKind <= frei ? 0 : Math.min(lstKind * 0.055, (lstKind - frei) * 0.119);
  r.lst = round2(lst / 12);
  r.soli = round2(soli / 12);
  r.kist = o.kirche ? round2(lstKind * (o.kirchSatz || 9) / 100 / 12) : 0;
  return finish(r);
}
function round2(n) { return Math.round(n * 100) / 100; }
function finish(r) {
  r.steuern = round2(r.lst + r.soli + r.kist);
  r.sozial = round2(r.kv + r.pv + r.rv + r.av);
  r.netto = round2(r.brutto - r.steuern - r.sozial);
  return r;
}
if (typeof module !== 'undefined') module.exports = { bruttoNetto, estTarif, lstJahr, NT };
