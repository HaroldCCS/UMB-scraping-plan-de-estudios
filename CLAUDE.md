# CLAUDE.md — Objetivos de inscripción automática (AulaNet UMB)

> Objetivos marcados por Harold (2026-07-14) para la iteración actual del bot de inscripción.
> Contexto general del proyecto en `PROGRESO.md`.

## Objetivo urgente

Inscribir estas 3 materias (identificadas por CÓDIGO):

| Código | Asignatura |
|---|---|
| `500PM62-062` | MÉTODOS NUMÉRICOS |
| `500603-051` | MATEMÁTICAS ESPECIALES |
| `090503-151` | INFRAESTRUCTURA TECNOLÓGICA II |

## Cómo funciona el sistema (AulaNet)

- **Tabla de arriba** (`#asignaturas #Layer1`): materias NO inscritas. Las filas **en amarillo**
  (checkbox marcado) ya están inscritas y NO deben tocarse.
- **Tabla de abajo** (`#asignaturas_seleccionadas #Layer3`): materias ya inscritas, con columnas
  Sem, **Grupo**, Código, Asignatura, Estado, Ofrecida, Créd, Acción (lápiz = editar, X = eliminar).
- Al hacer clic en una materia de arriba se abre el modal **"Grupos/Horarios, Materia seleccionada"**
  con filas: radio | Carrera | Grupo (A1, A2, C1…) | Cupo, y botones **Aceptar** / **Cancelar**.

## Reglas de inscripción (fase 1)

Para cada materia objetivo que NO esté ya inscrita (no amarilla / no en la tabla de abajo):

1. Abrir su modal de grupos y leer los cupos.
2. **Preferencia de grupo:** si hay algún grupo `C#` con cupo > 0 → tomarlo.
   Si no, tomar cualquier `A#` con cupo > 0.
3. Si ningún grupo tiene cupo → **Cancelar** y pasar a la siguiente materia.
4. **Bucle continuo:** si tras la pasada quedan materias sin inscribir, esperar el intervalo
   configurado, recargar/re-navegar y volver a intentar hasta inscribir las 3 (los cupos se
   liberan en cualquier momento).

## Aviso sonoro

Cuando las 3 materias estén inscritas → **reproducir un sonido 5 veces** (macOS `afplay`,
con campana de terminal como respaldo).

## Verificación de jornada NOCTURNA (fase 2 — corre en CADA ciclo)

La letra del grupo importa: **C = NOCTURNO** (requerido). En cada ciclo, para lo que ya esté
inscrito (sin esperar a tener las 3):

1. Revisar en la tabla de abajo la columna **Grupo** de las materias objetivo inscritas.
2. Si alguna NO está en `C#` → clic en el **lápiz** (editar) de esa fila; el modal es el mismo
   de inscribir.
3. Si hay grupo `C#` con cupo > 0 → migrarla. Si no → **Cancelar** y continuar con la siguiente.
4. El bucle solo termina cuando las 3 estén **inscritas Y en grupo C**; imprime el estado en
   cada ciclo.

Nota (2026-07-14): la detección de fila "amarilla" valida amarillo real (#FFFF00/yellow) o
checkbox marcado — el blanco #FFFFFF daba falso positivo y saltaba materias sin inscribir.

## Decisiones acordadas

- Identificación de materias **por código** (configurable en `TARGET_SUBJECTS`).
- Reintentos en **bucle continuo** con recarga entre ciclos.
- Al terminar, **dejar el navegador abierto** (no `browser.close()`); el script imprime el resumen.
- Si un selector del modal no coincide, el bot guarda el HTML en `files/debug_*.html` para ajustar.
