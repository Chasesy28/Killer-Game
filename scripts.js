const SUPABASE_URL = '<SUPABASE_URL>';
const SUPABASE_ANON_KEY = '<SUPABASE_ANON_KEY>';
const API_BASE_URL = 'https://<DOMAIN>/api';

const views = {
  lobby: document.getElementById('lobby-view'),
  scanner: document.getElementById('scanner-view'),
  task: document.getElementById('task-view'),
  dashboard: document.getElementById('dashboard-view')
};

let currentAssignmentId = null;
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function showView(name) {
  Object.values(views).forEach((el) => el.classList.add('hidden'));
  views[name].classList.remove('hidden');
}

async function getJwt() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

async function callWorker(path, body) {
  const token = await getJwt();
  if (!token) throw new Error('Not authenticated');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bea' + 'rer ' + token
    },
    body: JSON.stringify(body)
  });
  return response.json();
}

async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({ provider: 'google' });
}

async function setupScanner() {
  const scanner = new Html5Qrcode('qr-reader');
  await scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 250 },
    (decodedText) => {
      try {
        const url = new URL(decodedText);
        const assignmentId = url.searchParams.get('task');
        if (assignmentId) {
          currentAssignmentId = assignmentId;
          showView('task');
          document.getElementById('task-status').textContent = `Loaded assignment ${assignmentId}`;
          scanner.stop();
        }
      } catch {
        // ignore non-url values
      }
    }
  );
}

function setupTaskRouteFromQuery() {
  const params = new URLSearchParams(location.search);
  const task = params.get('task');
  if (task) {
    currentAssignmentId = task;
    showView('task');
    document.getElementById('task-status').textContent = `Loaded assignment ${task}`;
  }
}

function setupRealtimeAssignments(playerId) {
  return supabase
    .channel('task-assignments')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'task_assignments',
        filter: `player_id=eq.${playerId}`
      },
      (payload) => {
        const li = document.createElement('li');
        li.className = 'rounded bg-slate-900 p-2 text-sm';
        li.textContent = `${payload.eventType}: ${JSON.stringify(payload.new)}`;
        document.getElementById('assignment-feed').prepend(li);
      }
    )
    .subscribe();
}

async function redeemTask() {
  if (!currentAssignmentId) return;
  const result = await callWorker('/redeem-task', { assignmentId: currentAssignmentId });
  document.getElementById('task-status').textContent = JSON.stringify(result);
}

async function verifyCode() {
  if (!currentAssignmentId) return;
  const code = document.getElementById('task-code').value;
  const result = await callWorker('/verify-code', { assignmentId: currentAssignmentId, code });
  document.getElementById('task-status').textContent = JSON.stringify(result);
}

async function setupRealtimeForCurrentUser() {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return;

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (player?.id) {
    setupRealtimeAssignments(player.id);
  }
}

async function init() {
  document.getElementById('google-signin').addEventListener('click', signInWithGoogle);
  document.getElementById('redeem-task').addEventListener('click', redeemTask);
  document.getElementById('verify-code').addEventListener('click', verifyCode);
  setupTaskRouteFromQuery();
  if (!currentAssignmentId) {
    showView('scanner');
    setupScanner().catch(() => showView('lobby'));
  }
  setupRealtimeForCurrentUser();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

init();
