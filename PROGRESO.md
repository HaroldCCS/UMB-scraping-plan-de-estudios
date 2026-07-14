# PROGRESO — UMB Scraping / Inscripción de materias

> Bitácora del proyecto para retomar contexto entre sesiones. **Actualizar cada vez que hagamos algo.**
> Última actualización: 2026-07-14

## Objetivo
Automatizar con **Puppeteer** el ingreso a AulaNet UMB (`https://aulanet.umb.edu.co/aulanet_jh/`), navegar hasta Registro Académico y, eventualmente, **inscribir materias** del plan de estudios de forma automática.

## Cómo se ejecuta
```bash
node index.js <usuario> <clave>
```
- Usuario y clave se pasan como argumentos de línea de comandos (`process.argv`).
- Corre con `headless: false` (navegador visible) y viewport 1920x1080.
- Los archivos generados se guardan en la carpeta `files/` (ignorada por git, hay que crearla si no existe).

## Arquitectura
El flujo está dividido en módulos numerados que se ejecutan en orden desde `index.js` (clase `Auto.main()`):

| Paso | Módulo | Qué hace | Estado |
|------|--------|----------|--------|
| 1 | `1_login.module.js` | Rellena `#codigo` y `#clave`, hace click en Submit y espera navegación. Imprime título de página. | ✅ Funciona |
| 2 | `2_leftFrame.module.js` | Ubica el frame `leftFrame`, acepta diálogos automáticamente, y hace click en "Registro Académico" (`a[href^="notas/registro_academico.php"]`). Usa esperas fijas de 2s. | ✅ Funciona |
| 3 | `3_getIntoRegistroAcademico.module.js` | En el frame `mainFrame`, hace click en `a[href^="../matricula_umb/direcciona.php"]`. | ✅ Funciona |
| 4 | `4_showAndProcessCalendar.module.js` | Procesa la página de calendario/asignaturas. Contiene varias sub-funciones (ver abajo). | 🚧 En desarrollo |

`utility/saveFile.js` → helper que escribe contenido en `files/<nombre>`.

## Detalle del Paso 4 (módulo activo)
El módulo tiene varias funciones; en `showAndProcessCalendarModule` se elige cuál correr (las demás están comentadas):

- `downloadAllCalendarPage(page)` — guarda todo el HTML del `mainFrame` → `files/calendar.html`.
- `downloadOnlySubjectsSection(page)` — guarda solo `#asignaturas #Layer1` → `files/divContent.html`.
- `getNameSubjectsPending(page)` — extrae nombres de materias disponibles (columna 4 de cada `tr`) → `files/tdContent.json`.
- `getNameSubjectsSelected(page)` — extrae materias ya seleccionadas de `#asignaturas_seleccionadas #Layer3` → `files/subjectsSelected.json`.
- `showHorarios(page)` — **función actualmente activa.** Ejecuta en el frame la función JS del sitio `selecciona_materia(0,0,0,1)`, espera 5s y guarda el HTML resultante → `files/contenido_materia_1.html`. Es un experimento para entender cómo el sitio muestra los horarios de una materia.

## Selectores / funciones clave del sitio descubiertas
- Frames: `leftFrame` (menú lateral), `mainFrame` (contenido principal).
- Link menú: `a[href^="notas/registro_academico.php"]`.
- Link registro: `a[href^="../matricula_umb/direcciona.php"]`.
- Sección asignaturas disponibles: `#asignaturas #Layer1`.
- Sección asignaturas seleccionadas: `#asignaturas_seleccionadas #Layer3`.
- Función JS nativa del sitio: `selecciona_materia(a, b, c, d)` — usada para seleccionar/mostrar horario de una materia. **Faltan entender los parámetros.**

## Estado actual (dónde vamos)
- Login y navegación hasta Registro Académico: **completos y estables**.
- Extracción de listas de materias (disponibles y seleccionadas): **implementada**.
- Actualmente experimentando con `showHorarios` para entender la función `selecciona_materia` y cómo el sitio renderiza horarios al elegir una materia.

