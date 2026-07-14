const http = require("http");
const fs = require("fs");
const path = require("path");

/**
 * Servidor local que:
 *  - guarda en memoria el último estado del bot,
 *  - lo persiste en files/status.json,
 *  - sirve un mini-dashboard (símbolos) y el endpoint /status (JSON).
 *
 * Uso:
 *   const server = await startStatusServer();
 *   server.update({ ...status });   // en cada ciclo
 *   // abrir Chrome en server.url
 */
async function startStatusServer(port = 4599, dir = "files") {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const statusFile = path.join(dir, "status.json");

  let status = { state: "starting", cycle: 0, subjects: [], updatedAt: Date.now() };

  const server = http.createServer((req, res) => {
    if ((req.url || "").startsWith("/status")) {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(status));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(DASHBOARD_HTML);
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve({
        port,
        url: `http://127.0.0.1:${port}/`,
        statusFile,
        update(next) {
          status = { ...next, updatedAt: Date.now() };
          try { fs.writeFileSync(statusFile, JSON.stringify(status, null, 2)); } catch { /* no romper */ }
        },
        close() { try { server.close(); } catch {} },
      });
    });
  });
}

// Mini-dashboard: casi todo símbolos. Refresca cada 1s desde /status.
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Estado inscripción</title>
<style>
  :root{ --bg:#0b1220; --card:#131c31; --line:#243050; --muted:#5b6b8c;
         --green:#22c55e; --amber:#f59e0b; --red:#ef4444; --blue:#3b82f6; }
  *{ box-sizing:border-box; }
  html,body{ margin:0; height:100%; background:var(--bg); color:#e6ecf7;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  #wrap{ padding:14px; display:flex; flex-direction:column; gap:12px; height:100%; }
  #head{ display:flex; align-items:center; justify-content:space-between; }
  #state{ font-size:34px; line-height:1; }
  #cyc{ font-size:13px; color:var(--muted); font-variant-numeric:tabular-nums; }
  #beat{ width:10px; height:10px; border-radius:50%; background:var(--green);
    transition:opacity .3s; box-shadow:0 0 10px var(--green); }
  #beat.off{ opacity:.2; box-shadow:none; }
  .card{ background:var(--card); border:1px solid var(--line); border-radius:14px;
    padding:12px 14px; display:flex; align-items:center; gap:14px; }
  .sym{ font-size:30px; width:40px; text-align:center; line-height:1; }
  .meta{ display:flex; flex-direction:column; gap:3px; min-width:0; }
  .code{ font-size:15px; font-weight:600; letter-spacing:.3px; }
  .grp{ font-size:12px; color:var(--muted); }
  .grp b{ color:#e6ecf7; }
  #foot{ margin-top:auto; font-size:11px; color:var(--muted); text-align:center;
    font-variant-numeric:tabular-nums; }
  .g{ color:var(--green);} .a{ color:var(--amber);} .r{ color:var(--red);} .b{ color:var(--blue);}
  .spin{ display:inline-block; animation:sp 1.1s linear infinite; }
  @keyframes sp{ to{ transform:rotate(360deg);} }
  #stale{ color:var(--amber); }
</style></head>
<body><div id="wrap">
  <div id="head">
    <div id="state" class="b">…</div>
    <div style="display:flex;align-items:center;gap:8px">
      <span id="cyc">–</span><span id="beat"></span>
    </div>
  </div>
  <div id="cards"></div>
  <div id="foot">esperando datos…</div>
</div>
<script>
  const SYM = {
    done:      {c:'✓', cls:'g'},
    notC:      {c:'◐', cls:'a'},   // inscrita pero NO nocturna
    missing:   {c:'✕', cls:'r'},   // sin inscribir
  };
  function subjSym(s){
    if(!s.enrolled) return SYM.missing;
    if(s.nocturna)  return SYM.done;
    return SYM.notC;
  }
  function stateGlyph(st, done, allNight){
    if(done || (st==='done')) return {c:'✓', cls:'g'};
    if(st==='session-lost')   return {c:'⚠', cls:'r'};
    if(st==='restarting' || st==='starting') return {c:'<span class="spin">↻</span>', cls:'b'};
    return {c:'●', cls:'g'}; // running
  }
  let beatOn = true;
  async function tick(){
    let s;
    try{ s = await (await fetch('/status',{cache:'no-store'})).json(); }
    catch(e){ document.getElementById('foot').innerHTML='<span id="stale">sin conexión al bot</span>'; return; }

    const subjects = s.subjects || [];
    const g = stateGlyph(s.state, s.done, s.allNight);
    const stEl = document.getElementById('state');
    stEl.className = g.cls; stEl.innerHTML = g.c;
    document.getElementById('cyc').textContent = 'ciclo ' + (s.cycle||0);

    // heartbeat
    beatOn = !beatOn;
    document.getElementById('beat').classList.toggle('off', !beatOn);

    // tarjetas por materia
    const cards = subjects.map(function(su){
      const sy = subjSym(su);
      const grp = su.group ? ('<b>'+su.group+'</b>') : '—';
      const short = (su.code||'');
      return '<div class="card"><div class="sym '+sy.cls+'">'+sy.c+'</div>'
        + '<div class="meta"><div class="code">'+short+'</div>'
        + '<div class="grp">grupo '+grp+'</div></div></div>';
    }).join('');
    document.getElementById('cards').innerHTML = cards || '<div class="card"><div class="grp">sin materias aún…</div></div>';

    // pie: frescura + error
    const age = s.updatedAt ? Math.round((Date.now()-s.updatedAt)/1000) : null;
    let foot = '';
    if(s.done) foot = '¡completado! ✓';
    else if(s.state==='session-lost') foot = 'sesión caída · reiniciando';
    else if(s.state==='restarting'||s.state==='starting') foot = 'iniciando navegador…';
    else foot = 'actualizado hace ' + (age==null?'?':age) + 's';
    if(s.lastError) foot += ' · ⚠';
    const stale = age!=null && age>120;
    document.getElementById('foot').innerHTML = stale ? '<span id="stale">'+foot+' (¿bot detenido?)</span>' : foot;
  }
  tick(); setInterval(tick, 1000);
</script>
</body></html>`;

module.exports = startStatusServer;
