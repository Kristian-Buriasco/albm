'use client';

import { ApiReferenceReact } from '@scalar/api-reference-react';

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
        // No CDN font fetches — matches this app's zero-outbound-request rule.
        withDefaultFonts: false,
      }}
    />
  );
}
