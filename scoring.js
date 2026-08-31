/**
 * MOTOR DE SCORING NÚTRETE®
 * Versión 1.0 — Agosto 2026
 * 
 * Arquitectura:
 * Respuesta → Valor normalizado (0–100) → Dimensión → Score → Diagnóstico → Prioridad
 * 
 * 3 capas:
 * 1. Score de brecha (estado actual del equipo)
 * 2. Score de interés (motivación declarada)
 * 3. Prioridad de intervención (brecha × interés × contexto organizacional)
 */

// ══════════════════════════════════════════════════════════
// CAPA 1: NORMALIZACIÓN
// Convierte cada respuesta a un valor 0–100
// ══════════════════════════════════════════════════════════

const Normalizar = {

  // Escala Likert 1–5 → 0–100 (directo)
  likert: (valor) => {
    if (!valor || isNaN(valor)) return null;
    return Math.round(((valor - 1) / 4) * 100);
  },

  // Escala Likert 1–5 → 0–100 (invertido: 5 es peor)
  likertInv: (valor) => {
    if (!valor || isNaN(valor)) return null;
    return Math.round(((5 - valor) / 4) * 100);
  },

  // Opción múltiple con mapa de valores clínicos
  opcion: (valor, mapa) => {
    if (!valor) return null;
    return mapa[valor] ?? null;
  },

  // Promedio de valores válidos en un array
  promedio: (arr) => {
    const validos = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
    if (!validos.length) return null;
    return Math.round(validos.reduce((a, b) => a + b, 0) / validos.length);
  },

  // Porcentaje de checkboxes seleccionados de una lista
  checkboxPct: (valores, items) => {
    if (!Array.isArray(valores) || !valores.length) return 0;
    return Math.round((valores.filter(v => items.includes(v)).length / items.length) * 100);
  }
};

// ══════════════════════════════════════════════════════════
// MAPAS DE VALORES CLÍNICOS
// Cada opción de texto tiene un valor clínico explícito
// ══════════════════════════════════════════════════════════

const Mapas = {

  horasSueno: {
    'Menos de 5 horas': 10,
    '5–6 horas': 35,
    '6–7 horas': 65,
    '7–8 horas': 95,
    'Más de 8 horas': 75
  },

  frutasVerduras: {
    'Todos los días': 100,
    '5–6 días a la semana': 85,
    '3–4 días a la semana': 65,
    '1–2 días a la semana': 30,
    'Casi nunca': 5
  },

  ultraprocesados: { // invertido: más frecuencia = peor
    'Todos los días': 5,
    '5–6 días a la semana': 20,
    '3–4 días a la semana': 50,
    '1–2 días a la semana': 78,
    'Casi nunca': 95
  },

  comidasTranquilas: {
    'Siempre': 100,
    'Frecuentemente': 78,
    'A veces': 52,
    'Rara vez': 22,
    'Nunca': 5
  },

  diasActividad: {
    '0 días': 5,
    '1–2 días': 30,
    '3–4 días': 72,
    '5–6 días': 95,
    '7 días': 88 // sobrentrenamiento leve
  },

  tiempoSedentario: { // invertido
    'Menos de 2 horas': 100,
    '2–4 horas': 80,
    '4–6 horas': 55,
    '6–8 horas': 25,
    'Más de 8 horas': 5,
    'No aplica a mi trabajo': 65
  },

  usoPlantas: {
    'Sí, frecuentemente': 90,
    'Sí, ocasionalmente': 70,
    'Lo he utilizado alguna vez': 50,
    'No': 35,
    'No sé suficiente sobre el tema': 25
  }
};

// ══════════════════════════════════════════════════════════
// CAPA 2: DIMENSIONES
// Cada dimensión agrupa preguntas por preguntas P05–P38
// Retorna score 0–100
// ══════════════════════════════════════════════════════════

