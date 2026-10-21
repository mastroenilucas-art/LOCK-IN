// Keeps one training log in step between this phone and the server.
// Every tap saves on the phone right away; the server copy is updated a moment later,
// or as soon as there's signal again.
import { cacheGet, cacheSet, keys } from './cache.js';
import { getLog, saveLog } from './supa.js';

export function createLogSync({ uid, programId, onRemote: remoteCb, onStatus: statusCb }) {
  const key = keys.log(uid, programId);
  const onStatus = (s) => { if (!stopped) statusCb(s); };
  const onRemote = (d) => { if (!stopped) remoteCb(d); };
  // entry = { data, dirty, remoteAt }: dirty means "changed here, not on the server yet"
  let entry = cacheGet(key) || { data: null, dirty: false, remoteAt: null };
  let timer = null;
  let pushing = false;
  let stopped = false;

  const writeLocal = () => cacheSet(key, entry);
  const schedule = (ms) => { clearTimeout(timer); if (!stopped) timer = setTimeout(push, ms); };

  async function push() {
    if (!entry.dirty || pushing || stopped) return;
    pushing = true;
    const sent = JSON.stringify(entry.data);
    const { data, error } = await saveLog(uid, programId, entry.data);
    pushing = false;
    if (error) {
      onStatus('offline');
      schedule(15000);
      return;
    }
    if (JSON.stringify(entry.data) === sent) entry.dirty = false;
    entry.remoteAt = data.updated_at;
    writeLocal();
    if (entry.dirty) { onStatus('local'); schedule(400); } else onStatus('synced');
  }

  // Fetch the server copy and decide which one wins.
  async function pull() {
    const { data: row, error } = await getLog(uid, programId);
    if (error) { onStatus(entry.dirty ? 'offline' : 'cached'); if (entry.dirty) schedule(15000); return; }
    if (!row) {
      if (entry.data) { entry.dirty = true; writeLocal(); push(); } else onStatus('synced');
      return;
    }
    if (entry.dirty) {
      const localAt = (entry.data && entry.data.updatedAt) || 0;
      const remoteAt = (row.data && row.data.updatedAt) || 0;
      if (remoteAt > localAt) {
        // Edited more recently on another phone: take that one.
        entry = { data: row.data, dirty: false, remoteAt: row.updated_at };
        writeLocal();
        onRemote(row.data);
        onStatus('synced');
      } else push();
      return;
    }
    if (!entry.data || row.updated_at !== entry.remoteAt) {
      entry = { data: row.data, dirty: false, remoteAt: row.updated_at };
      writeLocal();
      onRemote(row.data);
    }
    onStatus('synced');
  }

  const onOnline = () => { if (entry.dirty) push(); };
  const onVisible = () => {
    if (document.visibilityState === 'hidden') { if (entry.dirty) { clearTimeout(timer); push(); } }
    else pull();
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);

  return {
    local: () => entry.data,
    save(data) {
      entry.data = data;
      entry.dirty = true;
      const ok = writeLocal();
      onStatus(ok ? 'local' : 'nolocal');
      schedule(1200);
    },
    pull,
    async flush() { clearTimeout(timer); if (entry.dirty) await push(); },
    isDirty: () => entry.dirty,
    stop() {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
