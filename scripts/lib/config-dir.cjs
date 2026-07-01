const { homedir } = require('node:os');
const { join, normalize, parse, sep } = require('node:path');

function stripTrailingSep(p) {
  if (!p.endsWith(sep)) {
    return p;
  }

  return p === parse(p).root ? p : p.slice(0, -1);
}

function getQoderConfigDir() {
  const home = homedir();
  const configured = process.env.QODER_CONFIG_DIR?.trim();

  if (!configured) {
    return stripTrailingSep(normalize(join(home, '.qoder')));
  }

  if (configured === '~') {
    return stripTrailingSep(normalize(home));
  }

  if (configured.startsWith('~/') || configured.startsWith('~\\')) {
    return stripTrailingSep(normalize(join(home, configured.slice(2))));
  }

  return stripTrailingSep(normalize(configured));
}

function getOmqConfigDir() {
  return join(getQoderConfigDir(), '.omq');
}

function getUpdateCheckCachePath() {
  return join(getOmqConfigDir(), 'update-check.json');
}

module.exports = { getQoderConfigDir, getOmqConfigDir, getUpdateCheckCachePath };
