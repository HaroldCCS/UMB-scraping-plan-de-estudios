async function getIntoRegistroAcademico(page) {
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const frame = page.frames().find((frame) => frame.name() === "mainFrame");

  await frame.waitForSelector('a[href^="../matricula_umb/direcciona.php"]');
  await frame.click('a[href^="../matricula_umb/direcciona.php"]');

  await new Promise((resolve) => setTimeout(resolve, 2000));
}

module.exports = getIntoRegistroAcademico;
