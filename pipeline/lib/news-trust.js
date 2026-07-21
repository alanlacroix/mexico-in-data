// GDELT is useful for discovery, but only these established publishers may move
// from its index into a public Mexico Brief feed. Registered RSS/API sources are
// checked separately in collect-news.js.
export const TRUSTED_NEWS_DOMAINS = new Set([
  'reuters.com', 'apnews.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'economist.com',
  'nytimes.com', 'washingtonpost.com', 'theguardian.com', 'bbc.com', 'bbc.co.uk',
  'cnbc.com', 'marketwatch.com', 'forbes.com', 'fortune.com', 'barrons.com', 'axios.com',
  'politico.com', 'foreignpolicy.com', 'americasquarterly.org', 'as-coa.org', 'csis.org',
  'brookings.edu', 'piie.com', 'imf.org', 'worldbank.org', 'oecd.org',
  'mexiconewsdaily.com', 'mexicobusiness.news', 'bnamericas.com', 'latinfinance.com',
  'spglobal.com', 'fitchratings.com', 'moodys.com', 'aljazeera.com', 'france24.com',
  'dw.com', 'cnn.com', 'npr.org', 'pbs.org', 'time.com', 'thehill.com', 'elpais.com',
]);

const MEXICO_NEWS_SIGNAL = /m[eé]xic|mexican|\bcdmx\b|banxico|\bcnbv\b|sheinbaum|\bpemex\b|\bmorena\b|nearshor|monterrey|guadalajara|\bbmv\b|banorte|\bfemsa\b|\boxxo\b|remittanc|remesas|maquila|t-?mec|usmca|infonavit|harfuch|alsea|telcel|carlos slim|\bcfe\b|\binegi\b|\bdof\b|hacienda|\bsat\b|\bmxn\b/i;
const MEXICO_PESO_SIGNAL = /\bpeso\b.{0,45}\bd[oó]lar|\bd[oó]lar\b.{0,45}\bpeso\b|tipo de cambio|usd\s*[\/-]\s*mxn/i;
const PUBLIC_HEADLINE_NOISE = /hor[óo]scopo|receta|\bstreaming\b|\bnfl\b|\bnba\b|\bmlb\b|liga mx|fichaje|premios|(?:^|\s)vs\.?\s|c[oó]mo ver|en vivo|resultado|final del mundial|[?¿]|^[“"'‘]|:\s*[“"'‘]|^(?:why|how|what)\b|^qu[eé]\b|as[ií] est[aá]|qu[eé] esperar|la historia de|\b(?:batman|mother courage|avenging|bombshell|nightmare|shocking|stunning)\b/i;

export function mexicoRelevant(value) {
  const text = String(value || '');
  return MEXICO_NEWS_SIGNAL.test(text) || MEXICO_PESO_SIGNAL.test(text);
}

export function publicHeadlineEligible(value) {
  const title = String(value || '');
  return mexicoRelevant(title) && !PUBLIC_HEADLINE_NOISE.test(title);
}

export function domainTrusted(value) {
  const domain = String(value || '').toLowerCase().replace(/^www\./, '');
  if (TRUSTED_NEWS_DOMAINS.has(domain)) return true;
  for (const trusted of TRUSTED_NEWS_DOMAINS) {
    if (domain.endsWith(`.${trusted}`)) return true;
  }
  return false;
}
