// Small UI helpers: bottom sheets, confirm dialogs, toasts.
import { esc } from './workout/engine.js';

export { esc };

export function sheet({ title, html, onMount, wide }) {
  const back = document.createElement('div');
  back.className = 'scrim';
  back.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><b>${esc(title)}</b><button type="button" class="ghost" data-close>Close</button></div>
      <div class="modal-body">${html}</div>
    </div>`;
  document.body.appendChild(back);
  document.body.classList.add('noscroll');
  const close = () => {
    back.remove();
    if (!document.querySelector('.scrim')) document.body.classList.remove('noscroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-close]')) close();
  });
  const body = back.querySelector('.modal-body');
  if (onMount) onMount(body, close);
  const first = body.querySelector('input, select, textarea');
  if (first && !('ontouchstart' in window)) first.focus();
  return close;
}

export function confirmDialog({ title, text, confirm = 'OK', danger = false, typeWord }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const close = sheet({
      title,
      html: `
        <p class="lead">${text}</p>
        ${typeWord ? `<label class="field"><span>Type <b>${esc(typeWord)}</b> to confirm</span><input type="text" autocomplete="off" autocapitalize="characters" data-type></label>` : ''}
        <div class="btnrow">
          <button type="button" class="ghost" data-no>Cancel</button>
          <button type="button" class="${danger ? 'danger' : 'primary'}" data-yes ${typeWord ? 'disabled' : ''}>${esc(confirm)}</button>
        </div>`,
      onMount(body, closeIt) {
        const yes = body.querySelector('[data-yes]');
        const typed = body.querySelector('[data-type]');
        if (typed) typed.addEventListener('input', () => { yes.disabled = typed.value.trim().toUpperCase() !== typeWord.toUpperCase(); });
        yes.addEventListener('click', () => { finish(true); closeIt(); });
        body.querySelector('[data-no]').addEventListener('click', () => { finish(false); closeIt(); });
      },
    });
    // If the sheet is closed another way, treat it as Cancel.
    const obs = new MutationObserver(() => {
      if (!document.querySelector('.scrim .modal[aria-label="' + CSS.escape(title) + '"]')) { finish(false); obs.disconnect(); }
    });
    obs.observe(document.body, { childList: true });
    void close;
  });
}

let toastTimer = null;
export function toast(msg, ok = true) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.toggle('bad', !ok);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

export function hideToast() {
  clearTimeout(toastTimer);
  const t = document.querySelector('.toast');
  if (t) t.classList.remove('show');
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  // Fallback for older browsers
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

export function timeAgo(iso) {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 1.5) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 14) return `${Math.round(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const hhmm = () => new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function randomPassword() {
  // Easy to read out loud: no 0/O or 1/l/I.
  const words = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  let s = '';
  for (let i = 0; i < 6; i++) s += words[arr[i] % words.length];
  s += '-';
  for (let i = 6; i < 10; i++) s += digits[arr[i] % digits.length];
  return s;
}
