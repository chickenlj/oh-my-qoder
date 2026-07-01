import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const savedInteropFlag = process.env.OMQ_INTEROP_TOOLS_ENABLED;

async function importFresh() {
  vi.resetModules();
  return import('../mcp/omq-tools-server.js');
}

describe('omq-tools-server interop gating', () => {
  beforeEach(() => {
    delete process.env.OMQ_INTEROP_TOOLS_ENABLED;
  });

  afterEach(() => {
    if (savedInteropFlag === undefined) {
      delete process.env.OMQ_INTEROP_TOOLS_ENABLED;
    } else {
      process.env.OMQ_INTEROP_TOOLS_ENABLED = savedInteropFlag;
    }
    vi.resetModules();
  });

  it('does not register interop tools by default', async () => {
    const mod = await importFresh();
    expect(mod.omqToolNames.some((name) => name.includes('interop_'))).toBe(false);
  }, 15000);

  it('registers interop tools when OMQ_INTEROP_TOOLS_ENABLED=1', async () => {
    process.env.OMQ_INTEROP_TOOLS_ENABLED = '1';
    const mod = await importFresh();

    expect(mod.omqToolNames).toContain('mcp__t__interop_send_task');
    expect(mod.omqToolNames).toContain('mcp__t__interop_send_omx_message');
  });

  it('filters interop tools when includeInterop=false', async () => {
    process.env.OMQ_INTEROP_TOOLS_ENABLED = '1';
    const mod = await importFresh();

    const withInterop = mod.getOmqToolNames({ includeInterop: true });
    const withoutInterop = mod.getOmqToolNames({ includeInterop: false });

    expect(withInterop.some((name) => name.includes('interop_'))).toBe(true);
    expect(withoutInterop.some((name) => name.includes('interop_'))).toBe(false);
  });
});
