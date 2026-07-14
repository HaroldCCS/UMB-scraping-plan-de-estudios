const puppeteer = require("puppeteer");

const {
  loginModule,
  leftFrameModule,
  getIntoRegistroAcademicoModule,
  enrollSubjectsModule,
} = require("./modules");
const setupLogging = require("./utility/logger");
const startStatusServer = require("./utility/statusServer");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Auto {
  _url = "https://aulanet.umb.edu.co/aulanet_jh/";
  _username = "";
  _password = "";

  // Reinicio ante crash / sesión caída
  _maxRestarts = 100;         // reintentos totales del navegador antes de rendirse
  _restartDelayMs = 5_000;    // espera antes de relanzar Chrome

  constructor(username, password) {
    this._username = username;
    this._password = password;
  }

  /** Un intento completo: abrir Chrome → login → navegar → inscribir (hasta terminar o crashear). */
  async _runOnce(statusServer) {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--window-size=1280,900", "--window-position=0,0"],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.goto(this._url, { waitUntil: "networkidle2" });

      // Paso 1-3: login y navegación hasta la pantalla de matrícula.
      await loginModule(this._username, this._password, page);
      await leftFrameModule(page);
      await getIntoRegistroAcademicoModule(page);

      // Paso 4: inscripción automática. Reporta estado al dashboard/log en cada ciclo.
      // Lanza FatalRestart si la sesión se cae → lo captura main() para reiniciar desde 0.
      await enrollSubjectsModule(page, {
        onStatus: (status) => statusServer.update(status),
      });

      // Éxito: dejamos el navegador principal ABIERTO (no browser.close()).
      return { done: true };
    } catch (error) {
      // Fallo fatal en este intento: cerrar Chrome para reiniciar limpio.
      console.error("  Cerrando Chrome para reiniciar limpio…");
      await browser.close().catch(() => {});
      throw error;
    }
  }

  /** Abre una segunda ventana de Chrome, pequeña, con el dashboard de estado. */
  async _openMonitor(url) {
    try {
      // --app abre una ventana mínima (sin barra de pestañas) directo en la URL.
      return await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [`--app=${url}`, "--window-size=340,470", "--window-position=1560,40"],
      });
    } catch (error) {
      console.error("  No se pudo abrir la ventana monitor:", error.message);
      return null;
    }
  }

  async main() {
    setupLogging("files"); // console.log/error → también a files/log_*.txt
    const statusServer = await startStatusServer(4599, "files");
    console.log(`📊 Dashboard de estado: ${statusServer.url}`);
    await this._openMonitor(statusServer.url);

    for (let attempt = 1; attempt <= this._maxRestarts; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`\n🔄 Reinicio #${attempt - 1}: abriendo Chrome desde cero…`);
          statusServer.update({ state: "restarting", cycle: 0, subjects: [] });
        }
        await this._runOnce(statusServer);
        console.log("\n✅ Flujo completo. Navegador principal y monitor quedan abiertos.");
        return; // terminado con éxito
      } catch (error) {
        console.error(`\n💥 Intento ${attempt} falló:`, error.message);
        statusServer.update({ state: "restarting", cycle: 0, subjects: [], lastError: error.message });
        if (attempt < this._maxRestarts) {
          console.log(`   Reintentando en ${this._restartDelayMs / 1000}s…`);
          await sleep(this._restartDelayMs);
        }
      }
    }

    console.error(`\n🛑 Se alcanzó el máximo de reinicios (${this._maxRestarts}). Deteniendo.`);
    statusServer.update({ state: "session-lost", cycle: 0, subjects: [], lastError: "Máx. reinicios" });
  }
}

// leer parametros de linea de comandos (con respaldo en variables de entorno)
const args = process.argv.slice(2);
const username = args[0] ?? process.env.UMB_USERNAME;
const password = args[1] ?? process.env.UMB_PASSWORD;

if (!username || !password) {
  console.error("Faltan las credenciales. Uso:");
  console.error("  node index.js <codigo_estudiantil> <contraseña>");
  console.error("o define las variables de entorno UMB_USERNAME y UMB_PASSWORD.");
  process.exit(1);
}

const instance = new Auto(username, password);
instance
  .main()
  .then(() => {
    console.log("Supervisor finalizado.");
  })
  .catch((error) => {
    console.error("Error no controlado en el supervisor:", error);
  });
