'use strict';

const fold = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const numericTokens = (value) => (String(value || '').match(/\d+(?:[.,]\d+)*/g) || [])
  .map((token) => (/^\d+,\d+$/.test(token) ? token.replace(',', '.') : token.replace(/,/g, ''))).sort();

const ENTITIES = [
  { id: 'banxico', aliases: [/\bbanxico\b/, /\bbanco de mexico\b/, /\bmexican central bank\b/] },
  { id: 'cfe', aliases: [/\bcfe\b/, /\bcomision federal de electricidad\b/] },
  { id: 'pemex', aliases: [/\bpemex\b/, /\bpetroleos mexicanos\b/] },
  { id: 'inegi', aliases: [/\binegi\b/, /\binstituto nacional de estadistica\b/] },
  { id: 'sheinbaum', aliases: [/\bsheinbaum\b/] },
  { id: 'morena', aliases: [/\bmorena\b/] },
  { id: 'hacienda', aliases: [/\bhacienda\b/, /\bshcp\b/, /\bfinance ministry\b/] },
  { id: 'usmca', aliases: [/\busmca\b/, /\bt mec\b/] },
];
const EN_NEGATION = /\b(?:no|not|never|without|neither|unchanged)\b/i;
const ES_NEGATION = /\b(?:no|nunca|sin|ningun[oa]?|tampoco|sin cambios)\b/i;
const EN_PROPOSAL = /\b(?:proposal|proposed|proposes?|draft|would|could|may|might|plans? to|seeks? to)\b/i;
const ES_PROPOSAL = /\b(?:propuesta|propone|proponen|proyecto|anteproyecto|puede|pueden|podria|podrian|planea|busca|\w+ria|\w+rian)\b/i;
const EN_FINAL = /\b(?:approved|enacted|implemented|entered into force|took effect|is in force|final rule)\b/i;
const ES_FINAL = /\b(?:aprobo|aprobaron|aprobado|aprobada|promulgo|promulgaron|implemento|implementaron|entro en vigor|esta en vigor|regla definitiva|reforma definitiva)\b/i;
// Names and numbers can survive a translation even when its meaning is reversed.
// These pairs catch only clear opposites; neutral paraphrases remain valid.
const OPPOSITE_ACTIONS = [
  {
    label: 'increase/decrease',
    enPositive: /\b(?:rise|rises|rose|risen|increase[ds]?|increasing|grow(?:s|ing)?|grew|grown|expand(?:s|ed|ing)?|raise[ds]?|raising|higher)\b/i,
    enNegative: /\b(?:fall|falls|fell|fallen|decrease[ds]?|decreasing|decline[ds]?|declining|drop(?:s|ped|ping)?|shrink(?:s|ing)?|shrank|reduce[ds]?|reducing|cut(?:s|ting)?|lower)\b/i,
    esPositive: /\b(?:subir|sube|subio|subieron|aumentar|aumenta|aumento|aumentaron|crecer|crece|crecio|crecieron|expandir|expande|expandio|elevar|eleva|elevo|incrementar|incrementa|incremento|mayor|mas alto|al alza)\b/i,
    esNegative: /\b(?:caer|cae|cayo|cayeron|bajar|baja|bajo|bajaron|disminuir|disminuye|disminuyo|disminuyeron|descender|desciende|descendio|declinar|declina|declino|reducir|reduce|redujo|redujeron|recortar|recorta|recorto|menor|mas bajo|a la baja)\b/i,
  },
  {
    label: 'approve/reject',
    enPositive: /\b(?:approve[ds]?|approving|adopt(?:s|ed|ing)?|enact(?:s|ed|ing)?|pass(?:es|ed|ing)?)\b/i,
    enNegative: /\b(?:reject(?:s|ed|ing)?|veto(?:es|ed|ing)?|block(?:s|ed|ing)?)\b/i,
    esPositive: /\b(?:aprueba|aprobo|aprobaron|adopta|adopto|adoptaron|promulga|promulgo|promulgaron|sanciona|sanciono)\b/i,
    esNegative: /\b(?:rechaza|rechazo|rechazaron|veta|veto|vetaron|bloquea|bloqueo|bloquearon)\b/i,
  },
  {
    label: 'uphold/overturn',
    enPositive: /\b(?:uphold(?:s|ing)?|upheld|affirm(?:s|ed|ing)?)\b/i,
    enNegative: /\b(?:overturn(?:s|ed|ing)?|invalidate[ds]?|invalidating|strike(?:s|ing)? down|struck down|annul(?:s|led|ling)?)\b/i,
    esPositive: /\b(?:confirma|confirmo|confirmaron|ratifica|ratifico|ratificaron|avala|avalo|avalaron)\b/i,
    esNegative: /\b(?:anula|anulo|anularon|invalida|invalido|invalidaron|revoca|revoco|revocaron)\b/i,
  },
  {
    label: 'start/stop',
    enPositive: /\b(?:start(?:s|ed|ing)?|begin(?:s|ning)?|began|launch(?:es|ed|ing)?|resume[ds]?|resuming|open(?:s|ed|ing)?|expand(?:s|ed|ing)?)\b/i,
    enNegative: /\b(?:stop(?:s|ped|ping)?|halt(?:s|ed|ing)?|suspend(?:s|ed|ing)?|cancel(?:s|led|ling)?|close[ds]?|closing|end(?:s|ed|ing)?|eliminate[ds]?|eliminating|abolish(?:es|ed|ing)?)\b/i,
    esPositive: /\b(?:iniciar|inicia|inicio|iniciaron|comenzar|comienza|comenzo|comenzaron|lanzar|lanza|lanzo|lanzaron|reanudar|reanuda|reanudo|reanudaron|abrir|abre|abrio|abrieron|expandir|expande|expandio)\b/i,
    esNegative: /\b(?:detener|detiene|detuvo|detuvieron|suspender|suspende|suspendio|suspendieron|cancelar|cancela|cancelo|cancelaron|cerrar|cierra|cerro|cerraron|terminar|termina|termino|terminaron|eliminar|elimina|elimino|eliminaron|suprimir|suprime|suprimio)\b/i,
  },
  {
    label: 'strengthen/weaken',
    enPositive: /\b(?:strengthen(?:s|ed|ing)?|appreciate[ds]?|appreciating|stronger)\b/i,
    enNegative: /\b(?:weaken(?:s|ed|ing)?|depreciate[ds]?|depreciating|weaker)\b/i,
    esPositive: /\b(?:fortalecer|fortalece|fortalecio|fortalecido|apreciar|aprecia|aprecio|mas fuerte)\b/i,
    esNegative: /\b(?:debilitar|debilita|debilito|debilitado|depreciar|deprecia|deprecio|mas debil)\b/i,
  },
];
const MONTHS = [
  ['january', 'enero'], ['february', 'febrero'], ['march', 'marzo'], ['april', 'abril'],
  ['may', 'mayo'], ['june', 'junio'], ['july', 'julio'], ['august', 'agosto'],
  ['september', 'septiembre'], ['october', 'octubre'], ['november', 'noviembre'], ['december', 'diciembre'],
];
const mentions = (text, entity) => entity.aliases.some((pattern) => pattern.test(text));