const Dimensiones = {

  /**
   * IBP — BIENESTAR PERCIBIDO
   * Preguntas P05–P08
   */
  bienestarPercibido: (d) => {
    return Normalizar.promedio([
      Normalizar.likert(d.bienestar_general),       // P05
      Normalizar.likert(d.satisfaccion_vida),       // P06
      Normalizar.likert(d.herramientas_bienestar),  // P07
      Normalizar.likert(d.prioridad_bienestar),     // P08
    ]);
  },

  /**
   * IA — ALIMENTACIÓN
   * Preguntas P09–P14
   */
  alimentacion: (d) => {
    return Normalizar.promedio([
      Normalizar.likert(d.calidad_alimentacion),                        // P09
      Normalizar.opcion(d.frutas_verduras, Mapas.frutasVerduras),       // P10
      Normalizar.opcion(d.ultraprocesados, Mapas.ultraprocesados),      // P11 (invertido en mapa)
      Normalizar.likert(d.acceso_saludable),                            // P12
      Normalizar.likertInv(d.jornada_dificulta_alim),                   // P13 (invertido)
      Normalizar.opcion(d.comidas_tranquilas, Mapas.comidasTranquilas), // P14
    ]);
  },

  /**
   * IM — MOVIMIENTO
   * Preguntas P15–P18
   */
  movimiento: (d) => {
    return Normalizar.promedio([
      Normalizar.opcion(d.dias_actividad, Mapas.diasActividad),             // P15
      Normalizar.opcion(d.tiempo_sedentario, Mapas.tiempoSedentario),       // P16 (invertido en mapa)
      Normalizar.likert(d.pausas_movimiento),                               // P17
      Normalizar.likert(d.trabajo_facilita_actividad),                      // P18
    ]);
  },

  /**
   * IR — RECUPERACIÓN (Sueño)
   * Preguntas P19–P22
   */
  recuperacion: (d) => {
    return Normalizar.promedio([
      Normalizar.opcion(d.horas_sueno, Mapas.horasSueno),   // P19
      Normalizar.likert(d.calidad_sueno),                   // P20
      Normalizar.likert(d.descansado_amanecer),             // P21
      Normalizar.likertInv(d.trabajo_afecta_sueno),         // P22 (invertido)
    ]);
  },

  /**
   * IV — VITALIDAD (Energía)
   * Preguntas P23–P26
   */
  vitalidad: (d) => {
    // Momento de baja energía: score según impacto en productividad
    const momentoScore = Normalizar.opcion(d.momento_baja_energia, {
      'Al comenzar la jornada': 10,
      'Durante la mañana': 30,
      'Después del almuerzo': 55,
      'Durante la tarde': 45,
      'Al finalizar la jornada': 75,
      'No noto una disminución importante': 95
    });

    return Normalizar.promedio([
      Normalizar.likert(d.nivel_energia),         // P23
      Normalizar.likertInv(d.cansancio_jornada),  // P24 (invertido)
      momentoScore,                               // P25
      Normalizar.likert(d.habitos_energia),       // P26
    ]);
  },

  /**
   * IER — ESTRÉS Y RECURSOS
   * Preguntas P27–P30
   */
  estresRecursos: (d) => {
    return Normalizar.promedio([
      Normalizar.likertInv(d.carga_laboral),       // P27 (invertido)
      Normalizar.likertInv(d.desconexion_trabajo), // P28 (invertido)
      Normalizar.likert(d.herramientas_estres),    // P29
      Normalizar.likert(d.apoyo_laboral),          // P30
    ]);
  },

  /**
   * IES — ENTORNO SALUDABLE
   * Preguntas P32–P38
   */
  entornoSaludable: (d) => {
    return Normalizar.promedio([
      Normalizar.likert(d.ambiente_laboral),           // P32
      Normalizar.likert(d.opiniones_escuchadas),       // P33
      Normalizar.likert(d.respeto_laboral),            // P34
      Normalizar.likert(d.carga_adecuada),             // P35
      Normalizar.likert(d.autonomia_trabajo),          // P36
      Normalizar.likert(d.trabajo_facilita_habitos),   // P37
      Normalizar.likert(d.cultura_bienestar),          // P38
    ]);
  }
};

// ══════════════════════════════════════════════════════════
// ÍNDICE GLOBAL: IBIN
// Promedio ponderado de las 7 dimensiones
// ══════════════════════════════════════════════════════════

const PESOS_IBIN = {
  bienestarPercibido: 0.18,
  alimentacion:       0.16,
  movimiento:         0.14,
  recuperacion:       0.16,
  vitalidad:          0.14,
  estresRecursos:     0.12,
  entornoSaludable:   0.10
};

