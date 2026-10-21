// Checks a training program (JSON) and fills in defaults.
// Returns { ok, program, errors } — errors are plain sentences a coach can act on.
// The full format is described in programs/PROGRAM_FORMAT.md.

const KINDS = ['free', 'compound', 'isolation', 'core'];

const DEFAULT_TECHNIQUES = {
  myo: 'Last set → <b>myo-reps</b>: hit failure, take 5 deep breaths, do 3–5 more. Repeat until you can’t get 3.',
  partial: 'Last set → <b>partials</b>: at failure, keep going with half reps in the stretched half until it won’t move.',
};

const DEFAULT_EFFORT_TEXT = {
  deload: 'Deload: first half of the sets, same weight, stop 3–4 reps short',
  ramp: 'Stop 2–3 reps before failure',
  free: 'Stop 1 rep short. Never grind a rep alone',
  core: 'Stop 1–2 reps short (lower back)',
  compound: 'Last set: 0–1 reps left. Others: 1–2 left',
  isolation: 'Last set to failure. Others: 1 rep left',
  beat: ' · beat last week',
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const isInt = (v) => Number.isInteger(v);

export function parseProgramText(text) {
  try {
    return { value: JSON.parse(text) };
  } catch (e) {
    // Turn "Unexpected token } in JSON at position 1234" into a line number.
    const m = String(e.message).match(/position (\d+)/);
    let where = '';
    if (m) {
      const pos = Number(m[1]);
      const line = text.slice(0, pos).split('\n').length;
      where = ` (around line ${line})`;
    } else {
      const lm = String(e.message).match(/line (\d+)/);
      if (lm) where = ` (around line ${lm[1]})`;
    }
    return { error: `This isn’t valid JSON${where}. Look for a missing comma, quote or bracket.` };
  }
}

export function checkProgram(input) {
  const errors = [];
  const err = (msg) => errors.push(msg);

  let raw = input;
  if (isStr(input)) {
    const parsed = parseProgramText(input);
    if (parsed.error) return { ok: false, errors: [parsed.error] };
    raw = parsed.value;
  }
  if (!isObj(raw)) return { ok: false, errors: ['The program must be a JSON object: it starts with { and ends with }.'] };

  const p = JSON.parse(JSON.stringify(raw));

  if (!isStr(p.title) || !p.title.trim()) err('Add a "title" (the name clients see at the top).');
  if (p.subtitle != null && !isStr(p.subtitle)) err('"subtitle" must be text.');
  if (p.unit == null) p.unit = 'kg';
  if (!['kg', 'lb'].includes(p.unit)) err('"unit" must be "kg" or "lb".');
  if (p.increment == null) p.increment = p.unit === 'lb' ? '5 lb on a bar, the next dumbbell, or one pin' : '2.5 kg on a bar, the next dumbbell, or one pin';

  if (!isInt(p.weeks) || p.weeks < 1 || p.weeks > 52) err('"weeks" must be a whole number from 1 to 52 (count the deload week too).');
  const weeks = isInt(p.weeks) ? p.weeks : 1;
  if (p.deloadWeek != null && (!isInt(p.deloadWeek) || p.deloadWeek < 1 || p.deloadWeek > weeks)) err(`"deloadWeek" must be a week number from 1 to ${weeks}, or left out.`);
  if (p.deloadWeek == null) p.deloadWeek = null;

  if (p.phases == null) p.phases = {};
  if (!isObj(p.phases)) err('"phases" must look like { "1": "text for week 1 onward", "5": "text for week 5 onward" }.');
  else for (const [k, v] of Object.entries(p.phases)) {
    if (!/^\d+$/.test(k) || Number(k) < 1 || Number(k) > weeks) err(`Phase "${k}" must be a week number from 1 to ${weeks}.`);
    if (!isStr(v)) err(`Phase "${k}" must be text.`);
  }

  p.effort = isObj(p.effort) ? p.effort : {};
  for (const k of ['rampUntil', 'techniqueFrom', 'beatFrom']) {
    if (p.effort[k] != null && (!isInt(p.effort[k]) || p.effort[k] < 0)) err(`"effort.${k}" must be a week number.`);
  }
  if (p.effort.rampUntil == null) p.effort.rampUntil = 0;
  if (p.effort.techniqueFrom == null) p.effort.techniqueFrom = 1;
  if (p.effort.beatFrom == null) p.effort.beatFrom = weeks + 1;
  p.effort.text = Object.assign({}, DEFAULT_EFFORT_TEXT, isObj(p.effort.text) ? p.effort.text : {});

  if (p.techniques == null) p.techniques = {};
  if (!isObj(p.techniques)) err('"techniques" must be an object of names to text.');
  p.techniques = Object.assign({}, DEFAULT_TECHNIQUES, isObj(p.techniques) ? p.techniques : {});

  if (p.shortPairs != null && (!isInt(p.shortPairs) || p.shortPairs < 1)) err('"shortPairs" must be a whole number (how many pairs Short mode keeps), or left out.');

  if (p.warmup != null) {
    if (!isObj(p.warmup) || !Array.isArray(p.warmup.steps) || !p.warmup.steps.every(isStr)) err('"warmup" must look like { "title": "...", "steps": ["...", "..."], "note": "..." }.');
  }

  // Sessions, pairs, exercises
  if (!Array.isArray(p.sessions) || p.sessions.length === 0) {
    err('Add at least one session under "sessions".');
    p.sessions = [];
  }
  if (p.sessions.length > 7) err('Use 7 sessions or fewer.');
  const ids = new Set();
  p.sessions.forEach((s, si) => {
    const sLabel = `Session ${si + 1}`;
    if (!isObj(s)) { err(`${sLabel} must be an object.`); return; }
    if (!isStr(s.id) || !/^[A-Za-z0-9]{1,8}$/.test(s.id)) err(`${sLabel} needs an "id" of 1–8 letters or numbers, like "A".`);
    else if (ids.has(s.id)) err(`Two sessions use the id "${s.id}". Each id must be different.`);
    else ids.add(s.id);
    const where = isStr(s.id) ? `Session ${s.id}` : sLabel;
    if (s.name == null) s.name = isStr(s.id) ? `Session ${s.id}` : sLabel;
    if (s.title == null) s.title = s.name;
    if (!isStr(s.name) || !isStr(s.title)) err(`${where}: "name" and "title" must be text.`);
    if (!Array.isArray(s.pairs) || s.pairs.length === 0) { err(`${where}: add at least one pair under "pairs".`); s.pairs = []; }
    const names = new Set();
    s.pairs.forEach((pr, pi) => {
      const pw = `${where} → Pair ${pi + 1}`;
      if (!isObj(pr)) { err(`${pw} must be an object.`); return; }
      pr.n = pi + 1;
      if (!isStr(pr.label) || !pr.label.trim()) err(`${pw}: add a "label", like "Chest & back".`);
      if (pr.rest == null) pr.rest = 60;
      if (!isInt(pr.rest) || pr.rest < 0 || pr.rest > 900) err(`${pw}: "rest" is seconds between sets, a whole number from 0 to 900.`);
      if (!Array.isArray(pr.exercises) || pr.exercises.length === 0) { err(`${pw}: add at least one exercise under "exercises".`); pr.exercises = []; }
      if (pr.exercises.length > 4) err(`${pw}: use 4 exercises or fewer per pair.`);
      pr.exercises.forEach((e, ei) => {
        const ew = `${pw} → ${isObj(e) && isStr(e.name) && e.name ? '"' + e.name + '"' : 'Exercise ' + (ei + 1)}`;
        if (!isObj(e)) { err(`${ew} must be an object.`); return; }
        if (!isStr(e.name) || !e.name.trim()) err(`${ew}: add a "name".`);
        else if (/\|/.test(e.name)) err(`${ew}: the name can’t contain "|".`);
        else if (names.has(e.name)) err(`${where} lists "${e.name}" twice. Give the second one a different name, like "${e.name} (2)".`);
        else names.add(e.name);
        if (!isInt(e.sets) || e.sets < 1 || e.sets > 12) err(`${ew}: "sets" must be a whole number from 1 to 12.`);
        if (e.reps == null) e.reps = '';
        if (typeof e.reps === 'number') e.reps = String(e.reps);
        if (!isStr(e.reps)) err(`${ew}: "reps" must be text like "8–12" or "10".`);
        if (e.kind == null) e.kind = 'compound';
        if (!KINDS.includes(e.kind)) err(`${ew}: "kind" must be one of ${KINDS.map((k) => '"' + k + '"').join(', ')}.`);
        if (e.warmup == null) e.warmup = 0;
        if (!(e.warmup === 0 || e.warmup === 1 || e.warmup === 2 || isStr(e.warmup))) err(`${ew}: "warmup" must be 0, 1, 2, or a short text.`);
        if (e.technique != null && !(isStr(e.technique) && p.techniques[e.technique])) err(`${ew}: "technique" must be one of ${Object.keys(p.techniques).map((k) => '"' + k + '"').join(', ')}, or left out.`);
        for (const k of ['muscle', 'cue', 'video', 'busy', 'busyNote', 'noGym', 'noGymNote']) {
          if (e[k] != null && !isStr(e[k])) err(`${ew}: "${k}" must be text.`);
        }
      });
    });
  });

  // Optional two-day fold: lets a client split one session into the others.
  if (p.twoDay != null) {
    const t = p.twoDay;
    const byId = Object.fromEntries(p.sessions.filter(isObj).map((s) => [s.id, s]));
    if (!isObj(t) || !isStr(t.from) || !isObj(t.into)) err('"twoDay" must look like { "from": "C", "into": { "A": [1, 2], "B": [3, 4] } }, or be left out.');
    else if (!byId[t.from]) err(`"twoDay.from" names session "${t.from}", which doesn’t exist.`);
    else {
      const maxPair = byId[t.from].pairs.length;
      for (const [sid, list] of Object.entries(t.into)) {
        if (!byId[sid] || sid === t.from) err(`"twoDay.into" names session "${sid}", which doesn’t exist or is the same as "from".`);
        if (!Array.isArray(list) || !list.every((n) => isInt(n) && n >= 1 && n <= maxPair)) err(`"twoDay.into.${sid}" must list pair numbers from 1 to ${maxPair}.`);
      }
    }
  } else p.twoDay = null;

  if (p.guide != null) {
    if (!Array.isArray(p.guide) || !p.guide.every((b) => isObj(b) && isStr(b.title) && Array.isArray(b.rows) && b.rows.every((r) => Array.isArray(r) && r.length === 2 && r.every(isStr)))) {
      err('"guide" must be a list like [ { "title": "...", "rows": [ ["Label", "Text"] ] } ], or left out.');
    }
  } else p.guide = [];
  if (p.footer != null && !isStr(p.footer)) err('"footer" must be text.');

  return errors.length ? { ok: false, errors } : { ok: true, program: p, errors: [] };
}

// A tiny program used when the coach starts from scratch.
export const BLANK_PROGRAM = {
  format: 1,
  title: 'New program',
  subtitle: '4 weeks · Sessions A and B',
  unit: 'kg',
  weeks: 4,
  deloadWeek: null,
  phases: { '1': 'Weeks 1–4 · Add a rep or a little weight each week.' },
  sessions: [
    {
      id: 'A', name: 'Session A', title: 'Session A — Upper', focus: 'Pressing and pulling.',
      pairs: [
        { label: 'Chest & back', rest: 90, exercises: [
          { name: 'Dumbbell bench press', sets: 3, reps: '8–12', muscle: 'chest', kind: 'compound', warmup: 1, cue: 'Control the lowering, press up hard.', video: 'dumbbell bench press form' },
          { name: 'Seated cable row', sets: 3, reps: '8–12', muscle: 'back', kind: 'compound', warmup: 1, cue: 'Chest tall, elbows back.', video: 'seated cable row form' },
        ] },
      ],
    },
    {
      id: 'B', name: 'Session B', title: 'Session B — Lower', focus: 'Legs and core.',
      pairs: [
        { label: 'Legs', rest: 90, exercises: [
          { name: 'Leg press', sets: 3, reps: '10–15', muscle: 'quads', kind: 'compound', warmup: 2, cue: 'Deep and controlled, lower back on the pad.', video: 'leg press form' },
          { name: 'Seated leg curl', sets: 3, reps: '10–15', muscle: 'hamstrings', kind: 'isolation', warmup: 1, cue: 'Squeeze, then lower slowly.', video: 'seated leg curl form' },
        ] },
      ],
    },
  ],
  guide: [],
  footer: '',
};
