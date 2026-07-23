// Public-facing names for institutions, agreements and economic indicators.
//
// Source material may use specialist shorthand. The Brief should not make a reader
// decode it. Headlines use ordinary language; supporting copy spells out the thing
// itself. URLs stay untouched; exact official-source labels may get a readable name.

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

function removeAlreadyDefinedAcronyms(text) {
  return text
    .replace(/\bOffice of the U\.?S\.? Trade Representative\s*\(USTR\)/gi, 'US trade office')
    .replace(/\bUS-Mexico-Canada (?:Agreement|trade agreement)\s*\((?:USMCA|T-?MEC)\)/gi,
      'US-Mexico-Canada Agreement')
    .replace(/\bNational Institute of Statistics and Geography\s*\(INEGI\)/gi,
      "Mexico's statistics agency")
    .replace(/\bBanco de M[eé]xico\s*\(Banxico\)/gi, "Mexico's central bank");
}

function tradeAgreementPhrases(text) {
  return text
    .replace(/\bForced-labor complaint over Chinese camera imports tests (?:USMCA|T-?MEC) mechanism\b/gi,
      'Forced-labor complaint over Chinese camera imports tests labor rules in the US-Mexico-Canada trade agreement')
    .replace(/\b(?:USMCA|T-?MEC)\s+auto(?:motive)?\s+rules(?:\s+of\s+origin)?\b/gi,
      'North American auto content rules')
    .replace(/\b(?:USMCA|T-?MEC)\s+(?:joint\s+|annual\s+)?review\s+talks\b/gi,
      'talks to review the US-Mexico-Canada trade agreement')
    .replace(/\b(?:USMCA|T-?MEC)\s+(?:joint\s+|annual\s+)?review\b/gi,
      'review of the US-Mexico-Canada trade agreement')
    .replace(/\b(?:USMCA|T-?MEC)\s+negotiations?\b/gi,
      'negotiations over the US-Mexico-Canada trade agreement')
    .replace(/\b(?:USMCA|T-?MEC)\s+mechanism\b/gi,
      'process under the US-Mexico-Canada trade agreement')
    .replace(/\b(?:USMCA|T-?MEC)\s+members?\b/gi, 'the US, Mexico and Canada')
    .replace(/\b(?:USMCA|T-?MEC)\s+partners?\b/gi, 'the US, Mexico and Canada');
}

function commonTerms(text) {
  return text
    .replace(/\bUS Fed\s*\(FOMC\)\s+monetary-policy decision\b/gi, 'US central bank policy decision')
    .replace(/\bMX\$\s*([\d,.]+)\s*(trillion|billion|million)\b/gi, '$1 $2 pesos')
    .replace(/\bUSTR\b/g, 'US trade office')
    .replace(/\b(?:USMCA|T-?MEC)\b/gi, 'US-Mexico-Canada trade agreement')
    .replace(/\bINEGI\b/g, "Mexico's statistics agency")
    .replace(/\bDOF\b/g, "Mexico's official gazette")
    .replace(/\bBanxico\b/g, "Mexico's central bank")
    .replace(/\bSHCP\b/g, "Mexico's Finance Ministry")
    .replace(/\bCNBV\b/g, "Mexico's banking regulator")
    .replace(/\bICE\b/g, 'US immigration authorities')
    .replace(/\bBIS\b/g, 'international central-bank group')
    .replace(/\bPRI\b/g, 'Institutional Revolutionary Party')
    .replace(/\bEU\b/g, 'European Union')
    .replace(/\bFIBRAs\b/g, 'real estate investment trusts')
    .replace(/\bIMSS\b/g, "Mexico's social security agency")
    .replace(/\bSRE\b/g, "Mexico's Foreign Ministry")
    .replace(/\bSAT\b/g, "Mexico's tax agency")
    .replace(/\bCFE\b/g, "Mexico's state power company")
    .replace(/\bFDI\b/g, 'foreign direct investment')
    .replace(/\bGDP growth\b/gi, 'economic growth')
    .replace(/\bGDP\b/g, 'gross domestic product')
    .replace(/\bCPI\b/g, 'consumer price index')
    .replace(/\bINPC\b/g, "Mexico's consumer price index")
    .replace(/\bIOAE\b/g, 'early economic activity estimate')
    .replace(/\bIGAE\b/g, 'monthly economic activity index')
    .replace(/\bENOE\b/g, 'national labor survey');
}

