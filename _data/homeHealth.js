const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', relativePath), 'utf8'));
  } catch {
    return fallback;
  }
};

module.exports = function () {
  const dataHealth = read('health.json', {});
  const newsHealth = read(path.join('news', 'health.json'), {});
  const dataIssues = (dataHealth.sources || []).filter((source) => source.status === 'failed').length;
  const newsRows = Object.values(newsHealth);
  const newsIssues = newsRows.filter((source) => Number(source.consecutive_failures) > 0).length;
  const checks = [dataHealth.generatedAt, ...newsRows.map((source) => source.last_run)]
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);

  return {
    checkedAt: checks.length ? new Date(Math.min(...checks)).toISOString() : '',
    issues: dataIssues + newsIssues,
    dataIssues,
    newsIssues,
  };
};
