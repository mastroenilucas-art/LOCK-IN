// Supabase Edge Function: manage-clients
// Lets the coach create, reset and remove client logins from inside the app,
// and lets any client delete their own account (an App Store requirement).
// Deploy it from Supabase → Edge Functions → Deploy a new function → Via Editor,
// name it exactly: manage-clients
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Admin key: the new "secret" key if the project has one, otherwise the legacy service_role key.
function adminKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const keys = JSON.parse(raw);
      const k = keys.default ?? Object.values(keys)[0];
      if (typeof k === 'string' && k) return k;
    } catch { /* fall back */ }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  throw new Error('No admin key available to this function.');
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, adminKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Who is calling? Check their sign-in token with Supabase Auth.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'Please sign in again.' }, 401);
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who?.user) return json({ error: 'Please sign in again.' }, 401);
    const caller = who.user;

    const { data: me } = await admin.from('profiles').select('role').eq('id', caller.id).maybeSingle();
    const isCoach = me?.role === 'coach';

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body */ }
    const action = String(body.action ?? '');

    // ----- any signed-in client: delete my own account -----
    if (action === 'delete_self') {
      if (isCoach) return json({ error: 'The coach account can’t delete itself from the app. Use the Supabase dashboard (Authentication → Users).' }, 400);
      const { error } = await admin.auth.admin.deleteUser(caller.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ----- everything below is coach-only -----
    if (!isCoach) return json({ error: 'Only the coach can do that.' }, 403);

    // Target must be an existing client (never another coach).
    async function targetClient(id: unknown) {
      if (typeof id !== 'string' || !id) return { error: 'Missing client.' };
      const { data: p } = await admin.from('profiles').select('id, role').eq('id', id).maybeSingle();
      if (!p) return { error: 'That client doesn’t exist any more.' };
      if (p.role === 'coach') return { error: 'That’s a coach account. Manage it in the Supabase dashboard.' };
      return { id: p.id as string };
    }

    if (action === 'create_client') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const fullName = String(body.full_name ?? '').trim().slice(0, 120);
      const programId = body.program_id ? String(body.program_id) : null;
      if (!EMAIL.test(email)) return json({ error: 'That email doesn’t look right.' }, 400);
      if (password.length < 8) return json({ error: 'The password needs at least 8 characters.' }, 400);

      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error) {
        const msg = /already|registered|exists/i.test(error.message) ? 'There’s already a login with that email.' : error.message;
        return json({ error: msg }, 400);
      }
      const id = created.user.id;
      // The database trigger made the profile; fill in name and program.
      const { error: upErr } = await admin.from('profiles')
        .upsert({ id, email, full_name: fullName || null, program_id: programId, role: 'client' }, { onConflict: 'id' });
      if (upErr) return json({ error: 'Login created, but saving the name/program failed: ' + upErr.message }, 400);
      return json({ ok: true, id });
    }

    if (action === 'reset_password') {
      const t = await targetClient(body.user_id);
      if (t.error) return json({ error: t.error }, 400);
      const password = String(body.password ?? '');
      if (password.length < 8) return json({ error: 'The password needs at least 8 characters.' }, 400);
      const { error } = await admin.auth.admin.updateUserById(t.id!, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'delete_client') {
      const t = await targetClient(body.user_id);
      if (t.error) return json({ error: t.error }, 400);
      const { error } = await admin.auth.admin.deleteUser(t.id!);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
