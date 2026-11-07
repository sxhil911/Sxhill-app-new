import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Sign in required' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
    if (callerError || !callerData.user) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

    const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: callerProfile, error: profileError } = await adminClient.from('profiles').select('role,approved').eq('id', callerData.user.id).single();
    if (profileError || callerProfile?.role !== 'admin' || callerProfile?.approved !== true) {
      return new Response(JSON.stringify({ error: 'Only an approved administrator can create accounts' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const full_name = String(body.full_name || '').trim();
    const role = String(body.role || 'teacher');
    if (!email || !full_name || password.length < 8 || !['teacher','student'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Provide a name, valid email, password of at least 8 characters and teacher/student role' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name }
    });
    if (createError || !created.user) throw createError || new Error('Could not create user');

    const { error: saveError } = await adminClient.from('profiles').upsert({
      id: created.user.id, full_name, role, approved: true
    }, { onConflict: 'id' });
    if (saveError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      throw saveError;
    }

    return new Response(JSON.stringify({ user_id: created.user.id, email, role, approved: true }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected server error' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});