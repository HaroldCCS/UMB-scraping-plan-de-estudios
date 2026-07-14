const { exec } = require("child_process");
const saveFile = require("../utility/saveFile");

/**
 * Módulo 5 — Inscripción automática de materias (ver CLAUDE.md).
 *
 * Fase 1: inscribe las materias objetivo (preferencia grupo C# > A#, con cupo > 0),
 *         en bucle continuo hasta tener las 3.
 * Aviso:  al tenerlas todas, suena 5 veces.
 * Fase 2: verifica que las 3 queden en grupo C (nocturno); si no, intenta migrarlas
 *         con el lápiz de editar (solo si hay cupo en C, si no Cancelar).
 */

// ── Configuración ────────────────────────────────────────────────────────────
const TARGET_SUBJECTS = [
  { code: "500PM62-062", name: "METODOS NUMERICOS" },
  { code: "500603-051", name: "MATEMATICAS ESPECIALES" },
  { code: "090503-151", name: "INFRAESTRUCTURA TECNOLOGICA II" },
];

const RETRY_INTERVAL_MS = 45_000; // espera entre ciclos cuando faltan cupos
const MODAL_TIMEOUT_MS = 15_000;  // espera máxima a que abra el modal de grupos
const STEP_PAUSE_MS = 2_000;      // pausa corta entre acciones (sitio viejo con frames)

const PENDING_TABLE = "#asignaturas #Layer1";
const SELECTED_TABLE = "#asignaturas_seleccionadas #Layer3";

// ── Utilidades básicas ───────────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getMainFrame(page) {
  const frame = page.frames().find((f) => f.name() === "mainFrame");
  if (!frame) throw new Error("No se encontró el frame 'mainFrame'");
  return frame;
}

function normalize(text) {
  return (text || "").replace(/\s+/g, " ").trim().toUpperCase();
}

/** Reproduce un sonido `times` veces (afplay en macOS; campana de terminal como respaldo). */
async function playAlertSound(times) {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => {
      exec("afplay /System/Library/Sounds/Glass.aiff", (error) => {
        if (error) process.stdout.write("\x07"); // campana de terminal
        resolve();
      });
    });
    await sleep(400);
  }
}

// ── Lectura de tablas ────────────────────────────────────────────────────────

/**
 * Materias ya inscritas (tabla de abajo): [{ code, group, rowIndex }].
 * Columnas: Sem | Grupo | Código | Asignatura | Estado | Ofrecida | Créd | Acción.
 */
async function getEnrolledSubjects(frame) {
  await frame.waitForSelector(SELECTED_TABLE, { timeout: MODAL_TIMEOUT_MS });
  return frame.$$eval(`${SELECTED_TABLE} tr`, (rows) =>
    rows
      .map((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll("td")).map((td) =>
          (td.innerText || "").replace(/\s+/g, " ").trim()
        );
        if (cells.length < 4) return null;
        return { sem: cells[0], group: cells[1], code: cells[2], name: cells[3], rowIndex };
      })
      .filter((r) => r && r.code && /\w+-\w+/.test(r.code))
  );
}

/**
 * Busca la fila de una materia en la tabla de arriba (pendientes) por código.
 * Devuelve { found, yellow, hasCheckbox } e información para depurar.
 */
async function findPendingSubject(frame, code) {
  await frame.waitForSelector(PENDING_TABLE, { timeout: MODAL_TIMEOUT_MS });
  return frame.evaluate(
    ({ tableSelector, code }) => {
      const rows = Array.from(document.querySelectorAll(`${tableSelector} tr`));
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("td")).map((td) =>
          (td.innerText || "").replace(/\s+/g, " ").trim()
        );
        if (!cells.some((c) => c === code)) continue;
        // Amarillo REAL solamente (#FFFF00 / yellow). Ojo: el blanco #FFFFFF también
        // contiene "ffff", por eso no se puede buscar "ffff" a secas.
        const colorSources = [
          row.getAttribute("bgcolor"),
          row.style.backgroundColor,
          ...Array.from(row.querySelectorAll("td")).map((td) => td.getAttribute("bgcolor")),
          ...Array.from(row.querySelectorAll("td")).map((td) => td.style.backgroundColor),
        ];
        const bg = colorSources.filter(Boolean).join(" ").toLowerCase();
        const yellowBg = bg.includes("yellow")
          || bg.includes("#ffff00") || bg.includes("#ff0")
          || bg.includes("255, 255, 0");
        const checkbox = row.querySelector('input[type="checkbox"]');
        return {
          found: true,
          yellow: yellowBg || (checkbox ? checkbox.checked : false),
          hasCheckbox: !!checkbox,
          cells,
        };
      }
      return { found: false };
    },
    { tableSelector: PENDING_TABLE, code }
  );
}

