// Copies of the profile, program and log kept on the phone, so the app opens
// and saves sets even with no signal in the gym. The server copy is the real one.
const PREFIX = 'coachapp:v1:';

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function cacheSet(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function cacheClearUser(uid) {
  try {
    const kill = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && k.includes(uid)) kill.push(k);
    }
    kill.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

export const keys = {
  profile: (uid) => `profile:${uid}`,
  program: (uid, programId) => `program:${uid}:${programId}`,
  log: (uid, programId) => `log:${uid}:${programId}`,
};
