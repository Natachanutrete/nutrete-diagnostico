/**
 * MÓDULO INFORMES NÚTRETE®
 * js/informes.js — Versión 1.0
 * 
 * Centro de diagnóstico integrado.
 * Fuentes: encuesta colaboradores + encuesta gerencia + check-up
 * Motor de scoring: scoring.js (NutreteScoring)
 */

'use strict';

// ══════════════════════════════════════════════
// CONFIGURACIÓN
// ══════════════════════════════════════════════

const CONFIG = {
  MIN_GROUP_SIZE: 5,   // Mínimo de participantes para mostrar subgrupo
  SUPABASE_URL: 'https://jpybenygergddnksbwzg.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpweWJlbnlnZXJnZGRua3Nid3pnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMjMzOTUsImV4cCI6MjEwMzY5OTM5NX0.-KTVBiXLwvQzmRg7BqG5GmH8O2YEk08c3IuRM-VwTeE',
};

// Categorías IBIN
const CATEGORIAS_IBIN = [
  { max: 100, min: 80, label: 'Fortalecido',    color: '#07542F', fondo: '#e8f5ee' },
  { max: 79,  min: 65, label: 'Adecuado',       color: '#009444', fondo: '#f0f7f3' },
  { max: 64,  min: 50, label: 'En desarrollo',  color: '#a05a00', fondo: '#fef3e8' },
  { max: 49,  min: 35, label: 'Prioritario',    color: '#c0392b', fondo: '#fdf0ee' },
  { max: 34,  min: 0,  label: 'Alta prioridad', color: '#8b0000', fondo: '#fce8e8' },
];

function categoriaIBIN(score) {
  if (score === null) return { label: 'Sin datos', color: '#aaa', fondo: '#f0f0f0' };
  return CATEGORIAS_IBIN.find(c => score >= c.min && score <= c.max)
    || CATEGORIAS_IBIN[CATEGORIAS_IBIN.length - 1];
}

// ══════════════════════════════════════════════
// CARGA DE DATOS
// ══════════════════════════════════════════════

