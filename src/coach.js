// Coach screen: clients, their logs, logins, and programs.
import cfg from '../app.config.json';
import { APP_NAME } from './config.js';
import {
  listProfiles, listPrograms, listLogs, updateProfile, createProgram, updateProgram, deleteProgram, manage,
} from './supa.js';
import { sheet, confirmDialog, toast, copyText, timeAgo, randomPassword, esc } from './ui.js';
import { checkProgram, BLANK_PROGRAM, parseProgramText } from './program-check.js';
import { restoreState, logReport, summaryText, lastLoggedWeek, weekLabel } from './workout/engine.js';
import { mountWorkout } from './workout/view.js';

const TAB_KEY = 'coachapp:coach-tab';

export function mountCoach(root, { user, profile, onAccount, onMyTraining }) {
  let data = { profiles: [], programs: [], logs: [] };
  let me = profile;
  let loaded = false;
  let loadError = '';
  let tab = 'clients';
  try { tab = sessionStorage.getItem(TAB_KEY) || 'clients'; } catch { /* ignore */ }
  let sub = null; // editor or preview, when open
  let alive = true;

  const programById = (id) => data.programs.find((p) => p.id === id);
  const clients = () => data.profiles.filter((p) => p.role !== 'coach').sort((a, b) => label(a).localeCompare(label(b)));
  const label = (p) => (p.full_name && p.full_name.trim()) || p.email || 'No name';
  const logFor = (uid, pid) => data.logs.find((l) => l.user_id === uid && l.program_id === pid);
  const usersOf = (pid) => data.profiles.filter((p) => p.program_id === pid);
  const initials = () => {
    const n = (me.full_name || user.email || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
    return ((n[0] || '?')[0] + (n[1] ? n[1][0] : '')).toUpperCase();
  };

  async function load() {
    const [pr, pg, lg] = await Promise.all([listProfiles(), listPrograms(), listLogs()]);
    if (!alive) return;
    const err = pr.error || pg.error || lg.error;
    if (err) {
      loadError = err;
    } else {
      loadError = '';
      data = { profiles: pr.data || [], programs: pg.data || [], logs: lg.data || [] };
      me = data.profiles.find((p) => p.id === user.id) || me;
    }
    loaded = true;
    if (!sub) render();
  }

  // ---------- main screen ----------
  function render() {
    const cl = clients();
    root.innerHTML = `
    <div class="wrap coach">
      <header>
        <div class="htop">
          <h1>Coach</h1>
          <div class="hacts">
            ${me.program_id ? '<button type="button" class="hbtn" data-act="mine">My training</button>' : ''}
            <button type="button" class="hbtn" data-act="account" aria-label="Account">${esc(initials())}</button>
          </div>
        </div>
        <p class="meta">${esc(APP_NAME)} · ${cl.length} client${cl.length === 1 ? '' : 's'} · ${data.programs.length} program${data.programs.length === 1 ? '' : 's'}</p>
      </header>
      <nav class="tabs" role="tablist">
        <button type="button" role="tab" data-ctab="clients" aria-selected="${tab === 'clients'}">Clients</button>
        <button type="button" role="tab" data-ctab="programs" aria-selected="${tab === 'programs'}">Programs</button>
      </nav>
      ${loadError ? `<p class="err">${esc(loadError)} <button type="button" class="linkbtn" data-act="refresh">Try again</button></p>` : ''}
      <section data-cpanel="clients" ${tab === 'clients' ? '' : 'hidden'}>
        <div class="toolbar">
          <button type="button" class="primary" data-act="add-client">+ Add client</button>
          <button type="button" class="ghost" data-act="refresh">Refresh</button>
        </div>
        <div class="list">
          ${!loaded ? '<p class="dim">Loading…</p>' : cl.length ? cl.map(clientRow).join('') : '<div class="empty"><b>No clients yet.</b><br>Tap <i>Add client</i> to create their login, then send them the message it gives you.</div>'}
          ${loaded ? meRow() : ''}
        </div>
      </section>
      <section data-cpanel="programs" ${tab === 'programs' ? '' : 'hidden'}>
        <div class="toolbar">
          <button type="button" class="primary" data-act="new-program">+ New program</button>
        </div>
        <div class="list">
          ${!loaded ? '<p class="dim">Loading…</p>' : data.programs.length ? data.programs.map(programRow).join('') : '<div class="empty"><b>No programs yet.</b><br>Tap <i>New program</i> to make one.</div>'}
        </div>
      </section>
    </div>`;
  }

  function clientRow(c) {
    const prog = programById(c.program_id);
    const log = prog ? logFor(c.id, prog.id) : null;
    let side = '<span class="dim">no sets yet</span>';
    if (log) {
      const pc = checkProgram(prog.data);
      const st = log.data || {};
      const w = pc.ok ? lastLoggedWeek(pc.program, restoreState(pc.program, st)) : 0;
      side = `${w ? esc(weekLabel(pc.program, w)) + '<br>' : ''}<span class="dim">${esc(timeAgo(log.updated_at))}</span>`;
    }
    return `<button type="button" class="item" data-client="${esc(c.id)}">
      <span class="item-main"><b>${esc(label(c))}</b><span class="dim">${prog ? esc(prog.name) : '<i>No program</i>'}</span></span>
      <span class="item-side">${side}</span>
    </button>`;
  }

  function meRow() {
    const prog = programById(me.program_id);
    return `<button type="button" class="item mine" data-client="${esc(me.id)}">
      <span class="item-main"><b>You (coach)</b><span class="dim">${prog ? 'Training on ' + esc(prog.name) : 'Give yourself a program to try it like a client'}</span></span>
      <span class="item-side dim">›</span>
    </button>`;
  }

  function programRow(p) {
    const users = usersOf(p.id);
    const title = p.data && p.data.title ? p.data.title : '';
    return `<button type="button" class="item" data-program="${esc(p.id)}">
      <span class="item-main"><b>${esc(p.name)}</b><span class="dim">${esc(title)}${title ? ' · ' : ''}${users.length} using it</span></span>
      <span class="item-side dim">edited ${esc(timeAgo(p.updated_at))}</span>
    </button>`;
  }

  const programOptions = (selected, withNone = true) =>
    (withNone ? `<option value="">No program</option>` : '') +
    data.programs.map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

  // ---------- clicks on the main screen ----------
  async function onClick(ev) {
    if (sub) return;
    const b = ev.target.closest('button');
    if (!b || !root.contains(b)) return;
    if (b.dataset.ctab) {
      tab = b.dataset.ctab;
      try { sessionStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ }
      render();
      return;
    }
    const act = b.dataset.act;
    if (act === 'account') return onAccount(me);
    if (act === 'mine') return onMyTraining(me);
    if (act === 'refresh') { toast('Refreshing…'); return load(); }
    if (act === 'add-client') return addClient();
    if (act === 'new-program') return newProgram();
    if (b.dataset.client) return openClient(b.dataset.client);
    if (b.dataset.program) return openEditor(b.dataset.program);
  }
  root.addEventListener('click', onClick);

  // ---------- add a client ----------
  function addClient() {
    if (!data.programs.length) { toast('Make a program first (Programs tab).', false); return; }
    sheet({
      title: 'Add client',
      html: `
        <form data-form="add" novalidate>
          <label class="field"><span>Name</span><input name="full_name" autocomplete="off" required></label>
          <label class="field"><span>Email (their login)</span><input type="email" name="email" inputmode="email" autocapitalize="none" autocomplete="off" required></label>
          <label class="field"><span>Temporary password</span><input name="password" autocomplete="off" autocapitalize="none" value="${esc(randomPassword())}" required></label>
          <label class="field"><span>Program</span><select name="program_id">${programOptions(data.programs[0] && data.programs[0].id, false)}</select></label>
          <p class="err" hidden></p>
          <button type="submit" class="primary wide">Create login</button>
        </form>`,
      onMount(body) {
        const form = body.querySelector('form');
        const err = form.querySelector('.err');
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          err.hidden = true;
          const full_name = form.full_name.value.trim();
          const email = form.email.value.trim().toLowerCase();
          const password = form.password.value.trim();
          const program_id = form.program_id.value || null;
          if (!full_name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Add their name and a valid email.'; err.hidden = false; return; }
          if (password.length < 8) { err.textContent = 'The password needs at least 8 characters.'; err.hidden = false; return; }
          const btn = form.querySelector('button[type=submit]');
          btn.disabled = true;
          btn.textContent = 'Creating…';
          const { error } = await manage('create_client', { full_name, email, password, program_id });
          if (error) {
            err.textContent = error;
            err.hidden = false;
            btn.disabled = false;
            btn.textContent = 'Create login';
            return;
          }
          load();
          body.innerHTML = inviteHTML(full_name, email, password);
          wireCopy(body);
        });
      },
    });
  }

  function inviteText(name, email, password) {
    const first = (name || '').split(/\s+/)[0] || 'there';
    const lines = [
      `Hi ${first}! Here’s your login for ${APP_NAME}, where your training program lives:`,
      '',
      `Email: ${email}`,
      `Password: ${password}`,
      '',
      'On iPhone:',
      '1. Install TestFlight from the App Store.',
      `2. Open this link on your iPhone: ${cfg.testflightLink || '[paste your TestFlight link]'}`,
      `3. Tap Install, open ${APP_NAME} and sign in.`,
    ];
    if (cfg.webLink) lines.push('', `Not on iPhone? Use it in your browser instead: ${cfg.webLink}`);
    lines.push('', 'You can change your password in the app: tap the circle at the top right.');
    return lines.join('\n');
  }

  function inviteHTML(name, email, password) {
    return `
      <p class="okmsg">Login created for ${esc(name)}.</p>
      <p>Send them this message. You can edit it first.</p>
      <textarea class="msg" data-copytext rows="12">${esc(inviteText(name, email, password))}</textarea>
      <button type="button" class="primary wide" data-copy>Copy message</button>`;
  }

  function wireCopy(body) {
    const btn = body.querySelector('[data-copy]');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const ok = await copyText(body.querySelector('[data-copytext]').value);
      toast(ok ? 'Copied. Paste it into WhatsApp, text or email.' : 'Select the text and copy it.', ok);
    });
  }

  // ---------- one client ----------
  function openClient(id) {
    const c = data.profiles.find((p) => p.id === id);
    if (!c) return;
    const isMe = c.id === me.id;
    const loggedPrograms = data.logs.filter((l) => l.user_id === c.id).map((l) => programById(l.program_id)).filter(Boolean);
    const reportIds = Array.from(new Set([c.program_id, ...loggedPrograms.map((p) => p.id)].filter(Boolean)));
    sheet({
      title: isMe ? 'You (coach)' : label(c),
      wide: true,
      html: `
        <p class="dim">${esc(c.email || '')}</p>
        <form data-form="client" novalidate>
          ${isMe ? '' : `<label class="field"><span>Name</span><input name="full_name" value="${esc(c.full_name || '')}" autocomplete="off"></label>`}
          <label class="field"><span>${isMe ? 'Program for yourself (adds a “My training” button)' : 'Program'}</span><select name="program_id">${programOptions(c.program_id)}</select></label>
          <p class="err" hidden></p>
          <button type="submit" class="primary">Save</button>
        </form>
        ${isMe ? '' : `
        <div class="btnrow left">
          <button type="button" class="ghost" data-act="reset">Reset password</button>
          <button type="button" class="ghost" data-act="remove">Remove client</button>
        </div>
        <h3 class="sect">Training log</h3>
        ${reportIds.length > 1 ? `<label class="field"><span>Program</span><select data-logprog>${reportIds.map((pid) => `<option value="${esc(pid)}">${esc(programById(pid) ? programById(pid).name : 'Program')}</option>`).join('')}</select></label>` : ''}
        <div data-report></div>`}`,
      onMount(body, close) {
        const form = body.querySelector('[data-form="client"]');
        const err = form.querySelector('.err');
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          err.hidden = true;
          const patch = { program_id: form.program_id.value || null };
          if (!isMe) patch.full_name = form.full_name.value.trim() || null;
          if (patch.program_id !== (c.program_id || null) && c.program_id && !isMe) {
            const to = programById(patch.program_id);
            const ok = await confirmDialog({
              title: 'Switch program?',
              text: `${esc(label(c))} starts ${to ? '<b>' + esc(to.name) + '</b>' : 'with no program'} at week 1 next time they open the app. Their log for <b>${esc(programById(c.program_id) ? programById(c.program_id).name : 'the old program')}</b> stays saved and you can still see it here.`,
              confirm: 'Switch',
            });
            if (!ok) return;
          }
          const { error } = await updateProfile(c.id, patch);
          if (error) { err.textContent = error; err.hidden = false; return; }
          toast('Saved.');
          close();
          load();
        });
        if (isMe) return;

        body.querySelector('[data-act="reset"]').addEventListener('click', () => { close(); resetPassword(c); });
        body.querySelector('[data-act="remove"]').addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: `Remove ${esc(label(c))}?`,
            text: 'This deletes their login and their whole training log. They can’t sign in any more. This can’t be undone.',
            confirm: 'Remove client',
            danger: true,
            typeWord: 'REMOVE',
          });
          if (!ok) return;
          const { error } = await manage('delete_client', { user_id: c.id });
          if (error) { toast(error, false); return; }
          toast(`${label(c)} removed.`);
          close();
          load();
        });

        const box = body.querySelector('[data-report]');
        const sel = body.querySelector('[data-logprog]');
        const show = (pid) => { box.innerHTML = reportHTML(c, pid); wireReport(box, c, pid); };
        show(reportIds[0]);
        if (sel) sel.addEventListener('change', () => show(sel.value));
      },
    });
  }

  function reportHTML(c, pid) {
    const prog = programById(pid);
    if (!prog) return '<p class="dim">No program.</p>';
    const pc = checkProgram(prog.data);
    if (!pc.ok) return `<p class="err">This program has a problem: ${esc(pc.errors[0])}</p>`;
    const log = logFor(c.id, pid);
    if (!log) return `<p class="dim">Nothing logged on ${esc(prog.name)} yet.</p>`;
    const state = restoreState(pc.program, log.data);
    const rep = logReport(pc.program, state);
    if (!rep.length) return `<p class="dim">Nothing logged on ${esc(prog.name)} yet.</p>`;
    let h = `<p class="small dim">Last update ${esc(timeAgo(log.updated_at))}</p>`;
    rep.forEach(({ session, exercises, notes }) => {
      h += `<div class="rep"><h4>${esc(session.title)}</h4>`;
      exercises.forEach((x) => {
        h += `<div class="rep-ex"><div class="rep-name">${esc(x.name)} <span class="dim">${esc(x.setsLabel)}</span></div>`;
        h += x.weeks.map((w) => `<div class="rep-row"><b>${esc(w.label)}</b><span>${esc(w.text)}</span></div>`).join('');
        h += '</div>';
      });
      notes.forEach((n) => { h += `<div class="rep-note"><b>Notes · ${esc(n.label)}</b> ${esc(n.text)}</div>`; });
      h += '</div>';
    });
    h += '<button type="button" class="ghost" data-copylog>Copy as text</button>';
    return h;
  }

  function wireReport(box, c, pid) {
    const b = box.querySelector('[data-copylog]');
    if (!b) return;
    b.addEventListener('click', async () => {
      const prog = programById(pid);
      const pc = checkProgram(prog.data);
      const state = restoreState(pc.program, logFor(c.id, pid).data);
      const ok = await copyText(summaryText(pc.program, state, label(c)));
      toast(ok ? 'Log copied.' : 'Couldn’t copy on this device.', ok);
    });
  }

  function resetPassword(c) {
    sheet({
      title: `New password for ${label(c)}`,
      html: `
        <form novalidate>
          <label class="field"><span>New temporary password</span><input name="password" value="${esc(randomPassword())}" autocomplete="off" autocapitalize="none"></label>
          <p class="err" hidden></p>
          <button type="submit" class="primary wide">Set password</button>
        </form>`,
      onMount(body) {
        const form = body.querySelector('form');
        const err = form.querySelector('.err');
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const password = form.password.value.trim();
          if (password.length < 8) { err.textContent = 'Use at least 8 characters.'; err.hidden = false; return; }
          const { error } = await manage('reset_password', { user_id: c.id, password });
          if (error) { err.textContent = error; err.hidden = false; return; }
          const first = (c.full_name || '').split(/\s+/)[0] || 'there';
          body.innerHTML = `
            <p class="okmsg">Password changed.</p>
            <textarea class="msg" data-copytext rows="5">${esc(`Hi ${first}, your new ${APP_NAME} password is: ${password}\nSign in with ${c.email}, then change it in the app (tap the circle at the top right).`)}</textarea>
            <button type="button" class="primary wide" data-copy>Copy message</button>`;
          wireCopy(body);
        });
      },
    });
  }

  // ---------- programs ----------
  function newProgram() {
    sheet({
      title: 'New program',
      html: `
        <form novalidate>
          <label class="field"><span>Name (only you see this, e.g. “Maria — Block 2”)</span><input name="name" autocomplete="off" required></label>
          <label class="field"><span>Start from</span><select name="from">
            ${data.programs.map((p) => `<option value="${esc(p.id)}">A copy of ${esc(p.name)}</option>`).join('')}
            <option value="">A short blank example</option>
          </select></label>
          <p class="err" hidden></p>
          <button type="submit" class="primary wide">Create</button>
        </form>`,
      onMount(body, close) {
        const form = body.querySelector('form');
        const err = form.querySelector('.err');
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const name = form.name.value.trim();
          if (!name) { err.textContent = 'Give it a name.'; err.hidden = false; return; }
          const src = programById(form.from.value);
          const json = JSON.parse(JSON.stringify(src ? src.data : BLANK_PROGRAM));
          const { data: row, error } = await createProgram(name, json);
          if (error) { err.textContent = error; err.hidden = false; return; }
          data.programs.push(row);
          close();
          openEditor(row.id);
          load();
        });
      },
    });
  }

  function openEditor(id, draft) {
    const p = programById(id);
    if (!p) return;
    if (sub && sub.click) root.removeEventListener('click', sub.click);
    let text = draft ? draft.text : JSON.stringify(p.data, null, 2);
    let name = draft ? draft.name : p.name;
    const savedText = JSON.stringify(p.data, null, 2);
    const isDirty = () => text !== savedText || name !== p.name;
    sub = { kind: 'editor' };
    window.scrollTo(0, 0);
    const users = usersOf(p.id);
    root.innerHTML = `
    <div class="wrap editor">
      <header>
        <div class="htop">
          <h1>Edit program</h1>
          <div class="hacts"><button type="button" class="hbtn" data-e="back">← Back</button></div>
        </div>
        <p class="meta">${users.length ? 'Used by ' + users.map((u) => esc(u.id === me.id ? 'you' : label(u))).join(', ') + '. Saving changes it for them next time they open the app.' : 'Nobody is on this program yet.'}</p>
      </header>
      <label class="field"><span>Name (only you see this)</span><input data-e="name" value="${esc(name)}" autocomplete="off"></label>
      <label class="field"><span>Program</span><textarea class="code" data-e="json" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off" wrap="off">${esc(text)}</textarea></label>
      <div class="errs" data-e="errs" hidden></div>
      <div class="btnrow left wrapbtns">
        <button type="button" class="primary" data-e="save">Save</button>
        <button type="button" class="ghost" data-e="preview">Preview</button>
        <button type="button" class="ghost" data-e="check">Check</button>
        <button type="button" class="ghost" data-e="claude">Copy prompt for Claude</button>
      </div>
      <div class="block help">
        <h3>Writing a program</h3>
        <ol>
          <li>Tap <b>Copy prompt for Claude</b> and paste it into Claude.</li>
          <li>Replace the line in brackets with what this client needs: goal, days per week, equipment, injuries, exercises to swap.</li>
          <li>Copy Claude’s answer, select everything in the box above, paste it over, and tap <b>Save</b>.</li>
        </ol>
        <p class="note">Every field is explained in <b>programs/PROGRAM_FORMAT.md</b> in the project. <b>Save</b> checks the program first and tells you what to fix. Renaming an exercise starts its history fresh.</p>
      </div>
      <div class="btnrow left"><button type="button" class="danger-link" data-e="delete">Delete this program</button></div>
    </div>`;

    const q = (k) => root.querySelector(`[data-e="${k}"]`);
    const errs = q('errs');
    const showErrors = (list) => {
      if (!list || !list.length) { errs.hidden = true; errs.innerHTML = ''; return; }
      errs.hidden = false;
      errs.innerHTML = `<b>Fix ${list.length === 1 ? 'this' : 'these'} first:</b><ul>${list.slice(0, 12).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>${list.length > 12 ? `<p>…and ${list.length - 12} more.</p>` : ''}`;
      errs.scrollIntoView({ block: 'nearest' });
    };
    q('json').addEventListener('input', (e) => { text = e.target.value; });
    q('name').addEventListener('input', (e) => { name = e.target.value; });

    const handlers = {
      async back() {
        if (isDirty()) {
          const ok = await confirmDialog({ title: 'Leave without saving?', text: 'Your changes to this program will be lost.', confirm: 'Leave', danger: true });
          if (!ok) return;
        }
        closeSub();
      },
      check() {
        const r = checkProgram(text);
        if (r.ok) { showErrors([]); toast('Looks good. Tap Save to keep it.'); } else showErrors(r.errors);
      },
      async save() {
        const r = checkProgram(text);
        if (!r.ok) { showErrors(r.errors); toast('Not saved: fix the list above first.', false); return; }
        if (!name.trim()) { showErrors(['Give the program a name.']); return; }
        showErrors([]);
        const parsed = parseProgramText(text).value;
        const { data: row, error } = await updateProgram(p.id, { name: name.trim(), data: parsed });
        if (error) { toast(error, false); return; }
        Object.assign(p, row);
        toast('Saved.');
        openEditor(p.id);
        load();
      },
      preview() {
        const r = checkProgram(text);
        if (!r.ok) { showErrors(r.errors); toast('Fix the list above to preview.', false); return; }
        showErrors([]);
        openPreview(p, r.program, { text, name });
      },
      async claude() {
        const ok = await copyText(claudePrompt(text));
        toast(ok ? 'Copied. Paste it into Claude and fill in the line in brackets.' : 'Couldn’t copy on this device.', ok);
      },
      async delete() {
        if (users.length) { toast('Move everyone off this program first (open each client and pick another).', false); return; }
        const hasLogs = data.logs.some((l) => l.program_id === p.id);
        if (hasLogs) { toast('Clients have logged sets on this program, so it’s kept. Rename it to “OLD — …” instead.', false); return; }
        const ok = await confirmDialog({ title: 'Delete this program?', text: `<b>${esc(p.name)}</b> will be deleted. This can’t be undone.`, confirm: 'Delete', danger: true });
        if (!ok) return;
        const { error } = await deleteProgram(p.id);
        if (error) { toast(/foreign key|violates/i.test(error) ? 'Clients have logged sets on this program, so it can’t be deleted.' : error, false); return; }
        data.programs = data.programs.filter((x) => x.id !== p.id);
        toast('Program deleted.');
        closeSub();
        load();
      },
    };
    sub.click = (ev) => {
      const b = ev.target.closest('button[data-e]');
      if (b && handlers[b.dataset.e]) handlers[b.dataset.e]();
    };
    root.addEventListener('click', sub.click);
  }

  function openPreview(p, program, draft) {
    if (sub && sub.click) root.removeEventListener('click', sub.click);
    const view = mountWorkout(root, {
      program,
      state: restoreState(program, null),
      onChange: () => {},
      actions: [],
      banner: { text: 'Preview · nothing you type here is saved', button: 'Close preview', onClick: () => { view.unmount(); sub = null; openEditor(p.id, draft); } },
    });
    view.setStatus('Preview only.', false);
    sub = { kind: 'preview', view };
    window.scrollTo(0, 0);
  }

  function closeSub() {
    if (sub && sub.click) root.removeEventListener('click', sub.click);
    if (sub && sub.view) sub.view.unmount();
    sub = null;
    render();
    window.scrollTo(0, 0);
  }

  render();
  load();

  return {
    unmount() {
      alive = false;
      if (sub && sub.click) root.removeEventListener('click', sub.click);
      if (sub && sub.view) sub.view.unmount();
      root.removeEventListener('click', onClick);
      root.innerHTML = '';
    },
  };
}

