

// Función para obtener ver el sidebar de la izquierda y dar click en boton de "Registro Academico"
async function leftFrameModule(page) {
  const frame = page.frames().find((frame) => frame.name() === "leftFrame");

  page.on("dialog", async (dialog) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await dialog.accept();
  });

  // Buscar y hacer clic en el enlace dentro del frame
  if (frame) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await frame.waitForSelector('a[href^="notas/registro_academico.php"]');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await frame.click('a[href^="notas/registro_academico.php"]');
    await new Promise((resolve) => setTimeout(resolve, 2000));

  } else {
    console.error("Frame not found");
  }
}

module.exports = leftFrameModule;