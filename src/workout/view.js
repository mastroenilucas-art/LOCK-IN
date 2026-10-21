// The training screen a client uses in the gym (ported from the original single-user page).
import { Haptics, NotificationType } from '@capacitor/haptics';
import {
  esc, rich, num, setKey, noteKey, videoUrl, sessionById, isDeload, phaseText, foldPairsFor,
  effortText, techniqueText, warmupText, hint, lastLine, sessionMinutes, setCount, weekLabel,
} from './engine.js';

/**
 * Mounts the training screen into `root`.
 * opts: {
 *   program, state,              checked program + log state (state is changed in place)
 *   onChange(state),             called after every change (save it)
 *   actions: [{ label, title, onClick }]   buttons in the header (account, back to coach…)
 *   banner: { text, button, onClick }      optional strip above the weeks (preview mode)
 * }
 * Returns { setStatus(text, ok), unmount() }.
 */
export function mountWorkout(root, opts) {
  const P = opts.program;
  const state = opts.state;
  const changed = () => { state.updatedAt = Date.now(); opts.onChange && opts.onChange(state); };
  const sessions = P.sessions;
  const hasTwo = !!P.twoDay;

  root.innerHTML = `
  <div class="wrap">
    <header>
      <div class="htop">
        <h1>${esc(P.title)}</h1>
        <div class="hacts">${(opts.actions || []).map((a, i) => `<button type="button" class="hbtn" data-act="${i}" ${a.title ? `aria-label="${esc(a.title)}"` : ''}>${esc(a.label)}</button>`).join('')}</div>
      </div>
      ${P.subtitle ? `<p class="meta">${rich(P.subtitle)}</p>` : ''}
    </header>
    ${opts.banner ? `<div class="banner"><span>${esc(opts.banner.text)}</span>${opts.banner.button ? `<button type="button" data-banner>${esc(opts.banner.button)}</button>` : ''}</div>` : ''}
    <div class="weeks" data-el="weeks" role="group" aria-label="Week"></div>
    <div class="phase" data-el="phase"></div>
    ${hasTwo ? `
    <section class="strip" data-el="strip" aria-label="This week">
      <div class="strip-top">
        <span class="eyebrow" data-el="stripEye">This week</span>
        <div class="daysel" role="group" aria-label="Training days this week">
          <button type="button" data-days="all" aria-pressed="true">${sessions.length} days</button>
          <button type="button" data-days="two" aria-pressed="false">Only ${sessions.length - 1} days</button>
        </div>
      </div>
      <p data-el="stripText"></p>
    </section>` : ''}
    <nav class="tabs" role="tablist">
      ${sessions.map((s) => `<button type="button" role="tab" data-tab="${esc(s.id)}" aria-selected="false">${esc(s.name)}</button>`).join('')}
      <button type="button" role="tab" data-tab="P" aria-selected="false">Plan</button>
    </nav>
    ${sessions.map((s) => `<section data-panel="${esc(s.id)}" hidden></section>`).join('')}
    <section data-panel="P" hidden>${planHTML()}</section>
    ${P.footer ? `<footer>${rich(P.footer)}</footer>` : ''}
  </div>
  <div class="bar"><span class="status" data-el="status">Ready.</span></div>
  <div class="timer" data-el="timer" hidden>
    <div class="drain" data-el="drain"></div>
    <span class="t" data-el="tClock">0:00</span>
    <span class="w" data-el="tWhat"></span>
    <button type="button" data-el="tSkip">Skip</button>
  </div>`;

  const $ = (sel) => root.querySelector(sel);
  const el = (name) => root.querySelector(`[data-el="${name}"]`);
  const panel = (id) => root.querySelector(`[data-panel="${CSS.escape(id)}"]`);

  function planHTML() {
    let h = '';
    (P.guide || []).forEach((b) => {
      h += `<div class="block ${b.highlight ? 'prio' : ''}"><h3>${esc(b.title)}</h3>${b.rows.map((r) => `<div class="row"><b>${esc(r[0])}</b><span>${rich(r[1])}</span></div>`).join('')}</div>`;
    });
    if (!h) h = `<div class="block"><h3>How it works</h3><p>Pick the week at the top, open a session, and type the weight and reps for each set as you go. Everything saves by itself.</p></div>`;
    return h;
  }

  const isTwo = () => hasTwo && !!state.two[state.week];

  // ---------- rendering ----------
  function exHTML(day, e, pr, partner, o) {
    const w = state.week;
    const half = Math.ceil(e.sets / 2);
    let h = `<div class="ex">
      <div class="ex-top"><span class="ex-name">${esc(e.name)}</span><span class="ex-range">${e.sets}${e.reps ? ' × ' + esc(e.reps) : ' sets'}</span>${e.muscle ? `<span class="ex-tag">${esc(e.muscle)}</span>` : ''}
        ${e.video ? `<a class="vid" href="${esc(videoUrl(e.video))}" target="_blank" rel="noopener">video</a>` : ''}</div>
      <p class="eff">${rich(effortText(P, e, w))}</p>`;
    const tt = techniqueText(P, e, w);
    if (tt) h += `<p class="tech">${rich(tt)}</p>`;
    const wu = o.folded ? '' : warmupText(e);
    if (wu) h += `<p class="wu">${esc(wu)}</p>`;
    if (e.cue) h += `<p class="ex-cue">${rich(e.cue)}</p>`;
    if (!o.cut) {
      const hn = hint(P, state, day, e, w);
      if (hn) h += `<p class="hint ${hn.c}">${esc(hn.t)}</p>`;
    }
    h += '<div class="sets">';
    for (let i = 0; i < e.sets; i++) {
      const off = o.cut || (isDeload(P, w) && i >= half);
      const k = setKey(day, e.name, w, i);
      const v = state.log[k] || {};
      const done = (v.kg != null && v.kg !== '') || (v.reps != null && v.reps !== '');
      h += `<span class="set ${done ? 'done' : ''} ${off ? 'off' : ''}">
        <input type="text" inputmode="decimal" placeholder="${e.bodyweight ? '+' + P.unit : P.unit}" value="${esc(v.kg)}" data-k="${esc(k)}" data-f="kg" aria-label="${esc(e.name)}, set ${i + 1}, weight" autocomplete="off">
        <span class="x">×</span>
        <input type="text" inputmode="numeric" placeholder="reps" value="${esc(v.reps)}" data-k="${esc(k)}" data-f="reps" aria-label="${esc(e.name)}, set ${i + 1}, reps" autocomplete="off">
      </span>`;
    }
    h += '</div>';
    const ll = lastLine(P, state, day, e, w);
    if (ll) h += `<div class="prev">${esc(ll)}</div>`;
    const hasBusy = !!e.busy;
    const hasNoGym = !!e.noGym;
    h += `<div class="altrow">
        <button class="restbtn" type="button" data-rest="${pr.rest}" data-next="${esc(partner || e.name)}">Rest ${pr.rest} s</button>
        ${hasBusy ? '<button class="altbtn" type="button" data-alt="o" aria-expanded="false">Busy</button>' : ''}
        ${hasNoGym ? '<button class="altbtn" type="button" data-alt="c" aria-expanded="false">No gym</button>' : ''}
      </div>
      ${hasBusy ? `<div class="subst" data-sub="o" hidden><b>Machine taken → ${esc(e.busy)}</b>${e.busyNote ? `<span class="fall">${rich(e.busyNote)}</span>` : ''}</div>` : ''}
      ${hasNoGym ? `<div class="subst" data-sub="c" hidden><b>No gym → ${esc(e.noGym)}</b>${e.noGymNote ? `<span class="fall">${rich(e.noGymNote)}</span>` : ''}</div>` : ''}
    </div>`;
    return h;
  }

  function pairHTML(host, logDay, pr, o) {
    const oid = `${host}-${logDay}${pr.n}`;
    const open = !!state.open[oid];
    const label = (o.folded ? `${sessionById(P, logDay).name} · ` : '') + 'Pair ' + pr.n;
    let h = `<div class="pair ${open ? 'open' : ''} ${o.cut ? 'cut' : ''} ${o.folded || o.blue ? 'fold' : ''}">
      <button class="pair-head" type="button" data-open="${esc(oid)}" aria-expanded="${open}">
        <span class="n">${esc(label)}</span>
        <span class="lbl">${esc(pr.label)}${o.chip ? ` <span class="chip">${esc(o.chip)}</span>` : ''}</span>
        <span class="rs">${o.cut ? 'skip today' : 'rest ' + pr.rest + ' s'}</span>
      </button><div class="pair-body">`;
    if (pr.note) h += `<p class="samemachine">${rich(pr.note)}</p>`;
    pr.exercises.forEach((e, i) => {
      const p = pr.exercises.length > 1 ? pr.exercises[(i + 1) % pr.exercises.length] : null;
      h += exHTML(logDay, e, pr, p ? p.name : null, o);
    });
    h += '</div></div>';
    return h;
  }

  function renderSession(day) {
    const S = sessionById(P, day);
    const mode = state.mode[day] || 'full';
    const two = isTwo();
    const fold = two ? foldPairsFor(P, day) : null;
    const isFrom = two && P.twoDay.from === day;
    const full = sessionMinutes(P, day, 'full', !!fold);
    const shortM = P.shortPairs ? sessionMinutes(P, day, 'short', false) : 0;
    let h = `<div class="block"><h3>${esc(S.title)}</h3>${S.focus ? `<p>${rich(S.focus)}</p>` : ''}
      <p class="sub2">${setCount(S.pairs)} sets · ~${sessionMinutes(P, day, 'full', false)} min${fold ? ` · + ${esc(sessionById(P, P.twoDay.from).name)} pairs this week: ~${full} min` : ''}</p></div>`;
    if (P.shortPairs && S.pairs.length > P.shortPairs) {
      h += `<div class="modes" data-day="${esc(day)}">
        <button type="button" data-m="full" aria-pressed="${mode === 'full'}">Full · ~${full} min</button>
        <button type="button" data-m="short" aria-pressed="${mode === 'short'}">Short · ~${shortM} min</button>
      </div>`;
    }
    if (isFrom) {
      const into = Object.entries(P.twoDay.into).map(([sid, list]) => `Pairs ${list.join('–')} after ${esc(sessionById(P, sid).name)}`).join(', ');
      h += `<div class="block foldnote"><h3>No ${esc(S.name)} this week</h3>
        <p>Do these on top of your other sessions for as long as you can: ${into}. They’re already there, in blue. Whatever doesn’t fit, split into short 10–15 min mini-sessions during the week.</p></div>`;
    }
    if (P.warmup && P.warmup.steps && P.warmup.steps.length) {
      h += `<div class="block"><h3>${esc(P.warmup.title || 'Warm-up')}</h3><ol>${P.warmup.steps.map((s) => `<li>${rich(s)}</li>`).join('')}</ol>${P.warmup.note ? `<p class="note">${rich(P.warmup.note)}</p>` : ''}</div>`;
    }
    S.pairs.forEach((pr) => {
      const cut = mode === 'short' && P.shortPairs && pr.n > P.shortPairs;
      let chip = '';
      if (isFrom) {
        const target = Object.entries(P.twoDay.into).find(([, list]) => list.includes(pr.n));
        if (target) chip = '→ after ' + sessionById(P, target[0]).id;
      }
      h += pairHTML(day, day, pr, { cut, blue: isFrom, chip });
      if (mode === 'short' && P.shortPairs && pr.n === P.shortPairs && S.pairs.length > P.shortPairs) {
        h += `<div class="block prio"><h3>End of Short mode</h3><p>Pairs 1–${P.shortPairs} done${S.short ? ': ' + esc(S.short) : ''}. Everything below is what you skip today.</p></div>`;
      }
    });
    if (fold) {
      const sc = mode === 'short';
      const fromName = sessionById(P, P.twoDay.from).name;
      h += `<div class="block foldnote"><h3>+ From ${esc(fromName)}</h3>
        <p>${sc ? 'Short day: skip these today and split them into short mini-sessions this week.'
          : 'Fewer days this week: do these on top of today’s session for as long as you can. Didn’t fit? Split the rest into short mini-sessions during the week.'}</p></div>`;
      fold.forEach((pr) => { h += pairHTML(day, P.twoDay.from, pr, { folded: true, cut: sc }); });
    }
    const nk = noteKey(day, state.week);
    h += `<div class="block"><h3>Notes · ${esc(weekLabel(P, state.week).toLowerCase())}</h3><textarea data-note="${esc(nk)}" placeholder="Pain, form, energy, what stalled… Your coach sees this.">${esc(state.notes[nk])}</textarea></div>`;
    panel(day).innerHTML = h;
  }

  function renderWeeks() {
    const box = el('weeks');
    box.innerHTML = '';
    for (let w = 1; w <= P.weeks; w++) {
      const b = document.createElement('button');
      b.type = 'button';
      const dl = isDeload(P, w);
      b.textContent = dl ? 'DL' : String(w);
      if (dl) b.className = 'dl';
      b.dataset.week = String(w);
      b.setAttribute('aria-pressed', String(w === state.week));
      b.setAttribute('aria-label', dl ? `Week ${w}, deload` : `Week ${w}`);
      box.appendChild(b);
    }
    box.classList.toggle('many', P.weeks > 10);
  }
  function renderPhase() { el('phase').innerHTML = rich(phaseText(P, state.week)); }
  function renderStrip() {
    if (!hasTwo) return;
    const two = isTwo();
    const n = sessions.length;
    el('strip').classList.toggle('two', two);
    el('stripEye').textContent = `${weekLabel(P, state.week)} · ${two ? n - 1 : n} days`;
    root.querySelectorAll('.daysel button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.days === 'two') === two)));
    const from = sessionById(P, P.twoDay.from);
    const into = Object.entries(P.twoDay.into).map(([sid, list]) => `Pairs ${list.join('–')} after ${esc(sessionById(P, sid).id)}`).join(', ');
    el('stripText').innerHTML = two
      ? `${esc(from.name)} is split into the other sessions this week, in blue: ${into}. As long as you can, then 10–15 min mini-sessions for the rest.`
      : `Order: <b>${sessions.map((s) => esc(s.id)).join(' → ')}</b>, a rest day between when you can. Missed one? Do the session you did longest ago.`;
  }
  function renderAll() { sessions.forEach((s) => renderSession(s.id)); }
  function showTab(t) {
    state.tab = t;
    root.querySelectorAll('nav.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    root.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t; });
  }

  // ---------- events ----------
  function onInput(ev) {
    const t = ev.target;
    if (t.matches('.set input')) {
      const k = t.dataset.k;
      const f = t.dataset.f;
      const v = state.log[k] || {};
      v[f] = t.value;
      state.log[k] = v;
      const done = (v.kg != null && v.kg !== '') || (v.reps != null && v.reps !== '');
      if (!done) delete state.log[k];
      root.querySelectorAll('.set input').forEach((x) => {
        if (x.dataset.k === k) {
          if (x !== t && x.dataset.f === f) x.value = t.value;
          x.closest('.set').classList.toggle('done', done);
        }
      });
      changed();
    } else if (t.matches('textarea[data-note]')) {
      state.notes[t.dataset.note] = t.value;
      if (!t.value) delete state.notes[t.dataset.note];
      changed();
    }
  }

  function onClick(ev) {
    const b = ev.target.closest('button');
    if (!b || !root.contains(b)) return;
    if (b.dataset.act != null) { const a = (opts.actions || [])[Number(b.dataset.act)]; if (a) a.onClick(); return; }
    if (b.hasAttribute('data-banner')) { opts.banner && opts.banner.onClick && opts.banner.onClick(); return; }
    if (b.dataset.open) {
      const id = b.dataset.open;
      state.open[id] = !state.open[id];
      b.closest('.pair').classList.toggle('open', state.open[id]);
      b.setAttribute('aria-expanded', String(state.open[id]));
      changed();
      return;
    }
    if (b.dataset.rest) { startTimer(parseInt(b.dataset.rest, 10), b.dataset.next); return; }
    if (b.dataset.alt) {
      const ex = b.closest('.ex');
      const pane = ex.querySelector(`.subst[data-sub="${b.dataset.alt}"]`);
      const opening = pane.hidden;
      ex.querySelectorAll('.subst').forEach((p) => { p.hidden = true; });
      ex.querySelectorAll('.altbtn').forEach((x) => x.setAttribute('aria-expanded', 'false'));
      if (opening) { pane.hidden = false; b.setAttribute('aria-expanded', 'true'); }
      return;
    }
    if (b.dataset.m) { const d = b.closest('.modes').dataset.day; state.mode[d] = b.dataset.m; renderSession(d); changed(); return; }
    if (b.dataset.days) { state.two[state.week] = b.dataset.days === 'two'; if (!state.two[state.week]) delete state.two[state.week]; renderStrip(); renderAll(); changed(); return; }
    if (b.dataset.week) { state.week = parseInt(b.dataset.week, 10); renderWeeks(); renderPhase(); renderStrip(); renderAll(); changed(); return; }
    if (b.dataset.tab) { renderAll(); showTab(b.dataset.tab); window.scrollTo({ top: 0 }); changed(); return; }
    if (b.dataset.el === 'tSkip') { stopTimer(); }
  }

  // ---------- rest timer ----------
  let tInt = null;
  let tEnd = 0;
  let tTotal = 0;
  function startTimer(sec, next) {
    clearInterval(tInt);
    tTotal = Math.max(1, sec);
    tEnd = Date.now() + sec * 1000;
    el('tWhat').textContent = next ? 'Next: ' + next : '';
    el('timer').hidden = false;
    tick();
    tInt = setInterval(tick, 250);
  }
  function tick() {
    const left = Math.max(0, Math.round((tEnd - Date.now()) / 1000));
    el('tClock').textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
    el('drain').style.width = (100 * left / tTotal) + '%';
    if (left <= 0) {
      stopTimer();
      Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    }
  }
  function stopTimer() { clearInterval(tInt); el('timer').hidden = true; }

  root.addEventListener('input', onInput);
  root.addEventListener('click', onClick);

  // ---------- first paint ----------
  renderWeeks();
  renderPhase();
  renderStrip();
  renderAll();
  showTab(state.tab);

  return {
    setStatus(text, ok) {
      const s = el('status');
      if (!s) return;
      s.textContent = text;
      s.classList.toggle('ok', !!ok);
    },
    unmount() {
      clearInterval(tInt);
      root.removeEventListener('input', onInput);
      root.removeEventListener('click', onClick);
      root.innerHTML = '';
    },
  };
}
