// App entry: decides which screen to show (setup, sign in, client training, coach).
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './styles.css';

import { APP_NAME, NEEDS_SETUP } from './config.js';
import { supabase, getProfile, getProgram } from './supa.js';
import { applyTheme } from './theme.js';
import { esc, hhmm, toast, hideToast, confirmDialog } from './ui.js';
import { showLogin } from './login.js';
import { openAccount } from './account.js';
import { mountCoach } from './coach.js';
import { mountWorkout } from './workout/view.js';
import { restoreState } from './workout/engine.js';
import { checkProgram } from './program-check.js';
import { createLogSync } from './sync.js';
import { cacheGet, cacheSet, cacheClearUser, keys } from './cache.js';

const app = document.getElementById('app');
let current = null; // the mounted screen: { unmount(), flush?(), isDirty?() }
let generation = 0; // bumps on every sign-in/out, so late network answers for an old screen are ignored

function clearScreen() {
  if (current) { current.unmount(); current = null; }
  document.querySelectorAll('.scrim').forEach((s) => s.remove());
  document.body.classList.remove('noscroll');
  hideToast();
  window.scrollTo(0, 0);
}

const initials = (profile, user) => {
  const n = (profile && profile.full_name) || (user && user.email) || '?';
  const parts = n.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
};

// ---------- simple full-screen messages ----------
function showMessage({ title, text, retry, user, profile }) {
  clearScreen();
  app.innerHTML = `
    <div class="center">
      <div class="card">
        <p class="eyebrow">${esc(APP_NAME)}</p>
        <h2>${esc(title)}</h2>
        <p>${text}</p>
        <div class="btnrow">
          ${user ? '<button type="button" class="ghost" data-act="account">Account</button>' : ''}
          ${retry ? '<button type="button" class="primary" data-act="retry">Try again</button>' : ''}
        </div>
      </div>
    </div>`;
  app.querySelector('[data-act="retry"]')?.addEventListener('click', retry);
  app.querySelector('[data-act="account"]')?.addEventListener('click', () => openAccount(accountOpts(user, profile)));
}

function showLoading(text = 'Loading…') {
  clearScreen();
  app.innerHTML = `<div class="center"><p class="dim">${esc(text)}</p></div>`;
}

function showSetupNeeded() {
  app.innerHTML = `
    <div class="center">
      <div class="card">
        <p class="eyebrow">Setup needed</p>
        <h2>Connect the app to Supabase</h2>
        <p>Open <b>app.config.json</b> in the project and paste in your Supabase <b>Project URL</b> and <b>Publishable key</b>. The setup guide shows where to find them.</p>
      </div>
    </div>`;
}

// ---------- sign in / out ----------
function loginScreen(message) {
  generation++;
  clearScreen();
  showLogin(app, { onSignedIn: (user) => enter(user), message });
}

async function signOut(user) {
  if (current && current.flush) await current.flush();
  if (current && current.isDirty && current.isDirty()) {
    const ok = await confirmDialog({
      title: 'Sign out?',
      text: 'Some of your sets haven’t reached the server yet (no connection). If you sign out now, they’re lost.',
      confirm: 'Sign out anyway',
      danger: true,
    });
    if (!ok) return;
  }
  clearScreen();
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  if (user) cacheClearUser(user.id);
  loginScreen();
}

function accountOpts(user, profile) {
  return {
    user,
    profile,
    onSignOut: () => signOut(user),
    onDeleted: async () => {
      clearScreen();
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      cacheClearUser(user.id);
      loginScreen('Your account and training log were deleted.');
    },
  };
}

// ---------- after sign-in ----------
// Opens straight away from the copy saved on this phone (works with no signal),
// then checks the server in the background and updates if anything changed.
async function enter(user) {
  const gen = ++generation;
  const uid = user.id;
  const cached = cacheGet(keys.profile(uid));
  if (cached) {
    route(user, cached);
    // The training screen checks for program changes itself; this covers the other screens.
    if (cached.role !== 'coach' && cached.program_id) return;
    const fresh = await getProfile(uid);
    if (gen !== generation || !fresh.data) return;
    cacheSet(keys.profile(uid), fresh.data);
    if (fresh.data.role !== cached.role || fresh.data.program_id !== cached.program_id) route(user, fresh.data);
    return;
  }
  showLoading();
  const fresh = await getProfile(uid);
  if (gen !== generation) return;
  if (fresh.data) {
    cacheSet(keys.profile(uid), fresh.data);
    return route(user, fresh.data);
  }
  if (fresh.error) return showMessage({ title: 'Can’t connect', text: esc(fresh.error), retry: () => enter(user), user });
  return showMessage({
    title: 'Account not set up',
    text: 'You’re signed in, but this account has no profile yet. Ask your coach to run the database setup step again (see the setup guide).',
    retry: () => enter(user),
    user,
  });
}

function route(user, profile) {
  if (profile.role === 'coach') return showCoach(user, profile);
  return showTraining(user, profile);
}

function showCoach(user, profile) {
  clearScreen();
  const view = mountCoach(app, {
    user,
    profile,
    onAccount: (p) => openAccount(accountOpts(user, p || profile)),
    onMyTraining: (p) => showTraining(user, p, { asCoach: true }),
  });
  current = { unmount: () => view.unmount() };
}

