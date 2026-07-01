import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import {
  extractPullRequestNumbers,
  isReleasePullRequest,
  deriveContributorLogins,
  buildReleaseNoteEntriesFromPullRequests,
  categorizeReleaseNoteEntries,
  generateChangelog,
  generateReleaseBody,
  getLatestTag,
} from '../lib/release-generation.js';

describe('release generation', () => {
  it('extracts a deduped PR set from squash and merge subjects', () => {
    const prNumbers = extractPullRequestNumbers([
      'feat(hud): add configurable call count icon format (#2151)',
      'fix(hud): replace misleading CLI error with installation diagnostic (#2129)',
      'Merge pull request #2146 from chickenlj/issue-2143-omq-launch-followup',
      'Merge pull request #2162 from chickenlj/release/4.10.2',
      'feat(hud): add configurable call count icon format (#2151)',
    ]);

    expect(prNumbers).toEqual(['2151', '2129', '2146', '2162']);
  });

  it('identifies release PRs by release branch or release title', () => {
    expect(isReleasePullRequest({
      title: 'release: 4.10.2',
      headRefName: 'release/4.10.2',
    })).toBe(true);

    expect(isReleasePullRequest({
      title: 'chore(release): bump version to v4.10.2',
      headRefName: null,
    })).toBe(true);

    expect(isReleasePullRequest({
      title: 'fix(hud): replace misleading CLI error with installation diagnostic',
      headRefName: 'fix/hud-cli-diagnostic',
    })).toBe(false);
  });

  it('derives sorted deduped contributor handles from PR and compare metadata', () => {
    const contributors = deriveContributorLogins(
      [
        { author: 'chickenlj' },
        { author: 'blue-int' },
        { author: 'EthanJStark' },
        { author: 'blue-int' },
      ],
      ['tjsingleton', 'DdangJin', 'chickenlj', 'EthanJStark', null],
    );

    expect(contributors).toEqual([
      'blue-int',
      'chickenlj',
      'DdangJin',
      'EthanJStark',
      'tjsingleton',
    ]);
  });

  it('keeps non-conventional PRs in other changes and renders exact PR counts', () => {
    const pullRequests = [
      { number: '2107', title: 'fix(pre-tool-enforcer): deny subagent_type calls whose agent definition has a bare Anthropic model ID on Bedrock', author: 'EthanJStark', headRefName: 'fix/agent-def-model-routing-bedrock' },
      { number: '2108', title: 'chore: enforce dev base branch and gitignore build artifacts', author: 'EthanJStark', headRefName: 'fix/contributor-guardrails' },
      { number: '2122', title: 'fix(state-tools): add skill-active to STATE_TOOL_MODES so cancel can clear it', author: 'tjsingleton', headRefName: 'fix/cancel-clear-skill-active-state' },
      { number: '2127', title: 'fix(hud): show worktree name instead of volatile main repo HEAD', author: 'blue-int', headRefName: 'fix/hud-worktree-name' },
      { number: '2129', title: 'fix(hud): replace misleading CLI error with installation diagnostic', author: 'DdangJin', headRefName: 'fix/hud-cli-diagnostic' },
      { number: '2137', title: 'Fix team tmux pane geometry collapse and bundled agent path resolution', author: 'chickenlj', headRefName: 'fix-issue-2135-pane-geometry' },
      { number: '2144', title: 'fix: preserve existing global CLAUDE.md during setup', author: 'chickenlj', headRefName: 'issue-2143-safe-setup-config' },
      { number: '2146', title: 'fix: follow up #2143 with explicit overwrite choice + omq launch profile', author: 'chickenlj', headRefName: 'issue-2143-omq-launch-followup' },
      { number: '2149', title: 'fix: resolve global HUD npm package lookup outside Node projects', author: 'chickenlj', headRefName: 'fix/issue-2148-hud-global-npm' },
      { number: '2151', title: 'feat(hud): make call-count icon rendering configurable', author: 'chickenlj', headRefName: 'issue-2150-hud-call-count-icons' },
    ];

    const categories = categorizeReleaseNoteEntries(
      buildReleaseNoteEntriesFromPullRequests(pullRequests),
    );
    const changelog = generateChangelog('4.10.2', categories, pullRequests.length);

    expect(changelog).toContain('across **10 merged PRs**.');
    expect(changelog).toContain('### Other Changes');
    expect(changelog).toContain('Fix team tmux pane geometry collapse and bundled agent path resolution');
    expect(changelog).not.toContain('1+ PRs merged');
  });


  it('excludes the current release tag when resolving the previous tag', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'release-tag-test-'));

    try {
      execSync('git init', { cwd: repoDir, stdio: 'ignore' });
      execSync('git config user.name "Test User"', { cwd: repoDir, stdio: 'ignore' });
      execSync('git config user.email "test@example.com"', { cwd: repoDir, stdio: 'ignore' });

      writeFileSync(join(repoDir, 'notes.txt'), 'first\n');
      execSync('git add notes.txt', { cwd: repoDir, stdio: 'ignore' });
      execSync('git commit -m "first"', { cwd: repoDir, stdio: 'ignore' });
      execSync('git tag v4.10.2', { cwd: repoDir, stdio: 'ignore' });

      writeFileSync(join(repoDir, 'notes.txt'), 'second\n');
      execSync('git add notes.txt', { cwd: repoDir, stdio: 'ignore' });
      execSync('git commit -m "second"', { cwd: repoDir, stdio: 'ignore' });
      execSync('git tag v4.11.0', { cwd: repoDir, stdio: 'ignore' });

      expect(getLatestTag({ cwd: repoDir })).toBe('v4.11.0');
      expect(getLatestTag({ cwd: repoDir, excludeTag: 'v4.11.0' })).toBe('v4.10.2');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('assembles a single custom release body with compare link and contributors', () => {
    const body = generateReleaseBody(
      '4.10.2',
      '# oh-my-qoder v4.10.2: Bug Fixes',
      ['blue-int', 'DdangJin', 'chickenlj'],
      'v4.10.1',
    );

    expect(body).toContain('git clone https://github.com/chickenlj/oh-my-qoder.git');
    expect(body).toContain('qodercli plugins install "$(pwd)"');
    expect(body).toContain('git pull && npm run build');
    expect(body).toContain('https://github.com/chickenlj/oh-my-qoder/compare/v4.10.1...v4.10.2');
    expect(body).toContain('@blue-int @DdangJin @chickenlj');
    expect(body.match(/## Contributors/g)).toHaveLength(1);
  });

  it.skip('configures the workflow to use one custom release body source with github auth', () => {
    const workflow = readFileSync(
      resolve(process.cwd(), '.github/workflows/release.yml'),
      'utf-8',
    );

    expect(workflow).toContain('body_path: release-notes.md');
    expect(workflow).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(workflow).not.toContain('generate_release_notes: true');
  });
});
