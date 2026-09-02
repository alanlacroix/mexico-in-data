// uiStrings.js — every fixed word on the homepage, hand-written in both languages.
//
// This is the anti-slop layer of the Spanish edition (Alan, 2026-08-03: "figure out
// a way to do this also in Spanish" — reaffirmed over the no-toggle ruling). Fixed
// vocabulary is never machine-translated: section heads, tile labels, verdicts,
// months, topic names are written once, here, in es-MX financial-press register
// (the El CEO / Expansión shelf), and reviewed like any other copy. The model only
// ever touches free text, elsewhere, under its own contract.
module.exports = {
  en: {
    lang: 'en', htmlLang: 'en', otherUrl: '/es/', otherLabel: 'ES',
    tagline: 'Mexico’s economic, political, security and business news, all in one place.',
    brief: 'The brief', weekendBrief: 'Weekend recap', updated: 'Updated', latestBrief: 'Latest brief',
    quietToday: 'No major developments yet today.',
    updateDelayed: "Today's update is delayed. The date above is the last complete edition.",
    moved: 'Market check', marketMeta: 'Latest available · 7-day change · 30-day line',
    why: 'WHY +', hide: 'HIDE −',
    stories: 'Key developments', todayStories: "Today's stories", keyDevelopments: 'Key developments', latestEditionStories: 'Latest edition stories',
    newThisWeekend: 'New this weekend', weekRecap: 'What mattered this week',
    storyCount: (n, latest) => `${n} ${n === 1 ? 'story' : 'stories'}${latest ? ` · ${latest}` : ''}`,
    be: 'Briefly explained', beHide: 'Hide', background: 'Background', ourView: 'Our view',
    watching: 'What we’re watching', source: 'Source', sources: 'Sources', evidence: 'Evidence',
    week: 'This week', weekSub: 'if you missed the week', all: 'All', showMoreTpl: 'Show {n} more', showLess: 'Show less',
    contextLinkTpl: 'Understand {topic} →',
    coming: 'Coming up', comingSub: 'Scheduled releases and decisions',
    econ: 'Where the economy stands',
    mail: 'Weekly email',
    mailCopy: 'One email a week: what changed in Mexico, why it changed, and the sources behind it.',
    mailExample: 'See an example →', mailPlaceholder: 'you@email.com', mailButton: 'Subscribe',
    mailFine: 'One email a week. Unsubscribe whenever you want.',
    esNote: '', footSections: 'Sections', footSite: 'Site',
  },
  es: {
    lang: 'es', htmlLang: 'es-MX', otherUrl: '/', otherLabel: 'EN',
    tagline: 'La economía, la política y la seguridad de México, en un solo lugar.',
    brief: 'El resumen', weekendBrief: 'Resumen del fin de semana', updated: 'Actualizado', latestBrief: 'Último resumen',
    quietToday: 'Todavía no hay acontecimientos importantes hoy.',
    updateDelayed: 'La actualización de hoy está retrasada. La fecha de arriba corresponde a la última edición completa.',
    moved: 'Pulso de mercados', marketMeta: 'Último dato · cambio a 7 días · línea de 30 días',
    why: 'POR QUÉ +', hide: 'OCULTAR −',
    stories: 'Historias clave', todayStories: 'Historias de hoy', keyDevelopments: 'Acontecimientos clave', latestEditionStories: 'Historias de la última edición',
    newThisWeekend: 'Nuevo este fin de semana', weekRecap: 'Lo más importante de la semana',
    storyCount: (n, latest) => `${n} ${n === 1 ? 'historia' : 'historias'}${latest ? ` · ${latest}` : ''}`,
    be: 'En breve', beHide: 'Ocultar', background: 'Contexto', ourView: 'Nuestra lectura',
    watching: 'Qué estamos siguiendo', source: 'Fuente', sources: 'Fuentes', evidence: 'Fuentes del análisis',
    week: 'Esta semana', weekSub: 'si te perdiste la semana', all: 'Todas', showMoreTpl: 'Ver {n} más', showLess: 'Ver menos',
    contextLinkTpl: 'Entender {topic} →',
    coming: 'Próximamente', comingSub: 'Publicaciones y decisiones programadas',
    econ: 'Dónde está la economía',
    mail: 'Correo semanal',
    mailCopy: 'Un correo a la semana: qué cambió en México, por qué cambió y las fuentes detrás.',
    mailExample: 'Ver un ejemplo →', mailPlaceholder: 'tu@correo.com', mailButton: 'Suscribirme',
    mailFine: 'Un correo a la semana. Cancela cuando quieras.',
    esNote: 'La sección Fuentes está en inglés por ahora.', footSections: 'Secciones', footSite: 'Sitio',
  },
  maps: {
    cats: {
      'Payments & fintech': 'Pagos y fintech', 'Deals & investment': 'Inversión y transacciones',
      'Economy & money': 'Economía y dinero', 'US & Mexico': 'EE. UU. y México',
      'Politics': 'Política', 'Security & society': 'Seguridad y sociedad',
      'Energy & infrastructure': 'Energía e infraestructura',
    },
    tileLabels: {
      'Peso': 'Peso', 'Gasoline': 'Gasolina', 'Cetes 28-day': 'Cetes 28 días',
      'US 10-year': 'Bono EE. UU. 10 años', 'Stock market': 'Bolsa (IPC)',
    },
    tags: {
      'STRONGER': 'MÁS FUERTE', 'WEAKER': 'MÁS DÉBIL', 'PRICIER': 'MÁS CARA', 'CHEAPER': 'MÁS BARATA',
      'PAYS MORE': 'PAGA MÁS', 'PAYS LESS': 'PAGA MENOS', 'COSTLIER': 'MÁS CARO',
      'HIGHER': 'AL ALZA', 'LOWER': 'A LA BAJA', 'BARELY MOVED': 'CASI SIN CAMBIO',
    },
    months: { Jan: 'ene', Feb: 'feb', Mar: 'mar', Apr: 'abr', May: 'may', Jun: 'jun',
      Jul: 'jul', Aug: 'ago', Sep: 'sep', Oct: 'oct', Nov: 'nov', Dec: 'dic' },
    days: { Mon: 'lun', Tue: 'mar', Wed: 'mié', Thu: 'jue', Fri: 'vie', Sat: 'sáb', Sun: 'dom' },
    econNames: {
      'Inflation': 'Inflación', 'Policy rate': 'Tasa de política', 'Economic activity': 'Actividad económica',
      'Goods exports': 'Exportaciones de bienes', 'Remittances': 'Remesas',
    },
    refLabels: {
      'NOW': 'HOY', 'TARGET': 'META', 'INFLATION': 'INFLACIÓN', 'MONTH BEFORE': 'MES ANTERIOR',
      'YEAR EARLIER': 'AÑO ANTERIOR',
    },
    meaning: {
      'banxico-usdmxn-fix': 'Un peso más fuerte abarata las importaciones, las deudas en dólares y los viajes al extranjero; uno más débil alimenta la inflación.',
      'cre-gasolina-regular': 'La gasolina pega directo a la inflación general y a lo que cuesta cada traslado y cada entrega.',
      'banxico-cetes-28d': 'Los Cetes son lo que el gobierno paga por dinero a 28 días: una tasa más alta paga más al ahorrador y señala crédito más caro.',
      'fred-ust10': 'El bono estadounidense a 10 años fija el precio global del dinero; cuando sube, los activos en pesos tienen que pagar más para competir.',
      'banxico-bmv-ipc': 'El IPC sigue a las mayores empresas listadas de México: se mueve con las utilidades y con el apetito de riesgo de los inversionistas.',
    },
    rel: [
      [/^today$/, 'hoy'], [/^tomorrow$/, 'mañana'], [/^in (\d+) days$/, 'en $1 días'], [/^next week$/, 'la próxima semana'],
    ],
  },
};
