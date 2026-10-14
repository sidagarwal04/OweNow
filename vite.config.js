import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function syncDotEnv() {
  for (const file of ['.env', '.env.local']) {
    const fullPath = path.join(process.cwd(), file);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

function netlifyFunctionsDevPlugin() {
  return {
    name: 'owenow-netlify-functions-dev',
    configureServer(server) {
      syncDotEnv();

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();
        syncDotEnv();

        try {
          const host = req.headers.host || 'localhost:5173';
          const fullUrl = new URL(req.url, `http://${host}`);
          const pathname = fullUrl.pathname;

          let fnName = pathname.replace(/^\/api\//, '').split('/')[0];
          if (pathname.startsWith('/api/auth')) {
            fnName = 'auth';
          }

          const chunks = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          }
          const rawBody = Buffer.concat(chunks).toString('utf8');

          const modUrl = new URL(`./netlify/functions/${fnName}.js`, import.meta.url);
          const mod = await import(`${modUrl.href}?t=${Date.now()}`);
          if (typeof mod.handler !== 'function') {
            return next();
          }

          const queryStringParameters = {};
          for (const [k, v] of fullUrl.searchParams.entries()) {
            queryStringParameters[k] = v;
          }

          const result = await mod.handler({
            httpMethod: req.method || 'GET',
            path: pathname,
            rawUrl: fullUrl.toString(),
            headers: req.headers,
            queryStringParameters,
            body: rawBody || null,
          });

          res.statusCode = result?.statusCode || 200;
          if (result?.headers) {
            for (const [hk, hv] of Object.entries(result.headers)) {
              if (hv !== undefined) res.setHeader(hk, hv);
            }
          }
          res.end(result?.body ?? '');
        } catch (err) {
          console.error('[OweNow API dev middleware]', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), netlifyFunctionsDevPlugin()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