async function showTraining(user, profile, opts = {}) {
  const gen = generation;
  const uid = user.id;
  const retry = () => (opts.asCoach ? showCoach(user, profile) : enter(user));
  if (!profile.program_id) {
    return showMessage({
      title: 'No program yet',
      text: 'Your coach hasn’t given you a program yet. It shows up here as soon as they do.',
      retry,
      user,
      profile,
    });
  }
  const pid = profile.program_id;
  const cachedRow = cacheGet(keys.program(uid, pid));
  let row = cachedRow;
  if (!row) {
    showLoading();
    const fresh = await getProgram(pid);
    if (gen !== generation) return;
    if (!fresh.data) {
      return showMessage({
        title: fresh.error ? 'Can’t connect' : 'Program not found',
        text: esc(fresh.error || 'Ask your coach to check which program you’re on.'),
        retry,
        user,
        profile,
      });
    }
    row = fresh.data;
    cacheSet(keys.program(uid, pid), row);
  }

  let program = null;
  const setProgram = (r) => {
    const checked = checkProgram(r.data);
    if (!checked.ok) {
      showMessage({ title: 'This program needs a fix', text: 'Your coach needs to fix it in the coach screen: ' + esc(checked.errors[0]), retry, user, profile });
      return false;
    }
    program = checked.program;
    return true;
  };
  if (!setProgram(row)) return;

  clearScreen();
  let view = null;
  let lastStatus = null;
  const statusText = {
    synced: () => ['Saved · synced ' + hhmm(), true],
    local: () => ['Saved on this phone · syncing…', false],
    offline: () => ['Saved on this phone · syncs when you’re back online', false],
    cached: () => ['Offline · showing the copy on this phone', false],
    nolocal: () => ['Phone storage is full or blocked · syncing…', false],
  };
  const onStatus = (s) => {
    lastStatus = s;
    if (view && statusText[s]) view.setStatus(...statusText[s]());
  };
  const actions = opts.asCoach
    ? [{ label: '← Coach', title: 'Back to the coach screen', onClick: () => showCoach(user, profile) }]
    : [{ label: initials(profile, user), title: 'Account', onClick: () => openAccount(accountOpts(user, profile)) }];

  const sync = createLogSync({ uid, programId: pid, onRemote: (data) => mount(data), onStatus });

  function mount(data) {
    const y = window.scrollY;
    if (view) view.unmount();
    const state = restoreState(program, data);
    view = mountWorkout(app, { program, state, onChange: (s) => sync.save(s), actions });
    window.scrollTo(0, y);
    if (lastStatus) onStatus(lastStatus);
    else view.setStatus(data ? 'Your log is loaded.' : 'Ready. Everything you type saves by itself.', !!data);
  }

  // Coming back to the app: pick up program edits or a new program from the coach.
  let lastCheck = Date.now();
  async function checkForUpdates(force) {
    if (!force && Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    const p = await getProfile(uid);
    if (gen !== generation || !current || current.sync !== sync) return;
    if (p.data && p.data.program_id !== profile.program_id && !opts.asCoach) {
      cacheSet(keys.profile(uid), p.data);
      showTraining(user, p.data, opts).then(() => toast('Your coach gave you a new program.'));
      return;
    }
    const g = await getProgram(pid);
    if (gen !== generation || !current || current.sync !== sync || !g.data) return;
    if (g.data.updated_at !== row.updated_at) {
      row = g.data;
      cacheSet(keys.program(uid, pid), row);
      if (setProgram(row)) mount(sync.local());
    }
  }
  const onVisible = () => { if (document.visibilityState === 'visible') checkForUpdates(false); };
  document.addEventListener('visibilitychange', onVisible);

  mount(sync.local());
  current = {
    sync,
    flush: () => sync.flush(),
    isDirty: () => sync.isDirty(),
    unmount() {
      document.removeEventListener('visibilitychange', onVisible);
      sync.flush();
      sync.stop();
      if (view) view.unmount();
    },
  };
  sync.pull();
  if (cachedRow) checkForUpdates(true);
}

// ---------- start ----------
async function boot() {
  document.title = APP_NAME;
  applyTheme();
  if (NEEDS_SETUP) return showSetupNeeded();

  supabase.auth.onAuthStateChange((event) => {
    // Signed out somewhere else (e.g. the coach removed this account): back to sign-in.
    if (event === 'SIGNED_OUT') setTimeout(() => { if (!document.querySelector('.auth')) loginScreen(); }, 0);
  });

  // Read the saved sign-in first, so the app opens instantly even with no signal.
  const stored = storedSession();
  if (stored && stored.user && stored.refresh_token && cacheGet(keys.profile(stored.user.id))) {
    enter(stored.user);
    // Let Supabase refresh the sign-in in the background (it retries once there's signal).
    supabase.auth.getSession().catch(() => {});
    return;
  }

  let user = null;
  let failed = false;
  try {
    const { data, error } = await supabase.auth.getSession();
    user = data && data.session ? data.session.user : null;
    failed = !!error;
  } catch { failed = true; }
  if (!user && failed && stored && stored.user && stored.refresh_token) user = stored.user;
  if (user) enter(user);
  else loginScreen();
}

function storedSession() {
  try { return JSON.parse(localStorage.getItem('coachapp-auth') || 'null'); } catch { return null; }
}

boot();