function calcularIBIN(scores) {
  let suma = 0;
  let pesoTotal = 0;
  for (const [dim, peso] of Object.entries(PESOS_IBIN)) {
    if (scores[dim] !== null && scores[dim] !== undefined) {
      suma += scores[dim] * peso;
      pesoTotal += peso;
    }
  }
  if (!pesoTotal) return null;
  return Math.round(suma / pesoTotal);
}

// ══════════════════════════════════════════════════════════
// CAPA 3: INTERÉS DECLARADO
// P40 (áreas a fortalecer) + P46 (temas prioritarios)
// Mapea interés a las 7 dimensiones
// ══════════════════════════════════════════════════════════

const MapaInteresDimensiones = {
  bienestarPercibido: ['autocuidado_fort', 'salud_mental_pr'],
  alimentacion:       ['alim_fort', 'alimentacion_pr', 'digestiva_pr', 'hidratacion_pr', 'digestiva'],
  movimiento:         ['actividad_fort', 'actividad_pr'],
  recuperacion:       ['sueno_fort', 'sueno_pr'],
  vitalidad:          ['energia_fort', 'energia_pr'],
  estresRecursos:     ['estres_fort', 'estres_pr', 'equilibrio_pr'],
  entornoSaludable:   ['cardiovascular_fort', 'cardiovascular_pr', 'cronicas_pr']
};

function calcularInteresDimension(datos, dimension) {
  const items = MapaInteresDimensiones[dimension] || [];
  const total = datos.length;
  if (!total || !items.length) return 0;

  let menciones = 0;
  datos.forEach(d => {
    const fortalecer = d.areas_fortalecer || [];
    const temas = d.temas_apoyo || [];
    const combinado = [...fortalecer, ...temas];
    if (items.some(item => combinado.includes(item))) menciones++;
  });

  return Math.round((menciones / total) * 100);
}

// ══════════════════════════════════════════════════════════
// PRIORIDAD DE INTERVENCIÓN
// Brecha × Interés → Nivel de prioridad
// ══════════════════════════════════════════════════════════

function calcularPrioridad(score, interes, contexto = null) {
  // score: 0–100 (0 = brecha máxima)
  // interes: 0–100 (% del equipo que lo señaló como prioritario)
  
  const brecha = score !== null ? (100 - score) : 0; // invertir: score bajo = brecha alta
  
  // Nivel de brecha
  const nivelBrecha = brecha >= 50 ? 'alta' : brecha >= 25 ? 'media' : 'baja';
  
  // Nivel de interés
  const nivelInteres = interes >= 50 ? 'alto' : interes >= 25 ? 'medio' : 'bajo';
  
  // Matriz de prioridad
  const matriz = {
    alta: { alto: 'CRÍTICA', medio: 'ALTA', bajo: 'ALTA' },
    media: { alto: 'ALTA', medio: 'MEDIA', bajo: 'MEDIA' },
    baja: { alto: 'MEDIA', medio: 'BAJA', bajo: 'BAJA' }
  };

  const nivel = matriz[nivelBrecha][nivelInteres];

  const colores = {
    CRÍTICA: { fondo: '#fdf0ee', color: '#c0392b', borde: '#f5c6c0' },
    ALTA:    { fondo: '#fff3e0', color: '#a05a00', borde: '#f5d89a' },
    MEDIA:   { fondo: '#fef9e7', color: '#7d6608', borde: '#f0d978' },
    BAJA:    { fondo: '#e8f5ee', color: '#07542F', borde: '#c8ebd5' }
  };

  return {
    nivel,
    nivelBrecha,
    nivelInteres,
    brecha,
    ...colores[nivel]
  };
}

// ══════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL: calcularScoringCompleto
// Recibe array de datos (JSON parseado de autopercepcion_salud)
// Retorna objeto completo con scores, interés y prioridades
// ══════════════════════════════════════════════════════════