## Próximos pasos / pendientes
- [ ] Descifrar los 4 parámetros de `selecciona_materia(...)`.
- [ ] Parsear los horarios de cada materia desde el HTML capturado.
- [ ] Lógica para elegir materia + grupo/horario sin choques.
- [x] Automatizar el click final de **inscripción/matrícula** → módulo `5_enrollSubjects.module.js` (2026-07-14, ver `CLAUDE.md`).
- [ ] Reemplazar esperas fijas (`setTimeout 2s`) por `waitForSelector`/`waitForNavigation` donde sea posible.
- [x] Credenciales: siguen por CLI pero con validación y respaldo en env vars `UMB_USERNAME`/`UMB_PASSWORD`.

## Módulo 5 — Inscripción automática (2026-07-14)
- Objetivos y reglas en **`CLAUDE.md`**. Materias objetivo por código en `TARGET_SUBJECTS`.
- Fase 1: para cada objetivo no inscrito, clic en su checkbox de la tabla de pendientes →
  modal de grupos → elige `C#` con cupo, si no `A#` con cupo, si no Cancelar. Bucle continuo
  con re-navegación cada 45s hasta inscribir las 3.
- Alerta: 5 sonidos (`afplay`, respaldo campana) al tener las 3.
- Fase 2: si alguna quedó fuera de grupo `C` (nocturno), clic en el lápiz y migra solo si hay
  cupo en C; resumen final. El navegador queda ABIERTO al terminar.
- Selectores del modal descubiertos en runtime (radios visibles + botones por texto).
  Si algo no coincide, guarda `files/debug_*.html` para ajustar.
- `index.js` ahora ejecuta el módulo 5 en el paso 4 (el módulo 4 experimental sigue disponible).

## Fix 2026-07-14 — Editar clicaba la X (eliminaba la materia)
Síntoma: al migrar una materia fuera de grupo `C`, la Fase 2 daba clic en la **X** (eliminar) en vez del **lápiz**.
Causa: en `clickEditEnrolledSubject` se usaba `row.querySelector("td:last-child")`. La columna Acción son
**dos celdas separadas**: penúltima = lápiz (`<img src="edita.gif">`, `selecciona_materia(..,1)`), última = X
(`<img src="elimina.gif">`, `selecciona_materia(..,2)`). `td:last-child` caía en la X → borraba la materia.
Fix: la función ahora busca el `<a>` cuyo `img` es `edita.gif` (o href con 4º parámetro `1`) y excluye
`elimina.gif`/param `2`. Si no identifica el lápiz con certeza, **lanza error y NO hace clic** (evita borrados
accidentales) y vuelca los enlaces de la fila al log. Confirmado contra `files/debug_modal_sin_grupos_*.html`.

## Fix 2026-07-14 (2) — No daba "Aceptar" tras elegir el cupo
Síntoma: seleccionaba el grupo pero no confirmaba (no clicaba Aceptar).
Dos causas en el modal de grupos:
1. El botón de confirmar es `<input id="aceptagrupo" onclick="guardar_datos()">` y su **texto cambia**:
   "Aceptar" al inscribir, **"Editar"** al modificar. `clickModalButton` lo buscaba por el texto
   "aceptar" → no lo hallaba en Fase 2. Ahora se ubica por **id** `#aceptagrupo` (Cancelar = `#cancelagrupo`).
2. El botón arranca **`disabled`** y solo se habilita al ejecutar la función nativa `selecciona_grupo(N)`,
   que está en el `onclick` de la **fila** `<tr id="tdgruposopc_N">`, no del radio. El código hacía
   `radio.click()`, que marca el radio pero no dispara `selecciona_grupo` → botón seguía deshabilitado.
   Ahora `selectModalGroup` llama a `selecciona_grupo(N)` (N leído del id `gruposopc_N`) y verifica que
   `#aceptagrupo` quede habilitado (con un reintento) antes de confirmar.
Confirmado contra `files/debug_modal_sin_grupos_*.html` (líneas 140-210: radios `gruposopc_N`, botones).

## Notas técnicas
- Git: 2 commits. Último: `28574a1 test show horarios`.
- Dependencia única: `puppeteer ^22.13.0`.
- `.gitignore`: ignora `/node_modules` y `/files`.
- El sitio usa **frames clásicos** y funciones JS globales del lado del cliente — no es una SPA moderna.
