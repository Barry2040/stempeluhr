// Gesetzliche Feiertage in Deutschland (bundesweit + je Bundesland)
const BUNDESLAENDER = {
  '': 'Nur bundesweite Feiertage', BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen',
  HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen'
};
function easterSunday(y) { // Gauß / anonymer gregorianischer Algorithmus
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
const _holCache = {};
function holidaysOf(y, land) {
  const ck = y + land; if (_holCache[ck]) return _holCache[ck];
  const p = n => String(n).padStart(2, '0');
  const k = d => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const E = easterSunday(y), off = n => new Date(E.getFullYear(), E.getMonth(), E.getDate() + n);
  const fix = (m, d) => new Date(y, m - 1, d);
  const L = (...ls) => !!land && ls.includes(land);
  const list = [
    [fix(1, 1), 'Neujahr', true],
    [fix(1, 6), 'Heilige Drei Könige', L('BW', 'BY', 'ST')],
    [fix(3, 8), 'Internationaler Frauentag', L('BE', 'MV')],
    [off(-2), 'Karfreitag', true],
    [off(1), 'Ostermontag', true],
    [fix(5, 1), 'Tag der Arbeit', true],
    [off(39), 'Christi Himmelfahrt', true],
    [off(50), 'Pfingstmontag', true],
    [off(60), 'Fronleichnam', L('BW', 'BY', 'HE', 'NW', 'RP', 'SL')],
    [fix(8, 15), 'Mariä Himmelfahrt', L('SL')],
    [fix(9, 20), 'Weltkindertag', L('TH')],
    [fix(10, 3), 'Tag der Deutschen Einheit', true],
    [fix(10, 31), 'Reformationstag', L('BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH')],
    [fix(11, 1), 'Allerheiligen', L('BW', 'BY', 'NW', 'RP', 'SL')],
    [(() => { const d = fix(11, 22); d.setDate(22 - ((d.getDay() - 3 + 7) % 7)); return d; })(), 'Buß- und Bettag', L('SN')],
    [fix(12, 25), '1. Weihnachtstag', true],
    [fix(12, 26), '2. Weihnachtstag', true],
  ];
  const map = {};
  for (const [d, name, on] of list) if (on) map[k(d)] = name;
  return (_holCache[ck] = map);
}
function holidayName(key, land) { return holidaysOf(+key.slice(0, 4), land || '')[key] || null; }
if (typeof module !== 'undefined') module.exports = { holidaysOf, holidayName, easterSunday, BUNDESLAENDER };
