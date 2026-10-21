// Training logic shared by the client screen and the coach screen.
// Works on a checked program (see program-check.js) and a log "state".

export function defaultState(program) {
  const mode = {};
  program.sessions.forEach((s) => { mode[s.id] = 'full'; });
  const first = program.sessions[0];
  const open = {};
  if (first) open[`${first.id}-${first.id}1`] = true;
  return { week: 1, tab: first ? first.id : 'P', mode, two: {}, log: {}, notes: {}, open, updatedAt: 0 };
}

// Merge whatever was saved with a fresh state, so older saves keep working.
export function restoreState(program, saved) {
  const d = defaultState(program);
  if (!saved || typeof saved !== 'object') return d;
  const s = Object.assign(d, saved);
  s.mode = Object.assign(defaultState(program).mode, saved.mode || {});
  s.two = saved.two || {};
  s.log = saved.log || {};
  s.notes = saved.notes || {};
  s.open = saved.open || {};
  if (!(s.week >= 1 && s.week <= program.weeks)) s.week = 1;
  const tabs = program.sessions.map((x) => x.id).concat('P');
  if (!tabs.includes(s.tab)) s.tab = tabs[0];
  return s;
}

export const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Program text may use <b>, <i>, <em>, <strong> and <br>. Everything else is shown as plain text.
export const rich = (s) => esc(s).replace(/&lt;(\/?)(b|i|em|strong)&gt;/g, '<$1$2>').replace(/&lt;br\s*\/?&gt;/g, '<br>');

export const num = (x) => {
  if (x == null) return NaN;
  const s = String(x).trim().replace(',', '.');
  return s === '' ? NaN : parseFloat(s);
};

export const setKey = (sessionId, name, week, i) => `${sessionId}|${name}|${week}|${i}`;
export const noteKey = (sessionId, week) => `${sessionId}|${week}`;

export function videoUrl(v) {
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(v);
}

export function repRange(e) {
  const parts = String(e.reps || '').split(/[–—-]/).map((x) => parseInt(x, 10));
  const lo = parts[0];
  const hi = parts.length > 1 ? parts[1] : parts[0];
  return { lo, hi };
}

export const sessionById = (program, id) => program.sessions.find((s) => s.id === id);
export const isDeload = (program, w) => program.deloadWeek != null && w === program.deloadWeek;
export const weekLabel = (program, w) => (isDeload(program, w) ? 'Deload' : `Week ${w}`);

export function phaseText(program, w) {
  let best = null;
  for (const k of Object.keys(program.phases || {})) {
    const n = Number(k);
    if (n <= w && (best == null || n > best)) best = n;
  }
  return best == null ? '' : program.phases[String(best)];
}

export function foldPairsFor(program, sessionId) {
  const t = program.twoDay;
  if (!t || !t.into[sessionId]) return null;
  const from = sessionById(program, t.from);
  return t.into[sessionId].map((n) => from.pairs[n - 1]).filter(Boolean);
}

// ---------- effort and warm-up text ----------
export function effortText(program, e, w) {
  const T = program.effort.text;
  if (isDeload(program, w)) return T.deload;
  if (w <= program.effort.rampUntil) return T.ramp;
  let t = T[e.kind] || T.compound;
  if (w >= program.effort.beatFrom) t += T.beat;
  return t;
}

export function techniqueText(program, e, w) {
  if (!e.technique || isDeload(program, w) || w < program.effort.techniqueFrom) return '';
  return program.techniques[e.technique] || '';
}

export function warmupText(e) {
  if (!e.warmup) return '';
  if (typeof e.warmup === 'string') return e.warmup;
  return e.warmup === 2 ? 'Warm-up: ½ weight × 10, then ¾ × 4' : 'Warm-up: 1 light set, ½ weight × 8';
}

// ---------- reading the log ----------
export function weekSets(state, sessionId, name, sets, w) {
  const out = [];
  for (let i = 0; i < sets; i++) {
    const v = state.log[setKey(sessionId, name, w, i)];
    if (v && ((v.kg != null && v.kg !== '') || (v.reps != null && v.reps !== ''))) out.push({ kg: v.kg, reps: v.reps });
  }
  return out;
}

function history(program, state, sessionId, e, before) {
  const h = [];
  for (let w = 1; w < before; w++) {
    if (isDeload(program, w)) continue;
    const s = weekSets(state, sessionId, e.name, e.sets, w)
      .map((o) => ({ kg: isNaN(num(o.kg)) ? 0 : num(o.kg), reps: num(o.reps) }))
      .filter((o) => !isNaN(o.reps));
    if (s.length) h.push({ w, s });
  }
  return h;
}