function claudePrompt(json) {
  return `I'm a personal trainer. My clients follow their programs in an app, and each program is written in the JSON format below. Please rewrite this program for my client. Keep exactly the same structure and field names, and reply with only the finished JSON (no explanation, no code fences).

What this client needs:
[WRITE IT HERE: name, goal, days per week, session length, equipment, injuries, exercises to keep or swap, kg or lb]

How the format works:
- "title" is what the client sees at the top; "subtitle" is one line under it.
- "unit" is "kg" or "lb". "weeks" counts every week, including a deload week. "deloadWeek" is that week's number, or null for none.
- "phases" gives the coaching text shown from a week onward, e.g. {"1": "Weeks 1–2 · <b>Ramp-in</b>. …", "3": "…"}.
- "effort" sets which weeks are easy ramp-in weeks ("rampUntil"), when last-set techniques start ("techniqueFrom") and when to push to beat last week ("beatFrom").
- "sessions" are the training days. Each has a short "id" like "A", a "name", a "title", a one-line "focus", a "short" list of what Short mode covers, and "pairs".
- A pair is 1–4 exercises done back to back: "label", "rest" (seconds), optional "note" (setup tip), and "exercises".
- Each exercise: "name" (different from the others in that session), "sets", "reps" like "8–12", "muscle", "kind" ("free" = barbell or dumbbell compound, "compound" = machine, cable or bodyweight compound, "isolation", or "core"), "warmup" (0, 1 or 2 warm-up sets, or a short text), optional "technique" ("myo" or "partial", used in later weeks), "cue" (1–2 short coaching sentences), "video" (YouTube search words), "busy" and "busyNote" (swap if the machine is taken), "noGym" and "noGymNote" (swap for training at home), optional "bodyweight": true for weighted bodyweight moves.
- "shortPairs" is how many pairs Short mode keeps. "twoDay" (optional) says how to split one session into the others in a week with one fewer day; drop it if it doesn't fit.
- "warmup", "guide" (the Plan tab: titled lists of ["Label", "Text"] rows) and "footer" are optional.
- Text can use <b> and <i>, nothing else.

Current program:
${json}`;
}