async function cargarDatosInforme(sb, evaluacionId) {
  const resultado = {
    evaluacion: null, empresa: null,
    colaboradores: [], resultadosCheckup: [],
    respuestasColaboradores: [], datosColaboradores: [],
    respuestaGerencia: null, datosGerencia: null,
    scoring: null, error: null,
  };

  try {
    // 1. Validar y cargar evaluación
    const { data: ev, error: evErr } = await sb.from('evaluaciones')
      .select('*, empresa:empresa_id(id, nombre, rut)')
      .eq('id', evaluacionId)
      .single();

    if (evErr || !ev) throw new Error('Evaluación no encontrada o sin acceso autorizado.');
    resultado.evaluacion = ev;
    resultado.empresa = ev.empresa;

    // 2. Cargar colaboradores + check-up
    const { data: cols } = await sb.from('colaboradores')
      .select('id, codigo, sexo, edad, area')
      .eq('evaluacion_id', evaluacionId);
    resultado.colaboradores = cols || [];

    if (resultado.colaboradores.length) {
      const colIds = resultado.colaboradores.map(c => c.id);
      const { data: ckup } = await sb.from('resultados_checkup')
        .select('colaborador_id, imc, masa_grasa_pct, masa_grasa_kg, masa_muscular_kg, masa_osea_kg, agua_corporal_pct, grasa_visceral, edad_metabolica, circunferencia_cintura_cm, circunferencia_cadera_cm, icc, presion_sistolica, presion_diastolica, glicemia_capilar, semaforo_imc, semaforo_grasa_pct, semaforo_grasa_visceral, semaforo_presion, semaforo_glicemia')
        .in('colaborador_id', colIds);
      resultado.resultadosCheckup = ckup || [];
    }

    // 3. Cargar encuesta colaboradores
    const { data: encColabs } = await sb.from('encuestas')
      .select('id, activa')
      .eq('evaluacion_id', evaluacionId)
      .eq('tipo', 'colaborador');

    if (encColabs && encColabs.length) {
      const encIds = encColabs.map(e => e.id);
      const { data: respColabs } = await sb.from('respuestas_encuesta')
        .select('autopercepcion_salud, bienestar_general, nivel_estres, horas_sueno')
        .in('encuesta_id', encIds);

      resultado.respuestasColaboradores = respColabs || [];
      resultado.datosColaboradores = resultado.respuestasColaboradores.map(r => {
        try { return JSON.parse(r.autopercepcion_salud || '{}'); } catch { return {}; }
      });

      if (resultado.datosColaboradores.length >= CONFIG.MIN_GROUP_SIZE) {
        resultado.scoring = NutreteScoring.calcularScoringCompleto(resultado.datosColaboradores);
      }
    }

    // 4. Cargar encuesta gerencia
    const { data: encGer } = await sb.from('encuestas')
      .select('id')
      .eq('evaluacion_id', evaluacionId)
      .eq('tipo', 'gerencia')
      .order('created_at', { ascending: false })
      .limit(1);

    if (encGer && encGer.length) {
      const { data: respGer } = await sb.from('respuestas_encuesta')
        .select('autopercepcion_salud')
        .eq('encuesta_id', encGer[0].id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (respGer && respGer.length) {
        resultado.respuestaGerencia = respGer[0];
        try {
          resultado.datosGerencia = JSON.parse(respGer[0].autopercepcion_salud || '{}');
        } catch { resultado.datosGerencia = {}; }
      }
    }

  } catch (err) {
    console.error('[Nútrete Informes] Error de carga:', err.message);
    resultado.error = err.message;
  }

  return resultado;
}

// ══════════════════════════════════════════════
// MOTOR DE RECOMENDACIONES
// ══════════════════════════════════════════════

function generarRecomendaciones(scoring, checkupData) {
  const recs = [];
  if (!scoring) return recs;

  const s = scoring.scores;
  const add = (icono, titulo, desc) => recs.push({ icono, titulo, desc });

  if (s.recuperacion !== null && s.recuperacion < 60)
    add('😴', 'Programa de sueño y recuperación',
      'Taller práctico sobre higiene del sueño, impacto del trabajo en el descanso y estrategias de recuperación. Incluye fitoterapia (valeriana, pasiflora) y aromaterapia para el descanso.');

  if (s.estresRecursos !== null && s.estresRecursos < 60)
    add('🧘', 'Taller de manejo del estrés y autorregulación',
      'Técnicas de respiración, manejo de la carga laboral y estrategias de desconexión. Aromaterapia clínica (lavanda, bergamota) y fitoterapia adaptógena (ashwagandha, rhodiola).');

  if (s.alimentacion !== null && s.alimentacion < 60)
    add('🥗', 'Programa de alimentación saludable en el trabajo',
      'Estrategias prácticas para mejorar la calidad alimentaria durante la jornada. Colaciones, hidratación, acceso a opciones saludables y educación sobre ultraprocesados.');

  if (s.movimiento !== null && s.movimiento < 60)
    add('🏃', 'Activación física y pausas activas',
      'Pausas activas estructuradas, orientación sobre actividad física accesible e intervención en el entorno para reducir el sedentarismo laboral.');

  if (s.vitalidad !== null && s.vitalidad < 60)
    add('⚡', 'Taller de energía y vitalidad laboral',
      'Alimentación para la energía, manejo del ritmo circadiano y estrategias para el bajón post-almuerzo. Uso de plantas estimulantes suaves.');

  if (s.bienestarPercibido !== null && s.bienestarPercibido < 60)
    add('💚', 'Programa de bienestar integral',
      'Intervención multidimensional con microacciones autoelegidas. El Método Nútrete® desarrolla el criterio para la salud desde la autonomía de cada persona.');

  if (s.entornoSaludable !== null && s.entornoSaludable < 60)
    add('🏢', 'Diagnóstico y mejora del entorno laboral',
      'Análisis organizacional y propuestas concretas para facilitar el bienestar: pausas, acceso a agua, espacios y liderazgo saludable.');

  if (checkupData.pctPresionFueraRango > 30)
    add('🩺', 'Seguimiento de indicadores clínicos',
      'Operativo de salud periódico (Check-up Nútrete) para monitorear la evolución de indicadores cardiovasculares. Derivación médica para casos que lo requieran.');

  if (!recs.length)
    add('📈', 'Programa de mantenimiento Cultivo de Hábitos',
      'El equipo presenta indicadores favorables. Un programa de 3 meses consolida los hábitos positivos y previene el deterioro futuro.');

  return recs;
}

// ══════════════════════════════════════════════
// HALLAZGOS AUTOMÁTICOS
// ══════════════════════════════════════════════

function generarHallazgos(scoring, checkupData, datosGerencia, datosColabs) {
  const hallazgos = [];
  if (!scoring) return hallazgos;

  const s = scoring.scores;
  const n = scoring.n;

  // Top 3–5 hallazgos ordenados por relevancia
  const candidatos = [];

  // Brechas de scoring
  scoring.dimensionesOrdenadas.filter(d => d.score < 50).slice(0, 3).forEach(d => {
    candidatos.push({
      peso: 100 - d.score,
      hallazgo: `Brecha en ${d.nombre}`,
      evidencia: `La dimensión presenta un puntaje de ${d.score}/100 con interés del ${d.interes}% del equipo.`,
      implicancia: d.textoDx || `La dimensión ${d.nombre.toLowerCase()} requiere intervención.`,
    });
  });

  // Interés alto sin brecha (oportunidad)
  scoring.dimensionesOrdenadas.filter(d => d.interes >= 60 && d.score >= 50).slice(0, 2).forEach(d => {
    candidatos.push({
      peso: d.interes,
      hallazgo: `Alta demanda por ${d.nombre.toLowerCase()}`,
      evidencia: `El ${d.interes}% del equipo señala esta dimensión como prioritaria, aunque el puntaje base es ${d.score}/100.`,
      implicancia: `Existe disposición favorable del equipo. Intervenciones en esta área tendrán alta receptividad.`,
    });
  });

  // Check-up: indicadores críticos
  if (checkupData.n > 0) {
    if (checkupData.pctGrasaAlta > 40)
      candidatos.push({
        peso: checkupData.pctGrasaAlta,
        hallazgo: 'Exceso de adiposidad en el equipo',
        evidencia: `El ${checkupData.pctGrasaAlta}% del equipo evaluado presenta masa grasa elevada.`,
        implicancia: 'Este hallazgo clínico aumenta el riesgo metabólico y cardiovascular del equipo.',
      });

    if (checkupData.pctPresionFueraRango > 30)
      candidatos.push({
        peso: checkupData.pctPresionFueraRango,
        hallazgo: 'Indicadores cardiovasculares en zona de alerta',
        evidencia: `El ${checkupData.pctPresionFueraRango}% del equipo evaluado presenta presión arterial sobre el rango óptimo.`,
        implicancia: 'Se recomienda seguimiento médico y un programa de reducción del estrés y el sedentarismo.',
      });
  }

  // Intereses explícitos más frecuentes
  const temaConteo = {};
  const temasMap = {
    sueno_pr:'Sueño y descanso', estres_pr:'Manejo del estrés', alimentacion_pr:'Alimentación',
    actividad_pr:'Actividad física', energia_pr:'Energía y vitalidad',
  };
  datosColabs.forEach(d => {
    (d.temas_apoyo || []).forEach(t => { if (temasMap[t]) temaConteo[t] = (temaConteo[t]||0)+1; });
  });
  const topTema = Object.entries(temaConteo).sort((a,b) => b[1]-a[1])[0];
  if (topTema && n > 0) {
    const pctTema = Math.round(topTema[1]/n*100);
    if (pctTema >= 50) {
      candidatos.push({
        peso: pctTema,
        hallazgo: `Alta demanda por ${temasMap[topTema[0]].toLowerCase()}`,
        evidencia: `El ${pctTema}% de los participantes selecciona este tema como prioritario.`,
        implicancia: 'Las intervenciones en esta área tendrán alta receptividad y participación.',
      });
    }
  }

  // Ordenar por peso y tomar los 5 más relevantes
  return candidatos
    .sort((a, b) => b.peso - a.peso)
    .slice(0, 5)
    .map((h, i) => ({ numero: i + 1, ...h }));
}

// ══════════════════════════════════════════════
// LECTURA INTEGRADA
// ══════════════════════════════════════════════

function generarLecturaIntegrada(scoring, checkupData, datosGerencia) {
  if (!scoring) return [];
  const lecturas = [];
  const ger = datosGerencia || {};
  const s = scoring.scores;

  // Función auxiliar: buscar en datos gerencia
  const gerMenciona = (...claves) => claves.some(c => {
    const v = ger[c];
    return v && (Array.isArray(v) ? v.length > 0 : v !== 'No');
  });

  // Recuperación
  if (s.recuperacion !== null) {
    const interesRecup = scoring.dimensiones.find(d => d.id === 'recuperacion')?.interes || 0;
    const gerMencSueno = gerMenciona('problemas_sueno', 'dificultades_turnos');
    if (s.recuperacion < 55 && interesRecup >= 40) {
      lecturas.push({
        dimension: 'Recuperación y sueño',
        tipo: 'convergencia',
        texto: `Recuperación se identifica como una prioridad de intervención, dado que existe una brecha relevante en la percepción de los colaboradores (${s.recuperacion}/100)${interesRecup >= 50 ? `, un alto interés del equipo (${interesRecup}%)` : ''}${gerMencSueno ? ' y antecedentes organizacionales que apuntan en la misma dirección' : ''}. La intervención en este eje tiene alta probabilidad de impacto.`,
      });
    } else if (s.recuperacion < 55 && !gerMencSueno) {
      lecturas.push({
        dimension: 'Recuperación y sueño',
        tipo: 'discrepancia',
        texto: `Se observa una brecha en la dimensión de recuperación (${s.recuperacion}/100) según los colaboradores, pero no aparece como problemática identificada por gerencia. Se recomienda profundizar esta dimensión antes de definir acciones específicas.`,
      });
    }
  }

  // Estrés
  if (s.estresRecursos !== null) {
    const gerMencEstres = gerMenciona('necesidades_percibidas', 'problemas_salud');
    const estresGerencia = Array.isArray(ger.necesidades_percibidas) &&
      ger.necesidades_percibidas.some(n => n.includes('estres') || n.includes('estrés') || n.includes('fatiga'));
    if (s.estresRecursos < 60) {
      if (estresGerencia) {
        lecturas.push({
          dimension: 'Estrés y carga laboral',
          tipo: 'convergencia',
          texto: `El estrés laboral es reconocido tanto por los colaboradores (${s.estresRecursos}/100 en manejo de estrés y recursos) como por la gerencia, que lo identifica entre las principales necesidades del equipo. Esta convergencia refuerza la prioridad de intervención.`,
        });
      } else {
        lecturas.push({
          dimension: 'Estrés y carga laboral',
          tipo: 'informacion',
          texto: `Los colaboradores reportan dificultades en el manejo del estrés y la carga laboral (${s.estresRecursos}/100). Este hallazgo merece atención aun cuando no haya sido identificado explícitamente en el diagnóstico de gerencia.`,
        });
      }
    }
  }

  // Entorno laboral
  if (s.entornoSaludable !== null && s.entornoSaludable < 60) {
    const gerFacilita = ger.trabajo_facilita_habitos;
    lecturas.push({
      dimension: 'Entorno organizacional',
      tipo: s.entornoSaludable < 45 ? 'alerta' : 'informacion',
      texto: `El equipo percibe el entorno laboral como un factor que dificulta el bienestar (${s.entornoSaludable}/100). Las intervenciones individuales tienen impacto limitado cuando el entorno organizacional no acompaña. Se recomienda revisar condiciones estructurales: pausas, acceso a agua, espacios y cultura de bienestar.`,
    });
  }

  // Check-up vs percepción
  if (checkupData.n >= CONFIG.MIN_GROUP_SIZE && s.bienestarPercibido !== null) {
    if (checkupData.pctGrasaAlta > 40 && s.bienestarPercibido > 60) {
      lecturas.push({
        dimension: 'Bienestar percibido vs. indicadores clínicos',
        tipo: 'discrepancia',
        texto: `Existe una diferencia entre el bienestar percibido del equipo (${s.bienestarPercibido}/100, nivel adecuado) y los indicadores clínicos del Check-up, que muestran un ${checkupData.pctGrasaAlta}% con adiposidad elevada. Esta situación es frecuente cuando los riesgos de salud aún no se han manifestado como malestar subjetivo. Refuerza la necesidad de intervención preventiva.`,
      });
    }
  }

  return lecturas;
}

// ══════════════════════════════════════════════
// CÁLCULOS CLÍNICOS AGREGADOS (CHECK-UP)
// ══════════════════════════════════════════════

function calcularCheckupAgregado(resultados) {
  const n = resultados.length;
  if (!n) return { n: 0 };

  const pct = (fn) => Math.round(resultados.filter(fn).length / n * 100);
  const prom = (key) => {
    const vals = resultados.map(r => r[key]).filter(v => v !== null && !isNaN(v));
    return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : null;
  };

  return {
    n,
    // IMC
    promIMC: prom('imc'),
    pctIMCNormal: pct(r => r.semaforo_imc === 'verde'),
    pctIMCAlerta: pct(r => r.semaforo_imc === 'amarillo'),
    pctIMCRiesgo: pct(r => r.semaforo_imc === 'rojo'),
    // Grasa
    promGrasa: prom('masa_grasa_pct'),
    pctGrasaNormal: pct(r => r.semaforo_grasa_pct === 'verde'),
    pctGrasaAlerta: pct(r => r.semaforo_grasa_pct === 'amarillo'),
    pctGrasaRiesgo: pct(r => r.semaforo_grasa_pct === 'rojo'),
    pctGrasaAlta: pct(r => r.semaforo_grasa_pct === 'amarillo' || r.semaforo_grasa_pct === 'rojo'),
    // Visceral
    promVisceral: prom('grasa_visceral'),
    pctVisceralNormal: pct(r => r.semaforo_grasa_visceral === 'verde'),
    pctVisceralAlerta: pct(r => r.semaforo_grasa_visceral === 'amarillo'),
    pctVisceralRiesgo: pct(r => r.semaforo_grasa_visceral === 'rojo'),
    // Presión
    pctPresionNormal: pct(r => r.semaforo_presion === 'verde'),
    pctPresionAlerta: pct(r => r.semaforo_presion === 'amarillo'),
    pctPresionRiesgo: pct(r => r.semaforo_presion === 'rojo'),
    pctPresionFueraRango: pct(r => r.semaforo_presion === 'amarillo' || r.semaforo_presion === 'rojo'),
    // Glicemia
    pctGlicNormal: pct(r => r.semaforo_glicemia === 'verde'),
    pctGlicAlerta: pct(r => r.semaforo_glicemia === 'amarillo'),
    pctGlicRiesgo: pct(r => r.semaforo_glicemia === 'rojo'),
    // Composición
    promMuscular: prom('masa_muscular_kg'),
    promAgua: prom('agua_corporal_pct'),
    // Áreas
    areas: [...new Set(resultados.map(r => {
      // Obtener área desde colaboradores (join externo)
      return r._area;
    }).filter(Boolean))],
  };
}

// ══════════════════════════════════════════════
// EXPORTAR
// ══════════════════════════════════════════════

if (typeof window !== 'undefined') {
  window.NutreteInformes = {
    CONFIG,
    categoriaIBIN,
    cargarDatosInforme,
    calcularCheckupAgregado,
    generarRecomendaciones,
    generarHallazgos,
    generarLecturaIntegrada,
  };
}
