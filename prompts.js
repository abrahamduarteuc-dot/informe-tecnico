/* prompts.js
   Instrucciones para la IA. Es la ÚNICA fuente: la usan redactor.html y el informe.
   Para afinar el prompt, se cambia aquí y se vuelve a subir este archivo. */
(function (root) {
  "use strict";
/* ---- tipos de texto: grupo, regla específica, largo sugerido y ayuda ---- */
var TIPOS = {
  objetivo: { g: "Informe técnico", n: "Objetivo", max: 40,
    regla: "1 o 2 frases con verbo en infinitivo: qué se evalúa o desarrolla, sobre qué producto o sustrato y bajo qué condición. Si no se nombra la propiedad o el criterio, márcalo con [completar].",
    ayuda: "Qué quieres lograr, sobre qué producto y contra qué criterio." },
  antecedentes: { g: "Informe técnico", n: "Antecedentes", max: 70,
    regla: "Máximo 3 frases: qué se pidió o qué ocurrió (solicitud, reclamo o ensayo previo), producto o código, fecha o referencia. Sin resultados.",
    ayuda: "De dónde viene el trabajo y qué producto involucra." },
  desarrollo: { g: "Informe técnico", n: "Desarrollo", max: 200,
    regla: "Por ensayo o en orden cronológico: código – modificación – condición – resultado con valor y unidad. Sin conclusiones ni causas. Con 3 o más ensayos iguales, entrégalo como tabla solo con los datos disponibles, y \"No informado\" en las celdas vacías.",
    ayuda: "Pega tus apuntes con los valores medidos; no hace falta que estén redactados." },
  analisis: { g: "Informe técnico", n: "Análisis y discusión", max: 150,
    regla: "Compara solo resultados con igual método, unidad y condición, citando los valores. Separa tres cosas: hechos, limitaciones e \"Hipótesis no verificada:\".",
    ayuda: "Tus resultados y lo que observas al compararlos." },
  conclusiones: { g: "Informe técnico", n: "Conclusiones", max: 120,
    regla: "Lista numerada. Cada una nombra el producto o la muestra, la propiedad y el resultado con unidad. Solo hallazgos respaldados, decisiones y pendientes escritos. Sin relato del desarrollo, sin causas y sin acciones nuevas.",
    ayuda: "Pega los resultados y lo que concluyes." },
  cierre: { g: "Informe técnico", n: "Cierre de desarrollo", max: 120,
    regla: "Producto, código de granel, código de fórmula, resultados que respaldan el cierre, estado de validación y pendientes. Costo y margen solo si están escritos.",
    ayuda: "Producto desarrollado, códigos, resultados clave y qué queda pendiente." },
  visita: { g: "Visitas y pruebas", n: "Visita a cliente", max: 150,
    regla: "Un hecho por línea, con etiqueta: [Cliente informó] [Observado] [Medido] [Acuerdo]. Sin interpretaciones.",
    ayuda: "Lo que dijo el cliente y lo que se vio o midió en la visita." },
  industrial: { g: "Visitas y pruebas", n: "Prueba industrial", max: 150,
    regla: "Producto y lote – condiciones – ajustes – resultados observados – desviaciones – decisión – pendientes.",
    ayuda: "Cómo fue la prueba en planta y qué resultó." },
  acuerdos: { g: "Visitas y pruebas", n: "Acuerdos y compromisos", max: 100,
    regla: "Lista numerada con el formato acción – responsable – plazo. Si falta alguno, [completar].",
    ayuda: "Qué quedó comprometido, quién lo hace y para cuándo." },
  semanal: { g: "Seguimiento", n: "Entregable semanal", max: 120,
    regla: "Primera línea: Cumplido, Parcial o No cumplido. Si no fue total, motivos concretos y verificables. Luego qué se hizo y qué día, una línea por actividad.",
    ayuda: "El objetivo de la semana, si se cumplió y qué hiciste cada día." },
  motivos: { g: "Seguimiento", n: "Motivos", max: 80, oculto: true,
    regla: "Un motivo por línea, concreto y verificable: qué pasó, cuándo y con qué equipo, materia prima o muestra. Sin explicaciones generales; si falta el dato, [completar].",
    ayuda: "Por qué no se cumplió el objetivo." },
  trabajo: { g: "Seguimiento", n: "Trabajo realizado", max: 100, oculto: true,
    regla: "Una línea por actividad: día – qué se hizo (producto, código o ensayo). Sin valoraciones.",
    ayuda: "Qué se hizo y qué día." },
  ortografia: { g: "Otro", n: "Solo corregir ortografía", max: 0,
    regla: "", ayuda: "No cambia el contenido ni el estilo: solo ortografía, puntuación y concordancia." }
};

var EJEMPLO = 'Apuntes: "A: 25 s. B: 22 s. Ambas copa Ford N° 4, 20 °C. B es mejor. Buen brillo."\n' +
  'TEXTO: La muestra B presentó 22 s y la muestra A, 25 s (ambas en copa Ford N° 4, 20 °C); B registró el menor valor. Brillo: [completar: valor, método y ángulo de medición].\n' +
  'AVISOS: Se quitó "es mejor" (sin criterio) y "buen brillo" (sin dato).';

function armar(tipo, texto, max) {
  var t = TIPOS[tipo]; max = max || t.max; var cuerpo = texto && texto.trim() ? texto.trim() : "[PEGA AQUÍ TU TEXTO]";
  if (tipo === "ortografia") {
    return "Corrige la ortografía, la puntuación y la concordancia del texto que sigue, en español de Chile.\n" +
      "No cambies el contenido, el orden, el estilo ni las cifras, unidades o códigos.\n" +
      "Entrega solo el texto corregido, sin saludo ni explicación.\n\n" +
      'TEXTO:\n"""\n' + cuerpo + '\n"""';
  }
  return [
    "Actúa como editor técnico de un laboratorio de pinturas y recubrimientos. Corrige el texto que sigue para un informe técnico, usando solo lo que está escrito en él.",
    "",
    "REGLAS (si dos chocan, gana la de número menor)",
    "1. NO INVENTES. No agregues valores, unidades, métodos, fechas, lotes, especificaciones, causas, recomendaciones ni conocimiento general. Si falta un dato, déjalo marcado así: [completar: qué dato].",
    "2. DATOS, NO ADJETIVOS. \"Mejor\", \"bueno\", \"similar\", \"satisfactorio\", \"significativo\" y \"cumple\" solo se mantienen si el texto trae el dato que los sostiene (para \"cumple\": el resultado y el criterio de aceptación). Si no, quítalos y marca [completar: ...]. Puedes decir \"mayor\" o \"menor\" solo si ambos valores están escritos con el mismo método y condición; no calcules diferencias ni porcentajes.",
    "3. LO EXACTO NO SE TOCA. Cifras, unidades, códigos y nombres quedan tal cual, aunque parezcan inconsistentes; si lo parecen, avísalo en AVISOS.",
    "4. HECHO NO ES HIPÓTESIS. Lo que el texto plantea como posible (\"podría deberse a\") se conserva solo como \"Hipótesis no verificada:\", nunca dentro de resultados ni conclusiones. No subas ni bajes el nivel de certeza.",
    "5. BREVE Y DIRECTO. Frases cortas, voz impersonal, sin introducción ni repeticiones; cada oración aporta un dato, observación, decisión o pendiente. Máximo " + max + " palabras, pero nunca quites datos para cumplirlo. Español técnico de Chile.",
    "",
    "TIPO DE TEXTO: " + t.n.toUpperCase(),
    t.regla,
    "Si una parte corresponde a otra sección, déjala donde está y avísalo en AVISOS.",
    "",
    "ENTREGA SOLO ESTO, sin saludo ni explicación:",
    "TEXTO:",
    "<texto corregido>",
    "AVISOS: <solo si aplica: expresiones quitadas por falta de dato, frases incompletas, contenido de otra sección, códigos o nombres inconsistentes; si no hay, escribe \"Ninguno\">",
    "",
    "EJEMPLO",
    EJEMPLO,
    "",
    "TEXTO A CORREGIR:",
    '"""',
    cuerpo,
    '"""'
  ].join("\n");
}


  root.Prompts = { TIPOS: TIPOS, armar: armar, EJEMPLO: EJEMPLO };
})(typeof window !== "undefined" ? window : globalThis);
