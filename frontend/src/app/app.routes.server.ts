import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // SSR at runtime (no prerender at build) — avoids API calls during build.
    path: '**',
    renderMode: RenderMode.Server
  }
];
