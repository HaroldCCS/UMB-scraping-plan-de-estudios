

async function loginModule(username, password, page) {
  // Rellenar el formulario de login
  await page.type("#codigo", username);
  await page.type("#clave", password);

  // Hacer clic en el botón de login
  await page.click('input[name="Submit"]');

  // Esperar la navegación y que se cargue la página siguiente
  await page.waitForNavigation();

  // Comprobar que hemos iniciado sesión correctamente
  const pageTitle = await page.title();
  console.log("Logged in, page title:", pageTitle);
}

module.exports = loginModule;