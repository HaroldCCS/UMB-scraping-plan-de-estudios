const puppeteer = require("puppeteer");

const {loginModule, leftFrameModule, getIntoRegistroAcademicoModule, showAndProcessCalendarModule} = require("./modules");

class Auto {
  _url = "https://aulanet.umb.edu.co/aulanet_jh/";
  _username = "";
  _password = "";

  constructor(username, password) {
    this._username = username;
    this._password = password;
  }

  async main() {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(this._url);

    //step 1
    await loginModule(this._username, this._password, page);

    //step 2
    await leftFrameModule(page);

    //step 3
    await getIntoRegistroAcademicoModule(page);

    //step 4
    await showAndProcessCalendarModule(page);

    await browser.close();
  }
}

//leer parametros de linea de comandos
const args = process.argv.slice(2);
const username = args[0];
const password = args[1];

const instance = new Auto(username, password);
instance
  .main()
  .then(() => {
    console.log("Flujo exitoso");
  })
  .catch((error) => {
    console.error("Error:", error);
  });
