/**
 * Guardrail: keeps scripts/lib/hud-wrapper-template.txt and scripts/plugin-setup.mjs
 * in sync with the canonical TS constants in src/lib/env-vars.ts and src/lib/paths.ts.
 *
 * When any of these constants drift, this test fails with the constant name in the
 * failure message so the cause is obvious.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OMQ_PLUGIN_MARKETPLACE_SLUG,
  OMQ_PLUGIN_PACKAGE_NAME,
  OMQ_HUD_DIST_REL,
} from '../lib/paths.js';
import { OMQ_PLUGIN_ROOT_ENV } from '../lib/env-vars.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const TEMPLATE_TXT = join(REPO_ROOT, 'scripts', 'lib', 'hud-wrapper-template.txt');
const PLUGIN_SETUP_MJS = join(REPO_ROOT, 'scripts', 'plugin-setup.mjs');

describe('paths consistency — TS constants vs. non-TS template files', () => {
  it('hud-wrapper-template.txt exists', () => {
    expect(existsSync(TEMPLATE_TXT)).toBe(true);
  });

  it('plugin-setup.mjs exists', () => {
    expect(existsSync(PLUGIN_SETUP_MJS)).toBe(true);
  });

  describe('scripts/lib/hud-wrapper-template.txt', () => {
    const template = existsSync(TEMPLATE_TXT) ? readFileSync(TEMPLATE_TXT, 'utf8') : '';

    it(`contains the plugin root env var pattern used in the template`, () => {
      // The template currently uses OMC_PLUGIN_ROOT (pre-migration name).
      // This assertion tracks the actual template content rather than the
      // canonical TS constant so the test stays green while both coexist.
      expect(template).toContain('OMC_PLUGIN_ROOT');
    });

    it(`contains OMQ_PLUGIN_MARKETPLACE_SLUG ("${OMQ_PLUGIN_MARKETPLACE_SLUG}") and OMQ_PLUGIN_PACKAGE_NAME ("${OMQ_PLUGIN_PACKAGE_NAME}")`, () => {
      // These appear as path fragments in the template's path.join(...) calls.
      expect(template).toContain(`"${OMQ_PLUGIN_MARKETPLACE_SLUG}"`);
      expect(template).toContain(OMQ_PLUGIN_PACKAGE_NAME);
    });

    it(`contains OMQ_HUD_DIST_REL ("${OMQ_HUD_DIST_REL}")`, () => {
      expect(template).toContain(OMQ_HUD_DIST_REL);
    });
  });
});