function tidy(text) {
  return text
    .replace(/\bthe\s+the\b/gi, 'the')
    .replace(/\bUS-Mexico-Canada trade agreement trade pact\b/gi, 'US-Mexico-Canada trade agreement')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceCase(text) {
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (match, lead, letter) => `${lead}${letter.toUpperCase()}`);
}

function plainHeadline(value) {
  let text = tradeAgreementPhrases(removeAlreadyDefinedAcronyms(clean(value)));
  text = commonTerms(text);
  return sentenceCase(tidy(text));
}

function plainExplanation(value) {
  let text = removeAlreadyDefinedAcronyms(clean(value));
  if (!text) return '';

  // Possessives and common sentence shapes need their own pass so the result reads like
  // prose rather than a search-and-replace glossary.
  text = text
    .replace(/\b(?:The\s+)?Recaudaci[oó]n Federal Participable\s*\(RFP\)\s+is\b/gi,
      'Federal revenue sharing is')
    .replace(/\bSection\s+301\s+tariffs\b/gi, 'trade-law tariffs')
    .replace(/\b(?:USMCA|T-?MEC)\s+rules\s+of\s+origin\s+set\s+the\s+regional\s+content\s+vehicles\s+need\s+to\s+qualify\s+for\s+tariff-free\s+treatment\b/gi,
      'The US-Mexico-Canada Agreement sets how much regional content a vehicle needs to qualify for tariff-free treatment')
    .replace(/\b(?:USMCA|T-?MEC)'s\b/gi, "the US-Mexico-Canada Agreement's")
    .replace(/\b(?:the\s+)?(?:USMCA|T-?MEC)\s+rules\s+of\s+origin\b/gi,
      "the US-Mexico-Canada Agreement's regional-content rules")
    .replace(/\bArticle\s+([\d.]+)\s+of\s+(?:USMCA|T-?MEC)\b/gi,
      'Article $1 of the US-Mexico-Canada Agreement')
    .replace(/\bunder\s+(?:USMCA|T-?MEC)\b/gi, 'under the US-Mexico-Canada Agreement')
    .replace(/\bof\s+(?:USMCA|T-?MEC)\b/gi, 'of the US-Mexico-Canada Agreement')
    .replace(/\b(?:USMCA|T-?MEC)\s+(?:joint\s+|annual\s+)?review\s+talks\b/gi,
      'talks to review the US-Mexico-Canada Agreement')
    .replace(/\b(?:USMCA|T-?MEC)\s+(?:joint\s+|annual\s+)?review\b/gi,
      'review of the US-Mexico-Canada Agreement')
    .replace(/\bUSTR's\b/g, "the US trade office's")
    .replace(/\b(?:The|the)\s+USTR\b/g, (match) => match.startsWith('The') ? 'The US trade office' : 'the US trade office')
    .replace(/\bINEGI's\s+IOAE\s+is\s+an\s+early,?\s+unofficial\s+estimate\s+of\s+economic\s+activity\s+published\s+ahead\s+of\b/gi,
      "Mexico's statistics agency publishes an early estimate of economic activity before")
    .replace(/\bINEGI's\s+IOAE\b/g, "Mexico's early economic activity estimate")
    .replace(/\bINEGI's\s+formal\b/g, 'the formal')
    .replace(/\bBanxico's\b/g, "Mexico's central bank's");

  text = tradeAgreementPhrases(text);
  text = commonTerms(text);
  return sentenceCase(tidy(text));
}

function plainSourceName(value) {
  const text = clean(value);
  const exact = {
    USTR: 'US Trade Representative',
    INEGI: "Mexico's statistics agency (INEGI)",
    DOF: "Mexico's official gazette (DOF)",
    Banxico: 'Banco de México',
    SHCP: "Mexico's Finance Ministry",
    CNBV: "Mexico's banking regulator",
    SRE: "Mexico's Foreign Ministry",
  };
  return exact[text] || text;
}

module.exports = { plainExplanation, plainHeadline, plainSourceName };
