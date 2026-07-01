import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

type IntegrationCandidate = {
  label: string;
  path: string;
};

const INTEGRATION_CANDIDATES: IntegrationCandidate[] = [
  {
    label: 'prompt persistence',
    path: join(process.cwd(), 'src', 'mcp', 'prompt-persistence.ts'),
  },
  {
    label: 'shared interop state',
    path: join(process.cwd(), 'src', 'interop', 'shared-state.ts'),
  },
];

function readCandidateSources(): Array<IntegrationCandidate & { source: string }> {
  return INTEGRATION_CANDIDATES
    .filter((candidate) => existsSync(candidate.path))
    .map((candidate) => ({
      ...candidate,
      source: readFileSync(candidate.path, 'utf-8'),
    }));
}

describe('artifact descriptor low-risk integration', () => {
  it('wires descriptor helpers into both planned low-risk handoff paths', () => {
    const candidates = readCandidateSources();
    expect(candidates.length).toBe(INTEGRATION_CANDIDATES.length);

    const promptPersistence = candidates.find((candidate) => candidate.label === 'prompt persistence');
    const sharedInteropState = candidates.find((candidate) => candidate.label === 'shared interop state');

    expect(promptPersistence?.source).toMatch(/artifact-descriptor\.js/);
    expect(promptPersistence?.source).toMatch(/createArtifactDescriptorFromPath/);
    expect(promptPersistence?.source).toMatch(/describePromptArtifact/);

    expect(sharedInteropState?.source).toMatch(/artifact-descriptor\.js/);
    expect(sharedInteropState?.source).toMatch(/createArtifactHandoff/);
  });

  it('keeps inline-vs-descriptor thresholding explicit at the chosen call site', () => {
    const candidates = readCandidateSources();
    const thresholdMatches = candidates.filter(({ source }) =>
      /(thresholdBytes|INLINE_ARTIFACT|ARTIFACT_INLINE_THRESHOLD|MAX_INLINE)/i.test(source) &&
      /(summary|inlineContent|descriptor)/.test(source),
    );

    expect(thresholdMatches.length).toBeGreaterThan(0);
  });
});