/** Hace clic en el checkbox de la fila de la materia (abre el modal de grupos). */
async function clickPendingSubject(frame, code) {
  const clicked = await frame.evaluate(
    ({ tableSelector, code }) => {
      const rows = Array.from(document.querySelectorAll(`${tableSelector} tr`));
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("td")).map((td) =>
          (td.innerText || "").replace(/\s+/g, " ").trim()
        );
        if (!cells.some((c) => c === code)) continue;
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox) {
          checkbox.click();
          return true;
        }
        row.click();
        return true;
      }
      return false;
    },
    { tableSelector: PENDING_TABLE, code }
  );
  if (!clicked) throw new Error(`No pude hacer clic en la materia ${code}`);
}

// ── Modal de grupos/horarios ─────────────────────────────────────────────────

/**
 * Espera a que el modal de grupos esté visible (aparecen radios) y devuelve el frame
 * donde vive el modal (normalmente el mainFrame, pero se buscan todos por si acaso).
 */
async function waitForGroupModal(page) {
  const deadline = Date.now() + MODAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        const hasVisibleRadios = await frame.evaluate(() => {
          const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
          return radios.some((r) => {
            const rect = r.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
        });
        if (hasVisibleRadios) return frame;
      } catch {
        // frame navegando o destruido: ignorar
      }
    }
    await sleep(500);
  }
  return null;
}

/**
 * Lee los grupos del modal: [{ index, group, cupo }].
 * Cada fila del modal es: radio | Carrera | Grupo | Cupo.
 */
async function readModalGroups(modalFrame) {
  return modalFrame.evaluate(() => {
    const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter((r) => {
      const rect = r.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return radios
      .map((radio, index) => {
        const row = radio.closest("tr");
        if (!row) return null;
        // Nº de opción del sitio: radio id="gruposopc_N" (o tr id="tdgruposopc_N").
        // Ese N es el que espera la función nativa selecciona_grupo(N).
        const m = (radio.id || "").match(/gruposopc_(\d+)/)
          || (row.id || "").match(/tdgruposopc_(\d+)/);
        const opt = m ? parseInt(m[1], 10) : null;
        const cells = Array.from(row.querySelectorAll("td")).map((td) =>
          (td.innerText || "").replace(/\s+/g, " ").trim()
        );
        // Última celda numérica = cupo; la anterior = grupo (A1, C1, ...)
        let cupo = null;
        let group = null;
        for (let i = cells.length - 1; i >= 0; i--) {
          if (cupo === null && /^\d+$/.test(cells[i])) {
            cupo = parseInt(cells[i], 10);
          } else if (cupo !== null && /^[A-Z]\d+$/i.test(cells[i])) {
            group = cells[i].toUpperCase();
            break;
          }
        }
        return group === null || cupo === null ? null : { index, opt, group, cupo };
      })
      .filter((g) => g !== null);
  });
}

/**
 * Selecciona un grupo del modal. Debe disparar la función nativa `selecciona_grupo(N)`
 * (está en el onclick de la FILA, no del radio) — solo así se habilita el botón de confirmar.
 * Marcar el radio a secas NO habilita el botón. Devuelve si el botón quedó habilitado.
 */
async function selectModalGroup(modalFrame, group) {
  return modalFrame.evaluate((opt) => {
    const radio = document.getElementById(`gruposopc_${opt}`);
    const row = document.getElementById(`tdgruposopc_${opt}`);
    if (radio) radio.checked = true;
    if (typeof selecciona_grupo === "function") {
      selecciona_grupo(opt);
    } else if (row && typeof row.onclick === "function") {
      row.onclick();
    } else if (radio) {
      radio.click();
    }
    const accept = document.getElementById("aceptagrupo");
    return { selected: !!(radio || row), acceptEnabled: accept ? !accept.disabled : false };
  }, group.opt);
}

/**
 * Clic en un botón del modal de grupos.
 *  - Confirmar → id fijo `#aceptagrupo` (onclick guardar_datos). OJO: su texto cambia
 *    ("Aceptar" al inscribir, "Editar" al modificar), por eso se ubica por id, no por texto.
 *    Además arranca deshabilitado hasta seleccionar un grupo.
 *  - Cancelar  → id fijo `#cancelagrupo`.
 */
async function clickModalButton(modalFrame, label) {
  const wantAccept = /acept|editar|guardar/i.test(label);
  const result = await modalFrame.evaluate((wantAccept) => {
    if (wantAccept) {
      const btn = document.getElementById("aceptagrupo");
      if (btn) {
        if (btn.disabled) return { ok: false, reason: "boton confirmar deshabilitado (grupo no seleccionado)" };
        btn.click();
        return { ok: true, used: "#aceptagrupo", value: btn.value };
      }
    } else {
      const btn = document.getElementById("cancelagrupo");
      if (btn) { btn.click(); return { ok: true, used: "#cancelagrupo" }; }
    }
    // Respaldo: por texto (incluye "Editar"/"Guardar" como sinónimos de confirmar).
    const words = wantAccept ? ["aceptar", "editar", "guardar"] : ["cancelar"];
    const matches = (el) => {
      const t = ((el.innerText || "") + " " + (el.value || "")).toLowerCase();
      return words.some((w) => t.includes(w));
    };
    const cand = Array.from(
      document.querySelectorAll('button, input[type="button"], input[type="submit"], a')
    ).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && matches(el) && !el.disabled;
    });
    if (cand.length > 0) { cand[0].click(); return { ok: true, used: "texto" }; }
    return { ok: false, reason: "no encontrado" };
  }, wantAccept);
  if (!result.ok) throw new Error(`No pude clicar "${label}" en el modal: ${result.reason}`);
  return result;
}