export function hint(program, state, sessionId, e, w) {
  const { lo, hi } = repRange(e);
  if (isDeload(program, w)) return { c: 'keep', t: 'Deload: last week’s weights, half the sets, easy.' };
  const h = history(program, state, sessionId, e, w);
  if (!h.length) {
    return { c: 'keep', t: isNaN(lo) ? 'First time: pick a weight you can control with 2–3 reps left in the tank.' : `First time: pick a weight that lands in ${e.reps} with 2–3 reps left in the tank.` };
  }
  const last = h[h.length - 1];
  if (!isNaN(hi) && last.s.length >= e.sets && last.s.every((o) => o.reps >= hi)) {
    return { c: 'up', t: `▲ Week ${last.w}: top of the range on every set. Add weight today: ${program.increment}.` };
  }
  if (!isNaN(lo) && last.s.some((o) => o.reps < lo)) {
    return { c: 'heavy', t: `Week ${last.w}: under ${lo} reps. Drop about 5–10% so every set lands in ${e.reps}.` };
  }
  if (h.length >= 2) {
    const top = (a) => Math.max.apply(null, a.s.map((o) => o.kg));
    const tot = (a) => a.s.reduce((t, o) => t + o.reps, 0);
    const prev = h[h.length - 2];
    if (top(last) === top(prev) && tot(last) <= tot(prev)) {
      if (h.length >= 3) {
        const p2 = h[h.length - 3];
        if (top(prev) === top(p2) && tot(prev) <= tot(p2)) return { c: 'stall', t: 'Stalled 3 weeks: switch to the Busy version for the rest of the block.' };
      }
      return { c: 'stall', t: 'Stalled: same weight, lower it in 3 s and pause 1 s in the stretch. The reps come back.' };
    }
  }
  return { c: 'keep', t: `Same weight as week ${last.w}. Beat it by a rep.` };
}

const fmtSets = (sets) => sets.map((o) => `${o.kg === '' || o.kg == null ? '?' : o.kg}×${o.reps === '' || o.reps == null ? '?' : o.reps}`).join('  ');

export function lastLine(program, state, sessionId, e, w) {
  for (let x = w - 1; x >= 1; x--) {
    const s = weekSets(state, sessionId, e.name, e.sets, x);
    if (s.length) return `${weekLabel(program, x)}: ${fmtSets(s)}`;
  }
  return '';
}

// ---------- time estimate: 40 s per set + paired rest, 35 s per warm-up set, 90 s to change station, 4 min warm-up ----------
const wuSets = (e) => (e.warmup === 2 ? 2 : e.warmup ? 1 : 0);
function pairSecs(pr, folded) {
  let s = 90;
  pr.exercises.forEach((e) => {
    s += e.sets * (40 + pr.rest);
    if (!folded) s += wuSets(e) * 35;
  });
  return s;
}
export function sessionMinutes(program, sessionId, mode, withFold) {
  const sess = sessionById(program, sessionId);
  let s = 240;
  sess.pairs.forEach((pr) => {
    if (mode === 'short' && program.shortPairs && pr.n > program.shortPairs) return;
    s += pairSecs(pr, false);
  });
  const fold = withFold && mode !== 'short' ? foldPairsFor(program, sessionId) : null;
  if (fold) fold.forEach((pr) => { s += pairSecs(pr, true); });
  return Math.max(5, Math.round(s / 300) * 5);
}
export const setCount = (pairs) => pairs.reduce((a, pr) => a + pr.exercises.reduce((b, e) => b + e.sets, 0), 0);

// ---------- summaries for the coach ----------
// Structured view of everything logged: [{ session, exercises: [{ name, setsLabel, weeks: [{ label, text }] }], notes: [{ label, text }] }]
export function logReport(program, state) {
  const out = [];
  program.sessions.forEach((sess) => {
    const exercises = [];
    sess.pairs.forEach((pr) => pr.exercises.forEach((e) => {
      const weeks = [];
      for (let w = 1; w <= program.weeks; w++) {
        const s = weekSets(state, sess.id, e.name, e.sets, w);
        if (s.length) weeks.push({ week: w, label: isDeload(program, w) ? 'DL' : `Wk ${w}`, text: fmtSets(s) });
      }
      if (weeks.length) exercises.push({ name: e.name, setsLabel: `${e.sets} × ${e.reps}`, weeks });
    }));
    const notes = [];
    for (let w = 1; w <= program.weeks; w++) {
      const t = state.notes[noteKey(sess.id, w)];
      if (t && t.trim()) notes.push({ week: w, label: weekLabel(program, w), text: t.trim() });
    }
    // Notes saved by older versions (one per session, no week)
    if (state.notes[sess.id] && state.notes[sess.id].trim()) notes.push({ week: 0, label: 'Notes', text: state.notes[sess.id].trim() });
    if (exercises.length || notes.length) out.push({ session: sess, exercises, notes });
  });
  return out;
}

export function summaryText(program, state, who) {
  const L = [`${who ? who + ' · ' : ''}${program.title} · through ${weekLabel(program, state.week).toLowerCase()}`, ''];
  logReport(program, state).forEach(({ session, exercises, notes }) => {
    L.push('## ' + session.title);
    exercises.forEach((x) => {
      L.push(`${x.name} (${x.setsLabel})`);
      x.weeks.forEach((w) => L.push(`  ${w.label}: ${w.text}`));
    });
    notes.forEach((n) => L.push(`Notes ${n.label.toLowerCase()}: ${n.text}`));
    L.push('');
  });
  const twos = Object.keys(state.two || {}).filter((k) => state.two[k]);
  if (twos.length) L.push('2-day weeks: ' + twos.join(', '));
  if (L.length <= 2) L.push('Nothing logged yet.');
  return L.join('\n');
}

// Last week number with anything logged (for the coach list).
export function lastLoggedWeek(program, state) {
  let last = 0;
  for (const k of Object.keys(state.log || {})) {
    const w = Number(k.split('|')[2]);
    if (w > last && w <= program.weeks) last = w;
  }
  return last;
}
