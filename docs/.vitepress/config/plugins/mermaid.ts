import type { MarkdownRenderer } from 'vitepress';

/**
 * VitePress Markdown-It plugin to render Mermaid diagrams.
 *
 * It transforms:
 *   ```mermaid
 *   graph TD; A-->B;
 *   ```
 * into:
 *   <pre class="mermaid">...</pre>
 *
 * Mermaid will be executed on the client side by theme initialization code.
 */
export function mermaidPlugin(md: MarkdownRenderer) {
  const fence = md.renderer.rules.fence;

  md.renderer.rules.fence = (...args) => {
    const [tokens, idx, options, env, self] = args;
    const token = tokens[idx];

    if (!token) {
      return fence ? fence(tokens, idx, options, env, self) : '';
    }

    const info = (token.info || '').trim();
    if (info !== 'mermaid') {
      return fence
        ? fence(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options);
    }

    const content = md.utils.escapeHtml(token.content);
    return `<pre class="mermaid">${content}</pre>`;
  };
}