/** Guarda el HTML del frame para depurar cuando algo no coincide con lo esperado. */
async function dumpDebugHtml(frame, fileName) {
  try {
    const content = await frame.content();
    saveFile(fileName, content);
    console.log(`  [debug] HTML guardado en files/${fileName}`);
  } catch {
    /* sin drama: es solo diagnóstico */
  }
}

/**
 * Con el modal abierto: elige grupo según la preferencia y acepta, o cancela si no hay cupo.
 * @param {"C_THEN_A"|"ONLY_C"} preference
 * @returns {{ enrolled: boolean, group: string|null, reason: string }}
 */
async function resolveGroupModal(page, preference, subjectLabel) {
  const modalFrame = await waitForGroupModal(page);
  if (!modalFrame) {
    await dumpDebugHtml(getMainFrame(page), `debug_sin_modal_${Date.now()}.html`);
    return { enrolled: false, group: null, reason: "No se abrió el modal de grupos" };
  }

  await sleep(1_000); // dar tiempo a que el modal termine de pintar los cupos
  const groups = await readModalGroups(modalFrame);
  console.log(`  Grupos de ${subjectLabel}:`, groups.map((g) => `${g.group}(cupo ${g.cupo})`).join(", ") || "ninguno legible");

  if (groups.length === 0) {
    await dumpDebugHtml(modalFrame, `debug_modal_sin_grupos_${Date.now()}.html`);
  }

  const withQuota = groups.filter((g) => g.cupo > 0);
  const cGroup = withQuota.find((g) => g.group.startsWith("C"));
  const aGroup = withQuota.find((g) => g.group.startsWith("A"));
  const chosen = preference === "ONLY_C" ? cGroup : (cGroup || aGroup);

  if (!chosen) {
    await clickModalButton(modalFrame, "Cancelar");
    await sleep(STEP_PAUSE_MS);
    return { enrolled: false, group: null, reason: "Sin cupos en los grupos permitidos" };
  }

  const sel = await selectModalGroup(modalFrame, chosen);
  await sleep(700); // dar tiempo a que selecciona_grupo habilite el botón de confirmar
  if (!sel.acceptEnabled) {
    // Reintento: volver a disparar la selección por si el habilitado tardó.
    await selectModalGroup(modalFrame, chosen);
    await sleep(700);
  }
  const clickInfo = await clickModalButton(modalFrame, "Aceptar");
  console.log(`  Confirmado grupo ${chosen.group} (botón "${clickInfo.value || clickInfo.used}")`);
  // El sitio puede lanzar un dialog de confirmación: ya se acepta automáticamente
  // (page.on("dialog") registrado en el flujo de navegación).
  await sleep(STEP_PAUSE_MS + 2_000);
  return { enrolled: true, group: chosen.group, reason: "OK" };
}

// ── Navegación (recarga entre ciclos) ────────────────────────────────────────

