// https://vitepress.dev/guide/custom-theme
import type { EnhanceAppContext, Theme } from 'vitepress';

import { NolebaseGitChangelogPlugin } from '@nolebase/vitepress-plugin-git-changelog/client';
import DefaultTheme from 'vitepress/theme';

import { DemoPreview } from '../components';
import SiteLayout from './components/site-layout.vue';
import VbenContributors from './components/vben-contributors.vue';
import { initHmPlugin } from './plugins/hm';

import './styles';

import 'virtual:group-icons.css';
import '@nolebase/vitepress-plugin-git-changelog/client/style.css';

export default {
  async enhanceApp(ctx: EnhanceAppContext) {
    const { app } = ctx;
    app.component('VbenContributors', VbenContributors);
    app.component('DemoPreview', DemoPreview);
    app.use(NolebaseGitChangelogPlugin);

    // 百度统计
    initHmPlugin();

    // Mermaid diagrams (client-side rendering)
    // We intentionally keep it lightweight: Markdown turns ```mermaid into <pre class="mermaid">,
    // then Mermaid renders those blocks on route changes.
    if (!import.meta.env.SSR) {
      // Dynamic import to avoid SSR / build-time DOM dependency issues.
      const mermaidModule = await import('mermaid');
      const mermaid = mermaidModule.default;

      /**
       * Schedule Mermaid rendering after the page DOM has been updated.
       *
       * - `queueMicrotask` ensures we run after current call stack.
       * - `requestAnimationFrame` ensures browser has a chance to paint the new DOM.
       *
       * We intentionally ignore rendering errors so docs navigation never breaks.
       */
      const scheduleMermaidRender = () => {
        queueMicrotask(() => {
          requestAnimationFrame(() => {
            const nodes = [
              ...document.querySelectorAll<HTMLElement>('.mermaid'),
            ];

            // In dev, validate each diagram text and log the exact payload on failure.
            if (import.meta.env.DEV) {
              void (async () => {
                for (const el of nodes) {
                  const text = (el.textContent || '').trim();
                  if (!text) {
                    continue;
                  }

                  try {
                    const ok = await mermaid.parse(text, {
                      suppressErrors: true,
                    });
                    if (ok === false) {
                      console.error('[mermaid] parse failed:', {
                        text,
                        node: el,
                      });
                    }
                  } catch (error) {
                    console.error('[mermaid] parse threw:', error, {
                      text,
                      node: el,
                    });
                  }
                }
              })();
            }

            mermaid.run({ nodes, suppressErrors: true }).catch((error) => {
              if (import.meta.env.DEV) {
                console.error('[mermaid] run failed:', error);
              }
            });
          });
        });
      };

      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'dark',
        });
      } catch {
        // Ignore initialization errors to avoid breaking docs rendering.
      }

      // Preserve existing route hook (if any) and then render Mermaid blocks on each route change.
      const originalAfter = ctx.router.onAfterRouteChange;
      ctx.router.onAfterRouteChange = (to) => {
        originalAfter?.(to);

        scheduleMermaidRender();
      };

      // Render once on initial load as well (some pages may contain Mermaid on first paint).
      scheduleMermaidRender();
    }
  },
  extends: DefaultTheme,
  Layout: SiteLayout,
} satisfies Theme;
