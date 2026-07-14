const fs = require("fs");
const path = require("path");

/**
 * Redirige console.log / console.error a un archivo (además de la consola).
 * Devuelve { file, close }.
 */
function setupLogging(dir = "files") {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `log_${stamp}.txt`);
  const stream = fs.createWriteStream(file, { flags: "a" });

  const orig = {
    log: console.log.bind(console),
    error: console.error.bind(console),
  };
  const ts = () => new Date().toISOString();
  const fmt = (args) =>
    args.map((a) => (typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(" ");

  const write = (level, args) => {
    try { stream.write(`[${ts()}] ${level} ${fmt(args)}\n`); } catch { /* nunca romper por el log */ }
  };

  console.log = (...a) => { write("INFO", a); orig.log(...a); };
  console.error = (...a) => { write("ERR ", a); orig.error(...a); };

  console.log(`📝 Log de esta corrida: ${file}`);
  return {
    file,
    close: () => { try { stream.end(); } catch {} console.log = orig.log; console.error = orig.error; },
  };
}

module.exports = setupLogging;