/** Vuelve a entrar hasta la pantalla de matrícula (sin re-registrar listeners de dialog). */
async function renavigateToMatricula(page) {
  await page.reload({ waitUntil: "networkidle2" }).catch(() => {});
  await sleep(STEP_PAUSE_MS);

  const leftFrame = page.frames().find((f) => f.name() === "leftFrame");
  if (leftFrame) {
    await leftFrame.waitForSelector('a[href^="notas/registro_academico.php"]', { timeout: MODAL_TIMEOUT_MS });
    await leftFrame.click('a[href^="notas/registro_academico.php"]');
    await sleep(STEP_PAUSE_MS);
  }

  const mainFrame = getMainFrame(page);
  await mainFrame.waitForSelector('a[href^="../matricula_umb/direcciona.php"]', { timeout: MODAL_TIMEOUT_MS });
  await mainFrame.click('a[href^="../matricula_umb/direcciona.php"]');
  await sleep(STEP_PAUSE_MS + 1_000);
}

// ── Fases ────────────────────────────────────────────────────────────────────

/** Fase 1: intenta inscribir las materias objetivo que falten. Devuelve los códigos aún faltantes. */
async function enrollMissingSubjects(page) {
  const frame = getMainFrame(page);
  const enrolled = await getEnrolledSubjects(frame);
  const enrolledCodes = new Set(enrolled.map((e) => e.code));

  const missing = TARGET_SUBJECTS.filter((t) => !enrolledCodes.has(t.code));
  if (missing.length === 0) return [];

  for (const subject of missing) {
    console.log(`\n→ Intentando inscribir ${subject.name} (${subject.code})...`);
    const info = await findPendingSubject(frame, subject.code);

    if (!info.found) {
      console.log("  No aparece en la tabla de pendientes (¿ya inscrita o no ofertada?). Se omite.");
      continue;
    }
    if (info.yellow) {
      console.log("  La fila está en amarillo (ya seleccionada/inscrita). Se omite.");
      continue;
    }

    await clickPendingSubject(frame, subject.code);
    const result = await resolveGroupModal(page, "C_THEN_A", subject.name);
    console.log(result.enrolled
      ? `  ✅ Inscrita en grupo ${result.group}`
      : `  ✖ No inscrita: ${result.reason}`);
  }

  const after = await getEnrolledSubjects(getMainFrame(page));
  const afterCodes = new Set(after.map((e) => e.code));
  return TARGET_SUBJECTS.filter((t) => !afterCodes.has(t.code)).map((t) => t.code);
}

/**
 * Clic en el lápiz (EDITAR) de una materia inscrita, por código.
 *
 * ⚠️ La columna "Acción" tiene DOS celdas/enlaces separados, en este orden:
 *      lápiz → <a href="javascript:selecciona_materia(..,1)"><img src="edita.gif">   ← EDITAR
 *      X     → <a href="javascript:selecciona_materia(..,2)"><img src="elimina.gif"> ← ELIMINAR (¡NO tocar!)
 * El bug anterior usaba `td:last-child`, que es la celda de la X → borraba la materia.
 * Ahora se apunta explícitamente al enlace de `edita.gif` (4º parámetro = 1) y jamás a `elimina.gif`.
 */
async function clickEditEnrolledSubject(frame, code) {
  const result = await frame.evaluate(
    ({ tableSelector, code }) => {
      const rows = Array.from(document.querySelectorAll(`${tableSelector} tr`));
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("td")).map((td) =>
          (td.innerText || "").replace(/\s+/g, " ").trim()
        );
        if (!cells.some((c) => c === code)) continue;

        const describe = (a) => {
          const img = a.querySelector("img");
          const src = ((img && img.getAttribute("src")) || "").toLowerCase();
          const href = (a.getAttribute("href") || "").toLowerCase();
          return { src, href };
        };
        const isDelete = (a) => {
          const { src, href } = describe(a);
          return src.includes("elimina") || /,\s*2\s*\)/.test(href);
        };
        const isEdit = (a) => {
          const { src, href } = describe(a);
          return (src.includes("edita") || /,\s*1\s*\)/.test(href)) && !isDelete(a);
        };

        const anchors = Array.from(row.querySelectorAll("a"));
        const editAnchor = anchors.find(isEdit);
        if (editAnchor) {
          editAnchor.click();
          return { ok: true };
        }
        // No se pudo identificar con certeza el lápiz: NO se hace clic para evitar
        // borrar la materia por accidente. Se reporta lo que había en la fila.
        return {
          ok: false,
          reason: "no-edit-anchor",
          anchors: anchors.map(describe),
        };
      }
      return { ok: false, reason: "row-not-found" };
    },
    { tableSelector: SELECTED_TABLE, code }
  );

  if (!result.ok) {
    if (result.anchors) {
      console.log(`  [debug] enlaces de la fila ${code}:`, JSON.stringify(result.anchors));
    }
    throw new Error(`No pude hacer clic seguro en el lápiz de ${code} (${result.reason})`);
  }
}

