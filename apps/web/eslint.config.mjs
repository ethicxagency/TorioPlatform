import base from '@torio/config/eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [...base, ...nextVitals, ...nextTs, { ignores: ['.next/**', 'next-env.d.ts'] }];

export default config;
