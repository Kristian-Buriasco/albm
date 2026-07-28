'use client';

import { ApiReferenceReact } from '@scalar/api-reference-react';

// Repaints Scalar's own CSS variables to Albm's palette (see globals.css)
// instead of its default blue theme — `theme: 'none'` ships no preset so
// nothing here is fighting an already-loaded palette.
const ALBM_SCALAR_CSS = `
.light-mode {
  --scalar-background-1: #f3f4f6;
  --scalar-background-2: #ffffff;
  --scalar-background-3: #e4e6e9;
  --scalar-background-accent: #2f6e8f14;

  --scalar-color-1: #14171b;
  --scalar-color-2: #676e76;
  --scalar-color-3: #676e76;

  --scalar-color-accent: #2f6e8f;
  --scalar-border-color: #e4e6e9;

  --scalar-button-1: #14171b;
  --scalar-button-1-hover: #14171bcc;
  --scalar-button-1-color: #f3f4f6;
}
.dark-mode {
  --scalar-background-1: #0d0f12;
  --scalar-background-2: #15181c;
  --scalar-background-3: #24282d;
  --scalar-background-accent: #6fb4ce14;

  --scalar-color-1: #e9ebee;
  --scalar-color-2: #868d96;
  --scalar-color-3: #868d96;

  --scalar-color-accent: #6fb4ce;
  --scalar-border-color: #24282d;

  --scalar-button-1: #e9ebee;
  --scalar-button-1-hover: #e9ebeecc;
  --scalar-button-1-color: #0d0f12;
}
.light-mode, .dark-mode {
  --scalar-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --scalar-radius: 4px;
  --scalar-sidebar-background-1: var(--scalar-background-1);
}
`;

/**
 * Public, unauthenticated API reference. "Try it" hits the real API at this
 * same origin: publish routes take a pasted bearer token; admin/client-facing
 * routes succeed only if the browser already carries a valid session cookie
 * for that scope — same behavior as calling the API directly, no separate
 * auth scaffolding needed here.
 */
export default function ApiDocsClient() {
  return (
    <ApiReferenceReact
      configuration={{
        url: '/openapi.yaml',
        theme: 'none',
        customCss: ALBM_SCALAR_CSS,
        // No CDN font fetches — matches this app's zero-outbound-request rule.
        withDefaultFonts: false,
      }}
    />
  );
}
