const fs = require("fs");
const saveFile = require("../utility/saveFile");


async function showAndProcessCalendarModule(page) {
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // await downloadAllCalendarPage(page);
  // await downloadOnlySubjectsSection(page);
  await getNameSubjectsPending(page);
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

module.exports = showAndProcessCalendarModule;
