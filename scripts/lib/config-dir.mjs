import { homedir } from 'node:os';
import { join, normalize, parse, sep } from 'node:path';

function stripTrailingSep(p) {
  if (!p.endsWith(sep)) {
    return p;
  }

  return p === parse(p).root ? p : p.slice(0, -1);
}

export function getQoderConfigDir() {
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

export function getOmqConfigDir() {
  return join(getQoderConfigDir(), '.omq');
}

export function getUpdateCheckCachePath() {
  return join(getOmqConfigDir(), 'update-check.json');
}
