const fs = require("fs");
const saveFile = require("../utility/saveFile");


async function showAndProcessCalendarModule(page) {
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // await downloadAllCalendarPage(page);
  // await downloadOnlySubjectsSection(page);
  // await getNameSubjectsPending(page);
  // await getNameSubjectsSelected(page);
  await showHorarios(page);
}

/**
 * Funcion que descarga todo el contenido de la pagina
 * @param {*} page 
 * @return file html
 */
async function downloadAllCalendarPage(page) {
  const frame = page.frames().find((frame) => frame.name() === "mainFrame");
  const frameContent = await frame.content();
  saveFile("calendar.html", frameContent);
}



/**
 * Funcion que descarga solo la seccion de asignaturas que puede ver el estudiante el siguiente semestre
 * @param {*} page 
 * @return file html
 */
async function downloadOnlySubjectsSection(page) {
  const frame = page.frames().find((frame) => frame.name() === "mainFrame");
  await frame.waitForSelector("#asignaturas #Layer1");

  const divContent = await frame.$eval(
    "#asignaturas #Layer1",
    (div) => div.innerHTML
  );
  saveFile("divContent.html", divContent);
}


/**
 * Funcion que almacena las materias disponibles para el estudiante (solo los nombres)
 * @param {*} page 
 * @return file json
 */
async function getNameSubjectsPending(page) {
  const frame = page.frames().find((frame) => frame.name() === "mainFrame");
  await frame.waitForSelector("#asignaturas #Layer1");

  const data = await frame.$$eval("#asignaturas #Layer1 tr", (rows) => {
    return rows
      .map((row) => {
        const td = row.querySelector("td:nth-child(4)");
        return td ? td.innerText : null;
      })
      .filter((text) => text !== null);
  });

  saveFile("tdContent.json", JSON.stringify(data, null, 2));
}

/**
 * Listar las materias seleccionadas
 * @param {*} page 
 */
async function getNameSubjectsSelected(page) {
  const container = "#asignaturas_seleccionadas"
  const container2 = "#Layer3"

  const frame = page.frames().find((frame) => frame.name() === "mainFrame");
  await frame.waitForSelector(container + " " + container2);

  const data = await frame.$$eval(container + " " + container2 + " tr", (rows) => {
    return rows
      .map((row) => {
        const td = row.querySelector("td:nth-child(4)");
        return td ? td.innerText : null;
      })
      .filter((text) => text !== null);
  });

  saveFile("subjectsSelected.json", JSON.stringify(data, null, 2));
}

async function showHorarios(page) {
  const container = "#asignaturas_seleccionadas"
  const container2 = "#Layer3"

  const frame = page.frames().find((frame) => frame.name() === "mainFrame");
  await frame.waitForSelector(container + " " + container2);

  await frame.evaluate(() => {
    selecciona_materia(0, 0, 0, 1);
  });

  await new Promise((resolve) => setTimeout(resolve, 5000));

  //------------------------------------------------------------------------------
  {

    //leer el archivo subjectsSelected.json
    // const subjectsSelected = JSON.parse(fs.readFileSync("subjectsSelected.json", "utf8"));
    // console.log("subjectsSelected", subjectsSelected);
    const frame = page.frames().find((frame) => frame.name() === "mainFrame");

    const content = await frame.content()
      // const divContent = await frame.$eval(
      //   "#Layer3",
      //   (div) => div.innerHTML
      // );
      saveFile("contenido_materia_1.html", content);
  }
}

module.exports = showAndProcessCalendarModule;
