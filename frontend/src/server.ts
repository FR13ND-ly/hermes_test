import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import http from 'node:http';
import https from 'node:https';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Suntem în spatele Traefik: avem încredere în header-ele de proxy.
app.set('trust proxy', true);

/**
 * Proxy same-origin pentru API: /api/* -> backend.
 *
 * Frontend-ul cheamă `${origin}/api/...`, deci serverul Node redirecționează acele
 * cereri către aplicația backend. Ținta e configurabilă LA RUNTIME prin BACKEND_URL
 * (ex. în Hermes: http://hermes-app-backend-main-<hash>:<port>) — dacă recreezi
 * backend-ul, schimbi doar env-ul, fără rebuild la frontend. Body-ul (inclusiv
 * upload-uri) e transmis prin stream (pipe).
 */
const backendUrl = process.env['BACKEND_URL'] || 'http://localhost:3000';
const backendTarget = new URL(backendUrl);
const backendClient = backendTarget.protocol === 'https:' ? https : http;

app.use('/api', (req, res) => {
  const proxyReq = backendClient.request(
    {
      protocol: backendTarget.protocol,
      hostname: backendTarget.hostname,
      port: backendTarget.port || (backendTarget.protocol === 'https:' ? 443 : 80),
      method: req.method,
      // express scoate prefixul /api din req.url când rută e montată pe '/api' — îl readăugăm.
      path: '/api' + req.url,
      headers: { ...req.headers, host: backendTarget.host },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('error', (err) => {
    console.log(backendUrl)
    console.error('[proxy /api] eroare către backend:', err);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Backend indisponibil' });
    }
  });
  req.pipe(proxyReq);
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