function bilingualFidelityFlags({ english = '', spanish = '', evidence = [] } = {}) {
  const en = fold(english);
  const es = fold(spanish);
  const support = fold([english, ...evidence].join(' '));
  const flags = [];
  if (JSON.stringify(numericTokens(english)) !== JSON.stringify(numericTokens(spanish))) flags.push('numbers changed in Spanish');
  for (const entity of ENTITIES) {
    const inEnglish = mentions(en, entity);
    const inSpanish = mentions(es, entity);
    const inSupport = mentions(support, entity);
    if (inEnglish && !inSpanish) flags.push(`${entity.id} was dropped in Spanish`);
    if (inSpanish && !inSupport) flags.push(`${entity.id} was introduced in Spanish`);
  }
  if (EN_NEGATION.test(english) && !ES_NEGATION.test(spanish)) flags.push('negation was dropped in Spanish');
  if (ES_NEGATION.test(spanish) && !EN_NEGATION.test(english)) flags.push('negation was introduced in Spanish');
  if (EN_PROPOSAL.test(english) && !ES_PROPOSAL.test(es)) flags.push('proposal or uncertainty became final in Spanish');
  if (ES_FINAL.test(es) && !EN_FINAL.test(english)) flags.push('completed action was introduced in Spanish');
  if (EN_FINAL.test(english) && !ES_FINAL.test(es)) flags.push('completed action became non-final in Spanish');
  for (const action of OPPOSITE_ACTIONS) {
    const enPositive = action.enPositive.test(en);
    const enNegative = action.enNegative.test(en);
    const esPositive = action.esPositive.test(es);
    const esNegative = action.esNegative.test(es);
    if (enPositive && !enNegative && esNegative && !esPositive) flags.push(`${action.label} direction reversed in Spanish`);
    if (enNegative && !enPositive && esPositive && !esNegative) flags.push(`${action.label} direction reversed in Spanish`);
  }
  for (const [englishMonth, spanishMonth] of MONTHS) {
    const monthPattern = englishMonth === 'may' ? /\bMay\b/ : new RegExp(`\\b${englishMonth}\\b`, 'i');
    if (monthPattern.test(String(english)) && !new RegExp(`\\b${spanishMonth}\\b`, 'i').test(es)) {
      flags.push(`${englishMonth} was changed or dropped in Spanish`);
    }
  }
  return [...new Set(flags)];
}

module.exports = { bilingualFidelityFlags };
