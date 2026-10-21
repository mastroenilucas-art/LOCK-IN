// Account sheet: theme, change password, sign out, delete account.
import { HELP_EMAIL } from './config.js';
import { supabase, friendly, manage } from './supa.js';
import { sheet, confirmDialog, toast, esc } from './ui.js';
import { currentTheme, toggleTheme } from './theme.js';

export function openAccount({ user, profile, onSignOut, onDeleted }) {
  const isCoach = profile && profile.role === 'coach';
  const name = (profile && profile.full_name) || '';
  sheet({
    title: 'Account',
    html: `
      <div class="acct">
        ${name ? `<p class="acct-name">${esc(name)}</p>` : ''}
        <p class="dim">${esc(user.email || '')}${isCoach ? ' · coach' : ''}</p>
      </div>
      <div class="stack">
        <button type="button" class="ghost wide" data-act="theme">${currentTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}</button>
        <details class="fold">
          <summary>Change password</summary>
          <form data-form="pw" novalidate>
            <label class="field"><span>New password</span><input type="password" name="pw" autocomplete="new-password" minlength="8" required></label>
            <label class="field"><span>Type it again</span><input type="password" name="pw2" autocomplete="new-password" minlength="8" required></label>
            <p class="err" hidden></p>
            <button type="submit" class="primary">Save new password</button>
          </form>
        </details>
        <button type="button" class="ghost wide" data-act="signout">Sign out</button>
        ${isCoach ? '' : '<button type="button" class="danger-link" data-act="delete">Delete my account</button>'}
      </div>
      ${HELP_EMAIL ? `<p class="small">Help: <a href="mailto:${esc(HELP_EMAIL)}">${esc(HELP_EMAIL)}</a></p>` : ''}
      <p class="small dim">Version ${esc(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '')}</p>`,
    onMount(body, close) {
      body.querySelector('[data-act="theme"]').addEventListener('click', (e) => {
        const t = toggleTheme();
        e.currentTarget.textContent = t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      });
      body.querySelector('[data-act="signout"]').addEventListener('click', () => { close(); onSignOut(); });

      const form = body.querySelector('[data-form="pw"]');
      const err = form.querySelector('.err');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        err.hidden = true;
        const pw = form.pw.value;
        if (pw.length < 8) { err.textContent = 'Use at least 8 characters.'; err.hidden = false; return; }
        if (pw !== form.pw2.value) { err.textContent = 'The two passwords don’t match.'; err.hidden = false; return; }
        const btn = form.querySelector('button');
        btn.disabled = true;
        const { error } = await supabase.auth.updateUser({ password: pw });
        btn.disabled = false;
        if (error) { err.textContent = friendly(error); err.hidden = false; return; }
        form.reset();
        form.closest('details').open = false;
        toast('Password changed.');
      });

      const del = body.querySelector('[data-act="delete"]');
      if (del) {
        del.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: 'Delete your account?',
            text: 'This deletes your login and your whole training log for good. Your coach won’t be able to see it any more. This can’t be undone.',
            confirm: 'Delete forever',
            danger: true,
            typeWord: 'DELETE',
          });
          if (!ok) return;
          const { error } = await manage('delete_self');
          if (error) { toast(error, false); return; }
          close();
          onDeleted();
        });
      }
    },
  });
}
