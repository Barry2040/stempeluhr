// Erkennung von Stundenzetteln (Bons) – reine Logik, ohne UI.
// Erwartetes Format (tolerant gegenüber OCR-Fehlern):
//   Montag, 2. November 2026 (06:48)
//   02.11. 09:53:10 - 02.11. 14:05:21
//   02.11. 14:29:05 - 02.11. 17:05:17

// OCR-Ergebnis (Blöcke mit Zeilen + Positionen) in Textzeilen von oben nach unten umwandeln.
function ocrRows(res) {
  const lines = (res.blocks || []).flatMap(b => b.lines || []).filter(l => l.boundingBox);
  if (!lines.length) return String(res.text || '').split(/\r?\n/);
  const items = lines.map(l => {
    const r = l.boundingBox;
    return { text: l.text, left: r.left, cy: (r.top + r.bottom) / 2, h: Math.max(1, r.bottom - r.top) };
  }).sort((a, b) => a.cy - b.cy);
  const rows = [];
  for (const it of items) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row.cy - it.cy) < Math.min(row.h, it.h) * 0.6) {
      row.items.push(it);
      row.cy = row.items.reduce((s, x) => s + x.cy, 0) / row.items.length;
    } else rows.push({ cy: it.cy, h: it.h, items: [it] });
  }
  return rows.map(r => r.items.sort((a, b) => a.left - b.left).map(x => x.text).join(' '));
}

const SCAN_MONTHS = { jan: 0, feb: 1, mar: 2, 'mär': 2, mae: 2, apr: 3, mai: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, dez: 11, dec: 11 };

// Typische OCR-Verwechslungen in Zahlenbereichen korrigieren.
function digitize(s) {
  return s.replace(/[OoQD]/g, '0').replace(/[lI|!\]\[]/g, '1').replace(/[Ss](?=\d)/g, '5').replace(/[;]/g, ':').replace(/(\d)\s*:\s*(\d)/g, '$1:$2');
}

// Zeilen -> [{key:'2026-11-02', segments:[{start,end}], printedNet: ms|null}]
function parseTimesheet(rows, fallbackYear) {
  const H = 3600000, M = 60000;
  let year = null;
  for (const r of rows) { const m = r.match(/\b(20\d\d)\b/); if (m) { year = +m[1]; break; } }
  year = year || fallbackYear || new Date().getFullYear();

  const days = new Map();
  let cur = null; // aktuelles Datum aus der Tagesüberschrift {y,m,d}
  let curTotal = null;
  const pad = n => String(n).padStart(2, '0');
  const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const getDay = (k) => { if (!days.has(k)) days.set(k, { key: k, segments: [], printedNet: null }); return days.get(k); };

  for (const raw of rows) {
    const t = digitize(raw);
    // Tagesüberschrift: "Montag, 2. November 2026 (06:48)"
    const hd = raw.match(/(\d{1,2})\s*\.?\s*([A-Za-zÄÖÜäöü]{3})[A-Za-zäöü]*\s+(20\d\d)/);
    if (hd && SCAN_MONTHS[hd[2].toLowerCase()] != null) {
      cur = { y: +hd[3], m: SCAN_MONTHS[hd[2].toLowerCase()], d: +hd[1] };
      const tot = t.match(/\((\d{1,3}):(\d{2})\)/);
      curTotal = tot ? (+tot[1]) * H + (+tot[2]) * M : null;
      getDay(keyOf(cur.y, cur.m, cur.d)).printedNet = curTotal;
      continue;
    }
    // Zeitzeile: zwei Uhrzeiten
    const times = [...t.matchAll(/(?<!\d)(\d{1,2}):(\d{2})(?::(\d{2}))?(?!\d)/g)]
      .map(m => ({ h: +m[1], mi: +m[2], s: +(m[3] || 0) }))
      .filter(x => x.h < 24 && x.mi < 60 && x.s < 60);
    if (times.length < 2) continue;
    // Datum: Überschrift bevorzugen, sonst Datum in der Zeile (das hintere ist meist vollständig)
    const [a, b] = times;
    const overnight = b.h * 3600 + b.mi * 60 + b.s <= a.h * 3600 + a.mi * 60 + a.s;
    let base = cur;
    // Enddatum der Zeile (das hintere Datum ist meist vollständig, das vordere oft angeschnitten)
    const ds = [...t.matchAll(/(?<!\d)(\d{1,2})\.(\d{1,2})\./g)].map(m => ({ d: +m[1], m: +m[2] - 1 }))
      .filter(d => d.m >= 0 && d.m <= 11 && d.d >= 1 && d.d <= 31);
    const rd = ds[ds.length - 1];
    if (rd) {
      const y = cur ? cur.y : year;
      const sDay = new Date(y, rd.m, rd.d - (overnight ? 1 : 0));
      // Überschrift fehlt oder passt nicht zur Zeile -> Datum aus der Zeile nehmen
      if (!cur || sDay.getMonth() !== cur.m || sDay.getDate() !== cur.d) base = { y: sDay.getFullYear(), m: sDay.getMonth(), d: sDay.getDate() };
    }
    if (!base) continue;
    const start = new Date(base.y, base.m, base.d, a.h, a.mi, a.s).getTime();
    let end = new Date(base.y, base.m, base.d, b.h, b.mi, b.s).getTime();
    if (end <= start) end += 24 * H; // über Mitternacht
    const day = getDay(keyOf(base.y, base.m, base.d));
    if (!day.segments.some(s => Math.abs(s.start - start) < M)) day.segments.push({ start, end });
  }

  return [...days.values()].filter(d => d.segments.length).map(d => {
    d.segments.sort((x, y) => x.start - y.start);
    d.net = d.segments.reduce((s, x) => s + (x.end - x.start), 0);
    // Gedruckte Tagessumme zum Gegencheck (Bon schneidet Sekunden ab)
    d.suspicious = d.printedNet != null && Math.abs(Math.floor(d.net / M) * M - d.printedNet) > M;
    return d;
  }).sort((x, y) => x.key.localeCompare(y.key));
}

// Tag -> Eintrag im App-Format (Lücken zwischen Abschnitten = Pausen)
function dayToEntry(d) {
  const s = d.segments;
  const breaks = [];
  for (let i = 1; i < s.length; i++) if (s[i].start > s[i - 1].end) breaks.push({ start: s[i - 1].end, end: s[i].start });
  return { start: s[0].start, end: s[s.length - 1].end, breaks, note: 'Scan' };
}

if (typeof module !== 'undefined') module.exports = { ocrRows, parseTimesheet, dayToEntry, digitize };
