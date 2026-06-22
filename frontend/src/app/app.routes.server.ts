import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // SSR la runtime (nu prerender la build) — evită apeluri de API în timpul build-ului.
    path: '**',
    renderMode: RenderMode.Server
  }
];