function calcularScoringCompleto(datos) {
  const n = datos.length;
  if (!n) return null;

  // ── Calcular score por dimensión (promedio del grupo) ──
  const scoresPorPersona = datos.map(d => ({
    bienestarPercibido: Dimensiones.bienestarPercibido(d),
    alimentacion:       Dimensiones.alimentacion(d),
    movimiento:         Dimensiones.movimiento(d),
    recuperacion:       Dimensiones.recuperacion(d),
    vitalidad:          Dimensiones.vitalidad(d),
    estresRecursos:     Dimensiones.estresRecursos(d),
    entornoSaludable:   Dimensiones.entornoSaludable(d),
  }));

  const promediarDimension = (dim) => {
    const vals = scoresPorPersona.map(s => s[dim]).filter(v => v !== null);
    return vals.length ? Math.round(vals.reduce((a,b) => a+b, 0) / vals.length) : null;
  };

  const scores = {
    bienestarPercibido: promediarDimension('bienestarPercibido'),
    alimentacion:       promediarDimension('alimentacion'),
    movimiento:         promediarDimension('movimiento'),
    recuperacion:       promediarDimension('recuperacion'),
    vitalidad:          promediarDimension('vitalidad'),
    estresRecursos:     promediarDimension('estresRecursos'),
    entornoSaludable:   promediarDimension('entornoSaludable'),
  };

  // ── IBIN ──
  const ibin = calcularIBIN(scores);

  // ── Interés por dimensión ──
  const interes = {};
  for (const dim of Object.keys(scores)) {
    interes[dim] = calcularInteresDimension(datos, dim);
  }

  // ── Prioridad por dimensión ──
  const prioridades = {};
  for (const dim of Object.keys(scores)) {
    prioridades[dim] = calcularPrioridad(scores[dim], interes[dim]);
  }

  // ── Definición de dimensiones (metadatos) ──
  const meta = {
    bienestarPercibido: {
      nombre: 'Bienestar percibido',
      codigo: 'IBP',
      icono: '💚',
      preguntas: 'P05–P08',
      descripcion: 'Bienestar general, satisfacción de vida, herramientas y prioridad personal de cuidado.',
      recomendacion: {
        titulo: 'Programa de bienestar integral',
        desc: 'Talleres experienciales con microacciones autoelegidas. El Método Nútrete® desarrolla el criterio para la salud desde la autonomía del participante.'
      }
    },
    alimentacion: {
      nombre: 'Alimentación',
      codigo: 'IA',
      icono: '🥗',
      preguntas: 'P09–P14',
      descripcion: 'Calidad alimentaria, frutas y verduras, ultraprocesados, acceso en jornada y condiciones para comer.',
      recomendacion: {
        titulo: 'Taller de alimentación saludable en el trabajo',
        desc: 'Estrategias prácticas para mejorar la calidad alimentaria durante la jornada. Colaciones, hidratación y manejo del entorno alimentario.'
      }
    },
    movimiento: {
      nombre: 'Movimiento',
      codigo: 'IM',
      icono: '🏃',
      preguntas: 'P15–P18',
      descripcion: 'Frecuencia de actividad física, sedentarismo en jornada y facilidades del entorno.',
      recomendacion: {
        titulo: 'Programa de activación física y pausas activas',
        desc: 'Pausas activas estructuradas, orientación sobre actividad física accesible e intervención sobre el entorno para reducir el sedentarismo.'
      }
    },
    recuperacion: {
      nombre: 'Recuperación',
      codigo: 'IR',
      icono: '😴',
      preguntas: 'P19–P22',
      descripcion: 'Horas de sueño, calidad del sueño, sensación al despertar e impacto del trabajo en el descanso.',
      recomendacion: {
        titulo: 'Taller de sueño y recuperación',
        desc: 'Hábitos de sueño saludable, higiene del sueño, fitoterapia para el descanso (valeriana, pasiflora, lavanda) y aromaterapia nocturna.'
      }
    },
    vitalidad: {
      nombre: 'Vitalidad',
      codigo: 'IV',
      icono: '⚡',
      preguntas: 'P23–P26',
      descripcion: 'Nivel de energía en la jornada, frecuencia de cansancio, momento de baja energía y hábitos que la sostienen.',
      recomendacion: {
        titulo: 'Taller de energía y vitalidad laboral',
        desc: 'Alimentación para la energía, manejo del ritmo circadiano, estrategias para el bajón post-almuerzo y uso de plantas estimulantes suaves.'
      }
    },
    estresRecursos: {
      nombre: 'Estrés y recursos',
      codigo: 'IER',
      icono: '🧘',
      preguntas: 'P27–P30',
      descripcion: 'Carga laboral, dificultad para desconectarse, herramientas de manejo y apoyo disponible.',
      recomendacion: {
        titulo: 'Taller de manejo del estrés y autorregulación',
        desc: 'Técnicas de respiración, aromaterapia clínica para el estrés (lavanda, bergamota, ylang ylang) y fitoterapia adaptógena (ashwagandha, rhodiola).'
      }
    },
    entornoSaludable: {
      nombre: 'Entorno saludable',
      codigo: 'IES',
      icono: '🏢',
      preguntas: 'P32–P38',
      descripcion: 'Clima del equipo, respeto, autonomía, carga adecuada y cultura organizacional de bienestar.',
      recomendacion: {
        titulo: 'Diagnóstico y mejora del entorno laboral',
        desc: 'Análisis organizacional y propuestas concretas para facilitar el bienestar desde la estructura: pausas, acceso a agua, espacios y liderazgo saludable.'
      }
    }
  };

  // ── Texto diagnóstico por dimensión y nivel ──
  const textosDx = {
    bienestarPercibido: {
      verde:   'El equipo reporta un bienestar percibido positivo. Esta fortaleza debe sostenerse con programas que refuercen el criterio de autocuidado y la autonomía de cada persona.',
      amarillo:'El equipo muestra una percepción de bienestar moderada. Hay margen concreto para fortalecer la sensación de bienestar y las herramientas disponibles para el autocuidado cotidiano.',
      rojo:    'El equipo reporta un bienestar percibido bajo. Cuando las personas no se sienten bien en términos generales, los hábitos saludables se deterioran en cascada. Es el primer factor a intervenir.'
    },
    alimentacion: {
      verde:   'Los hábitos alimentarios del equipo son relativamente saludables y el entorno laboral facilita una alimentación adecuada. Esta fortaleza debe mantenerse.',
      amarillo:'Se detectan oportunidades de mejora en los hábitos alimentarios. El acceso limitado a opciones saludables durante la jornada o el consumo frecuente de ultraprocesados son los principales factores a intervenir.',
      rojo:    'Los hábitos alimentarios presentan brechas significativas. El consumo frecuente de ultraprocesados, el bajo consumo de frutas y verduras y las condiciones desfavorables de la jornada configuran un perfil de riesgo que requiere intervención directa.'
    },
    movimiento: {
      verde:   'El equipo mantiene niveles de actividad física adecuados y el sedentarismo durante la jornada está bajo control. El entorno laboral acompaña el movimiento.',
      amarillo:'Se detecta sedentarismo moderado y niveles de actividad física insuficientes. Sin intervención, esta tendencia puede consolidarse como factor de riesgo metabólico.',
      rojo:    'El equipo presenta altos niveles de sedentarismo y baja actividad física. Este es uno de los factores de riesgo más modificables con el mayor impacto potencial en la salud metabólica del equipo.'
    },
    recuperacion: {
      verde:   'El equipo reporta buena calidad de sueño y recuperación nocturna adecuada. El trabajo no interfiere significativamente con el descanso.',
      amarillo:'Se detectan señales de sueño no completamente reparador y cierta interferencia del trabajo en el descanso. La recuperación insuficiente impacta directamente en la energía, el estado emocional y los hábitos alimentarios.',
      rojo:    'El equipo presenta sueño insuficiente y de baja calidad. La privación crónica de sueño tiene consecuencias directas sobre el metabolismo, el estado emocional, la regulación del apetito y el rendimiento cognitivo. Requiere intervención prioritaria.'
    },
    vitalidad: {
      verde:   'El equipo mantiene buenos niveles de energía durante la jornada. Los hábitos actuales están sosteniendo la vitalidad del equipo.',
      amarillo:'Se detectan señales de fatiga moderada durante la jornada. La baja energía puede estar afectando el rendimiento, los hábitos saludables y la calidad del trabajo.',
      rojo:    'El equipo reporta niveles de energía bajos y cansancio frecuente durante la jornada. La fatiga crónica es uno de los factores que más impacta en la productividad y el bienestar percibido. Requiere intervención multidimensional (sueño, alimentación, estrés).'
    },
    estresRecursos: {
      verde:   'El equipo muestra una capacidad adecuada para manejar el estrés y cuenta con recursos personales y apoyo para enfrentar la carga de trabajo.',
      amarillo:'Se detectan señales de estrés moderado y dificultades parciales para desconectarse del trabajo. Esta dimensión merece atención preventiva antes de que el patrón se consolide.',
      rojo:    'El equipo reporta altos niveles de estrés laboral, dificultad para desconectarse y recursos insuficientes para manejar la carga. El estrés crónico amplifica el impacto de todas las otras brechas identificadas. Es un factor que debe priorizarse.'
    },
    entornoSaludable: {
      verde:   'El entorno laboral es percibido como positivo, con buen clima, respeto mutuo y condiciones que facilitan el bienestar. Este es un factor protector relevante.',
      amarillo:'El entorno laboral presenta áreas de mejora. Factores como la carga de trabajo, la autonomía o la cultura de bienestar pueden estar dificultando el desarrollo de hábitos saludables.',
      rojo:    'El entorno laboral presenta condiciones que dificultan el bienestar. Cuando el ambiente organizacional no acompaña, cualquier intervención individual tiene impacto limitado. Este es un factor estructural que debe abordarse desde la organización.'
    }
  };

  // ── Nivel de cada dimensión ──
  const nivel = (score) => {
    if (score === null) return 'sin_datos';
    if (score >= 75) return 'verde';
    if (score >= 50) return 'amarillo';
    return 'rojo';
  };

  // ── Construir resultado final ──
  const dimensionesResult = Object.keys(scores).map(dim => ({
    id: dim,
    ...meta[dim],
    score: scores[dim],
    nivel: nivel(scores[dim]),
    interes: interes[dim],
    prioridad: prioridades[dim],
    textoDx: textosDx[dim]?.[nivel(scores[dim])] || null,
  }));

  // ── Ordenar por prioridad de intervención ──
  const ordenPrioridad = { CRÍTICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
  const dimensionesOrdenadas = [...dimensionesResult].sort((a, b) =>
    (ordenPrioridad[a.prioridad.nivel] ?? 4) - (ordenPrioridad[b.prioridad.nivel] ?? 4)
  );

  // ── Top 3 intervenciones ──
  const topIntervenciones = dimensionesOrdenadas
    .filter(d => d.prioridad.nivel === 'CRÍTICA' || d.prioridad.nivel === 'ALTA')
    .slice(0, 3);

  return {
    n,
    ibin,
    nivelIBIN: nivel(ibin),
    scores,
    interes,
    prioridades,
    dimensiones: dimensionesResult,
    dimensionesOrdenadas,
    topIntervenciones,
    textoIBIN: {
      verde:   'El equipo de esta organización presenta un perfil de bienestar favorable. Los indicadores muestran fortalezas consolidadas y pocas brechas que requieren atención. El momento es ideal para un programa que consolide los hábitos positivos ya presentes y prevenga el deterioro futuro.',
      amarillo:'El equipo presenta un perfil de bienestar moderado con focos de atención concretos. Se identifican dimensiones que requieren intervención preventiva antes de que las brechas se consoliden. La buena noticia: el momento de intervención es el adecuado para lograr cambios sostenibles.',
      rojo:    'El diagnóstico revela un perfil con múltiples brechas que requieren intervención estructurada y sostenida. La combinación de factores identificados sugiere que las condiciones del entorno laboral, los hábitos y el nivel de desgaste están interactuando de forma negativa. Una intervención puntual tendrá impacto limitado: se necesita un programa de al menos 3 meses con seguimiento.',
    }[nivel(ibin)]
  };
}

// ══════════════════════════════════════════════════════════
// EXPORTAR (compatible con <script src="scoring.js">)
// ══════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
  window.NutreteScoring = {
    calcularScoringCompleto,
    Normalizar,
    Dimensiones,
    Mapas,
    calcularIBIN,
    calcularInteresDimension,
    calcularPrioridad
  };
}
