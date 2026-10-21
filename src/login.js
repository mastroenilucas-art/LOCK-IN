// Sign-in screen. There is no "sign up": the coach creates every login.
import { APP_NAME, HELP_EMAIL } from './config.js';
import { supabase, friendly } from './supa.js';
import { esc } from './ui.js';

export function showLogin(root, { onSignedIn, message }) {
  root.innerHTML = `
    <div class="auth">
      <div class="card">
        <p class="eyebrow">${esc(APP_NAME)}</p>
        <h2>Sign in</h2>
        ${message ? `<p class="okmsg">${esc(message)}</p>` : ''}
        <form novalidate>
          <label class="field"><span>Email</span>
            <input type="email" name="email" autocomplete="username" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
          <label class="field"><span>Password</span>
            <input type="password" name="password" autocomplete="current-password" required></label>
          <p class="err" hidden></p>
          <button type="submit" class="primary wide">Sign in</button>
        </form>
        <p class="small">Your coach sets up your login. Forgot your password? Ask your coach to reset it${HELP_EMAIL ? `, or email <a href="mailto:${esc(HELP_EMAIL)}">${esc(HELP_EMAIL)}</a>` : ''}.</p>
      </div>
    </div>`;

  const form = root.querySelector('form');
  const errEl = root.querySelector('.err');
  const btn = form.querySelector('button');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value;
    errEl.hidden = true;
    if (!email || !password) {
      errEl.textContent = 'Enter your email and password.';
      errEl.hidden = false;
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onSignedIn(data.user);
    } catch (e) {
      errEl.textContent = friendly(e);
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });
}
