import { Env, getSupabaseAdmin, verifyUserFromBearer } from './lib/supabaseAdmin';
import { sha256 } from './lib/hash';

type AssignmentRow = {
  id: string;
  status: 'assigned' | 'completed';
  player_id: string;
  players: { user_id: string } | null;
  tasks: { type: 'simple_confirm' | 'find_code' | 'mini_game'; code_hash: string | null } | null;
};

const ipAttempts = new Map<string, number[]>();

function corsHeaders(env: Env): HeadersInit {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type'
  };
}

function jsonResponse(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(env),
      'Content-Type': 'application/json'
    }
  });
}

async function loadAssignment(admin: ReturnType<typeof getSupabaseAdmin>, assignmentId: string) {
  const { data, error } = await admin
    .from('task_assignments')
    .select('id,status,player_id,players(user_id),tasks(type,code_hash)')
    .eq('id', assignmentId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as AssignmentRow;
}

function rateLimitIp(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - 60_000;
  const attempts = (ipAttempts.get(ip) ?? []).filter((at) => at > cutoff);
  attempts.push(now);
  ipAttempts.set(ip, attempts);
  return attempts.length <= 20;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    const user = await verifyUserFromBearer(request.headers.get('Authorization'), env);
    if (!user) {
      return jsonResponse({ error: 'unauthenticated' }, 401, env);
    }

    const origin = request.headers.get('Origin');
    if (origin !== env.ALLOWED_ORIGIN) {
      return jsonResponse({ error: 'forbidden origin' }, 403, env);
    }

    const admin = getSupabaseAdmin(env);
    const url = new URL(request.url);

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method not allowed' }, 405, env);
    }

    if (url.pathname.endsWith('/api/redeem-task')) {
      const { assignmentId } = (await request.json()) as { assignmentId?: string };
      if (!assignmentId) return jsonResponse({ error: 'assignmentId required' }, 400, env);

      const assignment = await loadAssignment(admin, assignmentId);
      if (!assignment || !assignment.players || !assignment.tasks) return jsonResponse({ error: 'not found' }, 404, env);
      if (assignment.players.user_id !== user.id) return jsonResponse({ error: 'not your assignment' }, 403, env);
      if (assignment.tasks.type !== 'simple_confirm' || assignment.status !== 'assigned') {
        return jsonResponse({ error: 'conflict' }, 409, env);
      }

      const { error } = await admin
        .from('task_assignments')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', assignmentId)
        .eq('status', 'assigned');

      if (error) return jsonResponse({ error: 'update failed' }, 500, env);
      return jsonResponse({ success: true }, 200, env);
    }

    if (url.pathname.endsWith('/api/verify-code')) {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      if (!rateLimitIp(ip)) {
        return jsonResponse({ error: 'too many requests' }, 429, env);
      }

      const { assignmentId, code } = (await request.json()) as { assignmentId?: string; code?: string };
      if (!assignmentId || typeof code !== 'string') {
        return jsonResponse({ error: 'assignmentId and code required' }, 400, env);
      }

      const assignment = await loadAssignment(admin, assignmentId);
      if (!assignment || !assignment.players || !assignment.tasks) return jsonResponse({ error: 'not found' }, 404, env);
      if (assignment.players.user_id !== user.id) return jsonResponse({ error: 'not your assignment' }, 403, env);
      if (assignment.status !== 'assigned' || assignment.tasks.type === 'simple_confirm') {
        return jsonResponse({ error: 'conflict' }, 409, env);
      }

      const cutoff = new Date(Date.now() - 60_000).toISOString();
      const { count } = await admin
        .from('task_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('task_assignment_id', assignmentId)
        .gte('submitted_at', cutoff);

      if ((count ?? 0) >= 5) {
        return jsonResponse({ error: 'too many attempts' }, 429, env);
      }

      const submittedHash = await sha256(code);
      const isCorrect = Boolean(assignment.tasks.code_hash && submittedHash === assignment.tasks.code_hash);

      await admin.from('task_submissions').insert({ task_assignment_id: assignmentId, is_correct: isCorrect });

      if (isCorrect) {
        await admin
          .from('task_assignments')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', assignmentId)
          .eq('status', 'assigned');

        return jsonResponse({ success: true }, 200, env);
      }

      return jsonResponse({ success: false }, 200, env);
    }

    return jsonResponse({ error: 'not found' }, 404, env);
  }
};
