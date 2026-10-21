// Light / dark mode. Follows the phone unless the person picks one.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

const KEY = 'coachapp:theme';

function stored() {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : null; } catch { return null; }
}

export function currentTheme() {
  const a = document.documentElement.getAttribute('data-theme');
  if (a === 'dark' || a === 'light') return a;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function paintSystemBars() {
  if (!Capacitor.isNativePlatform()) return;
  const style = currentTheme() === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
  SystemBars.setStyle({ style }).catch(() => {});
}

export function applyTheme() {
  const t = stored();
  if (t) document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  paintSystemBars();
  if (window.matchMedia) {
    try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintSystemBars); } catch { /* old browsers */ }
  }
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
  paintSystemBars();
  return next;
}
