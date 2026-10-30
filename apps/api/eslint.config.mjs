import base from '@torio/config/eslint';

export default [
  ...base,
  {
    // Nest resolves constructor injection from emitted decorator metadata, which needs
    // runtime (value) imports. Auto-converting them to `import type` would break DI.
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
];
