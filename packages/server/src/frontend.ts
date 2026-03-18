export function getFrontendHtml(wsPort: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Penguverse Server</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #0a1628;
  color: #b8d4e3;
  font-family: 'Courier New', monospace;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 20px;
}
h1 { font-size: 22px; color: #7ec8e3; letter-spacing: 4px; text-transform: uppercase; }
.subtitle { font-size: 12px; color: #4a6a8a; }
.status { font-size: 13px; color: #4ade80; }
.agents { margin-top: 12px; }
.agent { display: flex; align-items: center; gap: 8px; margin: 6px 0; font-size: 12px; color: #8ab4d0; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.working { background: #4ade80; }
.dot.idle { background: #fbbf24; }
.dot.thinking { background: #c084fc; }
.dot.sleeping { background: #818cf8; }
.dot.error { background: #ef4444; }
.dot.speaking { background: #22d3ee; }
.dot.offline { background: #334155; }
.empty { font-size: 11px; color: #4a6a8a; }
.hint { max-width: 460px; text-align: center; font-size: 11px; color: #4a6a8a; line-height: 1.6; margin-top: 8px; }
.hint code {
  display: block;
  background: #0f1f35;
  border: 1px solid #1a3a5c;
  padding: 8px 12px;
  margin: 8px 0;
  border-radius: 4px;
  text-align: left;
  font-size: 10px;
  color: #7ec8e3;
}
a { color: #7ec8e3; text-decoration: none; }
a:hover { text-decoration: underline; }
.links { display: flex; gap: 16px; font-size: 11px; margin-top: 4px; }
</style>
</head>
<body>
<h1>Penguverse</h1>
<p class="subtitle">server running on port ${wsPort}</p>
<p class="status" id="status">&#9679;  online</p>
<div class="agents" id="agents"></div>
<div class="hint" id="hint">
  <p>No penguins connected yet. Send a heartbeat to bring one to life:</p>
  <code>curl -X POST http://localhost:${wsPort}/api/hooks/claude-code \\
  -H "Content-Type: application/json" \\
  -d '{"hook_event_name":"SessionStart","session_id":"test-123","cwd":"/my-project"}'</code>
</div>
<div class="links">
  <a href="/api/info">GET /api/info</a>
</div>

<script>
const agentsEl = document.getElementById('agents');
const hintEl = document.getElementById('hint');
const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(proto + '://' + location.host + '/ws');

ws.onmessage = (e) => {
  try {
    const msg = JSON.parse(e.data);
    if (msg.type === 'agents') render(msg.agents);
  } catch {}
};
ws.onclose = () => {
  document.getElementById('status').textContent = '\\u25cb  disconnected';
  document.getElementById('status').style.color = '#ef4444';
};

function render(agents) {
  if (agents.length === 0) {
    agentsEl.innerHTML = '';
    hintEl.style.display = '';
    return;
  }
  hintEl.style.display = 'none';
  agentsEl.innerHTML = agents.map(a =>
    '<div class="agent">' +
      '<span class="dot ' + a.state + '"></span>' +
      '<span>' + (a.name || a.agent) + '</span>' +
      '<span style="color:#4a6a8a">' + a.state + (a.task ? ' \\u00b7 ' + a.task : '') + '</span>' +
    '</div>'
  ).join('');
}
</script>
</body>
</html>`;
}
