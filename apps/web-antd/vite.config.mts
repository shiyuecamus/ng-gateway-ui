import type { UserConfigExport } from 'vite';

import { defineConfig } from '@vben/vite-config';

const config: UserConfigExport = defineConfig(async (): Promise<any> => {
  return {
    application: {},
    vite: {
      server: {
        proxy: {
          '/branding': {
            changeOrigin: true,
            target: 'http://localhost:5678',
          },
          '/favicon.ico': {
            changeOrigin: true,
            target: 'http://localhost:5678',
          },
          '/api': {
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/api/, ''),
            // mock代理目标地址
            target: 'http://localhost:5678/api',
            ws: true,
          },
        },
      },
    },
  };
}) as unknown as UserConfigExport;

export default config;
