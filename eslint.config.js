import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/', 'bridge/', 'node_modules/', '**/*.cjs', '**/*.mjs'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: [
      'src/__tests__/hud-agents.test.ts',
      'src/__tests__/hud/context.test.ts',
      'src/__tests__/hud/labels.test.ts',
      'src/__tests__/hud/max-width.test.ts',
      'src/__tests__/hud/payload-warning-render.test.ts',
      'src/__tests__/hud/render-enterprise.test.ts',
      'src/__tests__/hud/render-rate-limits-priority.test.ts',
      'src/__tests__/hud/stale-indicator.test.ts',
      'src/__tests__/hud/state.test.ts',
      'src/__tests__/installer.test.ts',
      'src/autoresearch/__tests__/runtime.test.ts',
      'src/autoresearch/runtime.ts',
      'src/cli/tmux-utils.ts',
      'src/config/plan-output.ts',
      'src/features/model-routing/signals.ts',
      'src/features/notepad-wisdom/extractor.ts',
      'src/hooks/keyword-detector/index.ts',
      'src/hooks/learner/auto-learner.ts',
      'src/hooks/learner/matcher.ts',
      'src/hooks/non-interactive-env/index.ts',
      'src/hooks/notepad/index.ts',
      'src/hooks/permission-handler/index.ts',
      'src/hooks/team-dispatch-hook.ts',
      'src/hooks/todo-continuation/index.ts',
      'src/hud/__tests__/enterprise-cost.test.ts',
      'src/hud/__tests__/hostname.test.ts',
      'src/hud/render.ts',
      'src/hud/sanitize.ts',
      'src/installer/index.ts',
      'src/notifications/formatter.ts',
      'src/notifications/reply-listener.ts',
      'src/notifications/validation.ts',
      'src/team/__tests__/tmux-session.test.ts',
      'src/team/git-worktree.ts',
      'src/team/model-contract.ts',
      'src/team/tmux-session.ts',
      'src/tools/lsp/client.ts',
      'src/utils/string-width.ts',
      'src/verification/tier-selector.ts',
    ],
    rules: {
      'no-control-regex': 'off',
      'no-useless-catch': 'off',
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['src/**/*.test.ts', 'src/**/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'prefer-const': 'off',
    },
  },
  {
    files: ['src/hooks/learner/writer.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
