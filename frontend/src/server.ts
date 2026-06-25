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

// We're behind Traefik: trust proxy headers.
app.set('trust proxy', true);

/**
 * Same-origin proxy for API: /api/* -> backend.
 *
 * The frontend calls `${origin}/api/...`, so the Node server forwards those
 * requests to the backend application. The target is configurable at RUNTIME via BACKEND_URL
 * (e.g. in Hermes: http://hermes-app-backend-main-<hash>:<port>) — if you recreate
 * the backend, only change the env, no frontend rebuild needed. The body (including
 * uploads) is streamed via pipe.
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
      // express strips the /api prefix from req.url when route is mounted on '/api' — we re-add it.
      path: '/api' + req.url,
      headers: { ...req.headers, host: backendTarget.host },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('error', (err) => {
    console.error('Proxy error to backend:', process.env['BACKEND_URL']);
    console.log(backendUrl)
    console.error('[proxy /api] error forwarding to backend:', err);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Backend unavailable' });
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
