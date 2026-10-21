// Connection to Supabase (logins + database) and every query the app makes.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, NEEDS_SETUP } from './config.js';

export const supabase = NEEDS_SETUP
  ? null
  : createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'coachapp-auth',
    },
  });

// Wraps a query so every function returns { data, error } with a readable error message.
async function run(q) {
  try {
    const { data, error } = await q;
    if (error) return { data: null, error: friendly(error) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: friendly(e) };
  }
}

export function friendly(e) {
  const msg = (e && (e.message || e.error_description || e.error)) || String(e);
  const code = (e && e.code) || '';
  if (code === 'PGRST205' || code === '42P01' || /schema cache|relation .* does not exist/i.test(msg)) return 'The database isn’t set up yet. Run supabase/setup.sql in Supabase (setup guide, step 3.2).';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return 'No connection. Check your signal and try again.';
  if (/Invalid login credentials/i.test(msg)) return 'That email and password don’t match. Check them, or ask your coach to reset your password.';
  if (/row-level security|permission denied/i.test(msg)) return 'You don’t have permission to do that.';
  if (/JWT expired|invalid JWT|not authenticated/i.test(msg)) return 'Your sign-in expired. Sign out and sign in again.';
  return msg;
}

// ---------- everyone ----------
export const getProfile = (uid) => run(supabase.from('profiles').select('id, email, full_name, role, program_id').eq('id', uid).maybeSingle());
export const getProgram = (id) => run(supabase.from('programs').select('id, name, data, updated_at').eq('id', id).maybeSingle());
export const getLog = (uid, programId) => run(supabase.from('logs').select('data, updated_at').eq('user_id', uid).eq('program_id', programId).maybeSingle());
export const saveLog = (uid, programId, data) => run(
  supabase.from('logs')
    .upsert({ user_id: uid, program_id: programId, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id,program_id' })
    .select('updated_at')
    .single(),
);

// ---------- coach ----------
export const listProfiles = () => run(supabase.from('profiles').select('id, email, full_name, role, program_id, created_at').order('created_at', { ascending: true }));
export const listPrograms = () => run(supabase.from('programs').select('id, name, data, updated_at').order('name', { ascending: true }));
export const listLogs = () => run(supabase.from('logs').select('user_id, program_id, data, updated_at'));
export const updateProfile = (id, patch) => run(supabase.from('profiles').update(patch).eq('id', id).select('id').single());
export const createProgram = (name, data) => run(supabase.from('programs').insert({ name, data }).select('id, name, data, updated_at').single());
export const updateProgram = (id, patch) => run(supabase.from('programs').update(patch).eq('id', id).select('id, name, data, updated_at').single());
export const deleteProgram = (id) => run(supabase.from('programs').delete().eq('id', id).select('id'));

// Account actions that need admin rights run in the "manage-clients" Edge Function.
const FN_MISSING = 'The manage-clients function isn’t set up yet. See step 3.6 of the setup guide.';
const FN_JWT = 'The manage-clients function rejected your sign-in. In Supabase, switch off “Verify JWT with legacy secret” for it (setup guide, step 3.6), then sign out and back in.';
const FN_UNREACHABLE = 'Couldn’t reach the manage-clients function. Check your connection; if it keeps happening, check step 3.6 of the setup guide.';

export async function manage(action, payload = {}) {
  try {
    const { data, error } = await supabase.functions.invoke('manage-clients', { body: { action, ...payload } });
    if (!error) {
      if (data && data.error) return { data: null, error: data.error };
      return { data, error: null };
    }
    // An HTTP answer (FunctionsHttpError) carries the Response; a failed request doesn't.
    const res = error.context && typeof error.context.status === 'number' ? error.context : null;
    if (!res) return { data: null, error: navigator.onLine === false ? 'No connection. Check your signal and try again.' : FN_UNREACHABLE };
    let body = null;
    try { body = await res.clone().json(); } catch { body = null; }
    if (body && typeof body.error === 'string') return { data: null, error: body.error }; // the function's own message
    if (res.status === 404) return { data: null, error: FN_MISSING };
    if (res.status === 401) return { data: null, error: FN_JWT };
    return { data: null, error: friendly({ message: (body && (body.message || body.msg)) || error.message }) };
  } catch (e) {
    return { data: null, error: friendly(e) };
  }
}
