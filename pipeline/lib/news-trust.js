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

// Hacienda, remittances, nearshoring and the peso are not uniquely Mexican.
// Require a country, institution, company or currency anchor in the reporting.
// A foreign actor remains eligible when the story names its Mexico connection.
const MEXICO_NEWS_SIGNAL = /m[eé]xic|mexican|\bcdmx\b|banxico|\bcnbv\b|sheinbaum|\bpemex\b|\bmorena\b|monterrey|guadalajara|\bbmv\b|banorte|\bfemsa\b|\boxxo\b|\bt-?mec\b|\busmca\b|infonavit|harfuch|alsea|telcel|carlos slim|\bcfe\b|\binegi\b|\bdof\b|\bshcp\b|secretar[ií]a de hacienda y cr[eé]dito p[uú]blico|\bmxn\b/i;
const MEXICO_TAX_SIGNAL = /\bSAT\b/;
const PUBLIC_HEADLINE_NOISE = /hor[óo]scopo|receta|\bstreaming\b|\bnfl\b|\bnba\b|\bmlb\b|liga mx|fichaje|premios|(?:^|\s)vs\.?\s|c[oó]mo ver|en vivo|resultado|final del mundial|[?¿]|^[“"'‘]|:\s*[“"'‘]|^(?:why|how|what)\b|^qu[eé]\b|as[ií] est[aá]|qu[eé] esperar|la historia de|\b(?:batman|mother courage|avenging|bombshell|nightmare|shocking|stunning)\b/i;

const NAMED_ENTITIES = { aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', iquest: '¿', iexcl: '¡', laquo: '«', raquo: '»', deg: '°', ordm: 'º', ordf: 'ª', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', ndash: '–', mdash: '—', hellip: '…' };
const decodeOnce = (value) => value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&nbsp;/g, ' ')
  .replace(/&([A-Za-z]+);/g, (match, name) => NAMED_ENTITIES[name] || match);

export function stripNewsBoilerplate(value) {
  // Require the publisher's closing phrase. An ordinary sentence beginning
  // "La publicación del decreto" must remain available as actual reporting.
  return String(value || '').replace(/\s*(?:The post|El art[ií]culo|La entrada|La publicaci[oó]n)\s+[\s\S]*?\s+(?:appeared first on|apareci[oó] primero en)\s+[\s\S]*$/i, '').trim();
}

export function cleanNewsText(input) {
  let value = String(input || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  for (let i = 0; i < 3; i += 1) {
    const decoded = decodeOnce(value);
    if (decoded === value) break;
    value = decoded;
  }
  return stripNewsBoilerplate(value.replace(/<[^>]+>/g, ' ').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' '));
}

export function newsCollectionHealth({ aliveSources, totalSources, wireCount }) {
  const minimumAlive = Math.ceil(Number(totalSources) / 2);
  const ok = Number(aliveSources) >= minimumAlive && Number(wireCount) > 0;
  return { ok, minimumAlive };
}

export function mexicoRelevant(value) {
  const text = stripNewsBoilerplate(value);
  return MEXICO_NEWS_SIGNAL.test(text) || MEXICO_TAX_SIGNAL.test(text);
}

export function publicHeadlineEligible(value) {
  const title = String(value || '');
  return mexicoRelevant(title) && !PUBLIC_HEADLINE_NOISE.test(title);
}

// Source metadata predates stable IDs in the ledger. Normalize it at both the
// write and read boundaries so old entries remain usable without allowing an
// unknown value to become editorially eligible.
export function normalizeSourceTier(value) {
  const tier = String(value ?? '').trim().toLowerCase();
  if (tier === '1') return 1;
  if (tier === '2') return 2;
  if (tier === 'specialist' || tier === 'aggregator') return tier;
  return '';
}

export function editorialSourceTier(value) {
  return [1, 2, 'specialist'].includes(normalizeSourceTier(value));
}

function sameOrSubdomain(host, allowed) {
  const candidate = String(host || '').toLowerCase().replace(/^www\./, '');
  const base = String(allowed || '').toLowerCase().replace(/^www\./, '');
  return Boolean(candidate && base && (candidate === base || candidate.endsWith(`.${base}`)));
}

function registeredSourceHosts(source) {
  if (Array.isArray(source?.articleDomains) && source.articleDomains.length) return source.articleDomains;
  try { return [new URL(source.baseUrl || source.url).hostname]; } catch { return []; }
}

// New records carry sourceId. For legacy records, a display name is enough only
// where it is unique; duplicate publisher names must also match one configured
// article host. This prevents Google News' El Economista search feed from being
// mistaken for El Economista's direct RSS feed.
export function registeredSourceFor(article, sources = []) {
  const registry = Array.isArray(sources) ? sources : [];
  const sourceId = String(article?.sourceId || '').trim();
  if (sourceId) return registry.find((source) => source.id === sourceId) || null;
  const named = registry.filter((source) => source.name === article?.sourceName);
  if (named.length <= 1) return named[0] || null;
  let host = '';
  try { host = new URL(String(article?.url || '')).hostname; } catch { return null; }
  const matched = named.filter((source) => registeredSourceHosts(source).some((allowed) => sameOrSubdomain(host, allowed)));
  return matched.length === 1 ? matched[0] : null;
}

// Some trusted sources are useful reading but are not event wires. Keep their
// essays in the topic feed while preventing a keyless fallback from mistaking an
// argument for a new government or business action. Explicit source metadata and
// an outlet's own /opinion/ path are the only exclusions; ordinary analysis about
// a real dated development can still be assessed by the curator.
export function eventCandidateEligible(article, sources = []) {
  const source = registeredSourceFor(article, sources);
  if (source?.eventEligible === false) return false;
  try { return !/\/opinion(?:\/|$)/i.test(new URL(String(article?.url || '')).pathname); }
  catch { return false; }
}

export function domainTrusted(value) {
  const domain = String(value || '').toLowerCase().replace(/^www\./, '');
  if (TRUSTED_NEWS_DOMAINS.has(domain)) return true;
  for (const trusted of TRUSTED_NEWS_DOMAINS) {
    if (domain.endsWith(`.${trusted}`)) return true;
  }
  return false;
}