/**
 * Fase 2: verifica que las materias objetivo estén en grupo C (nocturno);
 * si no, intenta migrarlas (solo acepta si hay cupo en C).
 */
async function ensureNightGroups(page) {
  const frame = getMainFrame(page);
  const enrolled = await getEnrolledSubjects(frame);

  for (const subject of TARGET_SUBJECTS) {
    const row = enrolled.find((e) => e.code === subject.code);
    if (!row) continue; // no debería pasar en esta fase

    if ((row.group || "").toUpperCase().startsWith("C")) {
      console.log(`✓ ${subject.name} ya está en grupo nocturno (${row.group}).`);
      continue;
    }

    console.log(`\n→ ${subject.name} está en grupo ${row.group} (NO nocturno). Intentando migrar a C...`);
    await clickEditEnrolledSubject(frame, subject.code);
    const result = await resolveGroupModal(page, "ONLY_C", subject.name);
    console.log(result.enrolled
      ? `  ✅ Migrada a grupo ${result.group}`
      : `  ✖ Sigue en ${row.group}: ${result.reason}`);
  }

  // Estado final
  const finalState = await getEnrolledSubjects(getMainFrame(page));
  return TARGET_SUBJECTS.map((subject) => {
    const row = finalState.find((e) => e.code === subject.code);
    return {
      code: subject.code,
      name: subject.name,
      group: row ? row.group : null,
      nocturna: row ? (row.group || "").toUpperCase().startsWith("C") : false,
    };
  });
}

// ── Orquestador ──────────────────────────────────────────────────────────────

async function enrollSubjectsModule(page) {
  console.log("\n══════ Inscripción automática (inscribir faltantes + migrar a grupo C) ══════");

  let cycle = 1;
  let soundPlayed = false;

  for (;;) {
    console.log(`\n── Ciclo ${cycle} ──`);
    let missing = [];
    let summary = [];

    try {
      // Fase 1 (cada ciclo): inscribir las materias objetivo que falten.
      missing = await enrollMissingSubjects(page);

      // Fase 2 (cada ciclo): lo que ya esté inscrito se intenta migrar a grupo C (nocturno),
      // sin esperar a que estén las 3 (los cupos de C también se liberan en cualquier momento).
      summary = await ensureNightGroups(page);
    } catch (error) {
      console.error("  Error en el ciclo:", error.message);
      try {
        await dumpDebugHtml(getMainFrame(page), `debug_ciclo_${cycle}_${Date.now()}.html`);
      } catch { /* diagnóstico opcional */ }
      missing = missing.length > 0 ? missing : TARGET_SUBJECTS.map((t) => t.code);
    }

    // Sonar 5 veces la PRIMERA vez que las 3 queden inscritas.
    if (missing.length === 0 && !soundPlayed) {
      console.log("\n🎉 ¡Las 3 materias objetivo están inscritas! Sonando alerta...");
      await playAlertSound(5);
      soundPlayed = true;
    }

    // Estado del ciclo
    console.log("\n── Estado ──");
    for (const s of summary) {
      const estado = s.group
        ? s.nocturna
          ? `grupo ${s.group} ✅ NOCTURNA`
          : `grupo ${s.group} ⚠️ inscrita pero NO nocturna`
        : "✖ sin inscribir";
      console.log(`  ${s.name} (${s.code}): ${estado}`);
    }

    const allEnrolled = missing.length === 0;
    const allNight = summary.length > 0 && summary.every((s) => s.nocturna);
    if (allEnrolled && allNight) {
      console.log("\n✅ Objetivo completo: las 3 materias inscritas y en grupo nocturno (C).");
      break;
    }

    const pendientes = [];
    if (!allEnrolled) pendientes.push(`inscribir: ${missing.join(", ")}`);
    const noNight = summary.filter((s) => s.group && !s.nocturna).map((s) => s.code);
    if (noNight.length > 0) pendientes.push(`migrar a C: ${noNight.join(", ")}`);
    console.log(`\nPendiente → ${pendientes.join(" | ")}`);
    console.log(`Reintentando en ${RETRY_INTERVAL_MS / 1000}s (los cupos pueden liberarse)... (Ctrl+C para detener)`);
    await sleep(RETRY_INTERVAL_MS);
    try {
      await renavigateToMatricula(page);
    } catch (error) {
      console.error("  Error re-navegando, se reintenta en el próximo ciclo:", error.message);
    }
    cycle++;
  }

  console.log("\nEl navegador queda ABIERTO para que verifiques. Cierra la ventana cuando termines.");
}

module.exports = enrollSubjectsModule;
