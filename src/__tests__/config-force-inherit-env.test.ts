/**
 * Tests for OMQ_ROUTING_FORCE_INHERIT environment variable support (issue #1135)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnvConfig } from '../config/loader.js';

describe('OMQ_ROUTING_FORCE_INHERIT env var', () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env.OMQ_ROUTING_FORCE_INHERIT;
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.OMQ_ROUTING_FORCE_INHERIT;
    } else {
      process.env.OMQ_ROUTING_FORCE_INHERIT = originalValue;
    }
  });

  it('sets forceInherit to true when env var is "true"', () => {
    process.env.OMQ_ROUTING_FORCE_INHERIT = 'true';
    const config = loadEnvConfig();
    expect(config.routing?.forceInherit).toBe(true);
  });

  it('sets forceInherit to false when env var is "false"', () => {
    process.env.OMQ_ROUTING_FORCE_INHERIT = 'false';
    const config = loadEnvConfig();
    expect(config.routing?.forceInherit).toBe(false);
  });

  it('does not set forceInherit when env var is not defined', () => {
    delete process.env.OMQ_ROUTING_FORCE_INHERIT;
    const config = loadEnvConfig();
    expect(config.routing?.forceInherit).toBeUndefined();
  });
});
