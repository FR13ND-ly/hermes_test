import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const VOLUME_MOUNT_PATH = process.env.VOLUME_MOUNT_PATH || '/data';

function getStorageUrl(): string {
  if (process.env.HERMES_STORAGE_URL) return process.env.HERMES_STORAGE_URL;
  if (process.env.HERMES_STORAGE_API_URL) return process.env.HERMES_STORAGE_API_URL;
  if (process.env.HERMES_PLATFORM_URL) {
    return `${process.env.HERMES_PLATFORM_URL}/api/v1/storage`;
  }
  return 'http://localhost:8000/api/v1/storage';
}

function getPlatformOrigin(): string {
  if (process.env.HERMES_PLATFORM_URL) {
    return process.env.HERMES_PLATFORM_URL;
  }
  const url = process.env.HERMES_BAAS_URL || process.env.HERMES_AUTH_API_URL || getStorageUrl();
  try {
    return new URL(url).origin;
  } catch (e) {
    return 'http://localhost:8000';
  }
}

function getMainDatabaseUrl(): string {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return 'postgresql://postgres:root@127.0.0.1:5432/hermes_db';
  try {
    const urlStr = dbUrl.startsWith('postgresql://') ? dbUrl : 'postgresql://' + dbUrl;
    const parsed = new URL(urlStr);
    
    const isContainer = fs.existsSync('/.dockerenv') || process.env.KUBERNETES_SERVICE_HOST;
    if (isContainer) {
      parsed.hostname = 'host.docker.internal';
    } else {
      parsed.hostname = '127.0.0.1';
    }
    parsed.port = '5432';
    parsed.username = 'postgres';
    parsed.password = 'root';
    parsed.pathname = '/hermes_db';
    return parsed.toString();
  } catch (e) {
    return 'postgresql://postgres:root@127.0.0.1:5432/hermes_db';
  }
}

const mainDbPool = new Pool({ connectionString: getMainDatabaseUrl() });

// ==========================================
// REDIS (bază de date Redis legată la proiect)
// ==========================================
// Hermes publică connection string-ul unui Redis legat ca `redis://:parolă@host:6379`
// în env pool — sub DATABASE_URL sau <NUME>_DATABASE_URL, în funcție de cum e numit.
// Scanăm valorile din env după prima care arată a Redis, ca să-l găsim indiferent de
// numele cheii (sau REDIS_URL explicit, pentru dev local).
function getRedisUrl(): string | null {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  for (const value of Object.values(process.env)) {
    if (typeof value === 'string' && value.startsWith('redis://')) return value;
  }
  return null;
}

let redisClient: RedisClientType | null = null;
async function getRedis(): Promise<RedisClientType> {
  let url = getRedisUrl();
  if (!url) {
    throw new Error('Niciun Redis legat: nu am găsit un env redis:// (leagă o bază Redis la proiect).');
  }
  if (url.startsWith('redis://:')) {
    url = url.replace('redis://:', 'redis://default:');
  }
  if (!redisClient) {
    redisClient = createClient({ url });
    redisClient.on('error', (e) => console.error('⚠️ [Redis] Eroare conexiune:', (e as Error).message));
  }
  if (!redisClient.isOpen) await redisClient.connect();
  return redisClient;
}

// Maschează parola din connection string pentru afișare în UI.
function maskRedisUrl(url: string | null): string | null {
  return url ? url.replace(/(redis:\/\/[^:]*:)[^@]*(@)/, '$1***$2') : null;
}

interface BaaSConfig {
  appId: string;
  secret: string | null;
  apiKey: string | null;
}

let resolvedBaaSConfig: BaaSConfig | null = null;

async function getBaaSConfig(): Promise<BaaSConfig> {
  if (resolvedBaaSConfig) return resolvedBaaSConfig;

  // Start with default env vars
  let appId = process.env.HERMES_AUTH_APP_ID || (process.env.HERMES_APP_ID && !process.env.HERMES_APP_ID.startsWith('hsk_') ? process.env.HERMES_APP_ID : '');
  let secret = process.env.HERMES_AUTH_SECRET || null;
  let apiKey = process.env.HERMES_APP_TOKEN || null;

  try {
    const appRes = await mainDbPool.query(
      "SELECT project_id, id FROM apps WHERE name = $1 OR name = $2 LIMIT 1",
      ['backend', 'hermes_test']
    );
    if (appRes.rows.length > 0) {
      const projectId = appRes.rows[0].project_id;
      const appUuid = appRes.rows[0].id;
      if (!appId) {
        appId = appUuid;
      }

      const baasRes = await mainDbPool.query(
        "SELECT id FROM baas_services WHERE project_id = $1 LIMIT 1",
        [projectId]
      );
      if (baasRes.rows.length > 0) {
        const baasId = baasRes.rows[0].id;

        const appIdKeyRes = await mainDbPool.query(
          "SELECT key FROM project_env_variables WHERE source_id = $1 AND source = 'baas_auth' AND is_secret = false LIMIT 1",
          [baasId]
        );
        if (appIdKeyRes.rows.length > 0) {
          const key = appIdKeyRes.rows[0].key;
          if (process.env[key]) {
            appId = process.env[key]!;
          }
        } else {
          appId = baasId;
        }

        const secretKeyRes = await mainDbPool.query(
          "SELECT key FROM project_env_variables WHERE source_id = $1 AND source = 'baas_auth' AND is_secret = true LIMIT 1",
          [baasId]
        );
        if (secretKeyRes.rows.length > 0) {
          const key = secretKeyRes.rows[0].key;
          if (process.env[key]) {
            secret = process.env[key]!;
          }
        }

        const apiKeyKeyRes = await mainDbPool.query(
          "SELECT p.key FROM project_env_variables p JOIN app_api_keys a ON a.id = p.source_id WHERE a.baas_id = $1 AND p.source = 'baas' AND p.is_secret = true LIMIT 1",
          [baasId]
        );
        if (apiKeyKeyRes.rows.length > 0) {
          const key = apiKeyKeyRes.rows[0].key;
          if (process.env[key]) {
            apiKey = process.env[key]!;
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`⚠️ [BaaS Config] Nu s-a putut interoga baza de date centrala pentru configurarea BaaS:`, err.message);
  }

  resolvedBaaSConfig = { appId, secret, apiKey };
  console.log(`ℹ️ [BaaS Config] Resolved: appId=${appId}, secret=${secret ? '***' : 'null'}, apiKey=${apiKey ? '***' : 'null'}`);
  return resolvedBaaSConfig;
}

async function getAppId(): Promise<string> {
  const config = await getBaaSConfig();
  return config.appId;
}

app.use(cors());
app.use(express.json());

// Ensure the volume path exists
if (!fs.existsSync(VOLUME_MOUNT_PATH)) {
  try {
    fs.mkdirSync(VOLUME_MOUNT_PATH, { recursive: true });
    console.log(`✅ [Volume] Directorul ${VOLUME_MOUNT_PATH} a fost creat.`);
  } catch (err) {
    console.error(`❌ [Volume] Eroare la crearea directorului ${VOLUME_MOUNT_PATH}:`, err);
  }
}

// CONFIGURARE POOL POSTGRES NATIV
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Auto-creare tabele la startup
const initDatabase = async () => {
  const createUserFilesTable = `
    CREATE TABLE IF NOT EXISTS user_files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      storage_object_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  const createCronExecutionsTable = `
    CREATE TABLE IF NOT EXISTS cron_executions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      purged_count INT NOT NULL
    );
  `;
  const createTestItemsTable = `
    CREATE TABLE IF NOT EXISTS test_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await pool.query(createUserFilesTable);
  await pool.query(createCronExecutionsTable);
  await pool.query(createTestItemsTable);
  console.log('✅ [Postgres] Toate tabelele necesare au fost verificate/create.');
};
// Pod-ul poate porni înainte ca rutarea de rețea către serviciul DB să fie
// complet gata (race la boot în k8s). Reîncercăm cu backoff în loc să murim la
// prima eroare — altfel un blip tranzitoriu rămâne "lipit" până la un redeploy.
const runInitWithRetry = async () => {
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await initDatabase();
      return;
    } catch (err: any) {
      const delayMs = Math.min(1000 * attempt, 5000);
      console.warn(
        `⏳ [Postgres] Conexiune indisponibilă (încercarea ${attempt}/${maxAttempts}, ${err?.code || err?.message}). Reîncerc în ${delayMs}ms...`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.error('❌ [Postgres] Nu m-am putut conecta/inițializa DB-ul după toate încercările.');
};
runInitWithRetry();

// MIDDLEWARE PENTRU BAAS AUTH (Validează tokenul JWT sau x-user-id ca fallback)
const requirePermission = (requiredRole: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    let userId: string | null = null;
    let roles: string[] = [];

    // 1. Încercăm validarea pe baza token-ului JWT din header-ul Authorization
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const config = await getBaaSConfig();
      const secret = config.secret;
      if (secret) {
        try {
          const decoded: any = jwt.verify(token, secret);
          userId = decoded.sub || decoded.userId;
          roles = decoded.roles || [];
        } catch (err) {
          console.warn('⚠️ [BaaS Auth] Token invalid sau expirat:', err);
          return res.status(401).json({ error: 'Token invalid sau expirat.' });
        }
      } else {
        console.warn('⚠️ [BaaS Auth] HERMES_AUTH_SECRET/custom secret nu este definit. Se trece la fallback pe headere.');
      }
    }

    // 2. Fallback pe headerele x-user-id / x-user-roles (pentru dev local sau compatibilitate)
    if (!userId) {
      userId = req.headers['x-user-id'] as string;
      const userRolesHeader = (req.headers['x-user-roles'] as string) || 'user';
      roles = userRolesHeader.split(',').map(r => r.trim().toLowerCase());
    }

    if (!userId) {
      return res.status(401).json({ error: 'Missing X-User-Id or invalid Authorization Bearer token.' });
    }

    if (requiredRole !== 'any' && !roles.includes(requiredRole.toLowerCase())) {
      return res.status(403).json({ error: `Forbidden. Necesită rolul: ${requiredRole}` });
    }
    next();
  };
};

// ==========================================
// RUTE CONFIGURARE
// ==========================================
app.get('/api/config', async (req: Request, res: Response) => {
  const config = await getBaaSConfig();
  const hermesBaaSUrl = process.env.HERMES_BAAS_URL || 
    (process.env.HERMES_PLATFORM_URL 
      ? `${process.env.HERMES_PLATFORM_URL}/api/v1/apps/${config.appId}` 
      : `https://api.hermes-os.ro/api/v1/apps/${config.appId || 'APP_ID_AICI'}`);
  res.json({
    hermesBaaSUrl,
    appApiKey: config.apiKey || 'hm_tff.secret32charsAici',
    serverlessUrl: process.env.SERVERLESS_REPORT_URL || '',
    volumePath: VOLUME_MOUNT_PATH
  });
});

// ==========================================
// CRUD DATABASE - test_items
// ==========================================
app.get('/api/items', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM test_items ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/items', async (req: Request, res: Response) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Titlul este obligatoriu.' });
    const result = await pool.query(
      'INSERT INTO test_items (title, description) VALUES ($1, $2) RETURNING *',
      [title, description || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/items/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Titlul este obligatoriu.' });
    const result = await pool.query(
      'UPDATE test_items SET title = $1, description = $2 WHERE id = $3 RETURNING *',
      [title, description || '', id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Resursa nu a fost găsită.' });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/items/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM test_items WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Resursa nu a fost găsită.' });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// RUTE REDIS (cheie-valoare, prefix test:)
// ==========================================
// Stare conexiune + ce URL folosim (cu parola mascată).
app.get('/api/redis/status', async (req: Request, res: Response) => {
  try {
    const client = await getRedis();
    const pong = await client.ping();
    res.json({ connected: true, ping: pong, url: maskRedisUrl(getRedisUrl()) });
  } catch (error: any) {
    res.status(503).json({ connected: false, error: error.message, url: maskRedisUrl(getRedisUrl()) });
  }
});

// Listează cheile de test (cu valoare + TTL rămas).
app.get('/api/redis/keys', async (req: Request, res: Response) => {
  try {
    const client = await getRedis();
    const keys = await client.keys('test:*');
    const out = [];
    for (const k of keys) {
      out.push({ key: k.replace(/^test:/, ''), value: await client.get(k), ttl: await client.ttl(k) });
    }
    out.sort((a, b) => a.key.localeCompare(b.key));
    res.json(out);
  } catch (error: any) {
    res.status(503).json({ error: error.message });
  }
});

// Scrie o cheie (TTL opțional, în secunde).
app.post('/api/redis/keys', async (req: Request, res: Response) => {
  try {
    const { key, value, ttl } = req.body;
    if (!key) return res.status(400).json({ error: 'Cheia este obligatorie.' });
    const client = await getRedis();
    const seconds = Number(ttl);
    if (Number.isFinite(seconds) && seconds > 0) {
      await client.set(`test:${key}`, String(value ?? ''), { EX: seconds });
    } else {
      await client.set(`test:${key}`, String(value ?? ''));
    }
    res.status(201).json({ success: true, key, value: String(value ?? ''), ttl: seconds > 0 ? seconds : null });
  } catch (error: any) {
    res.status(503).json({ error: error.message });
  }
});

// Șterge o cheie de test.
app.delete('/api/redis/keys/:key', async (req: Request, res: Response) => {
  try {
    const client = await getRedis();
    const deleted = await client.del(`test:${req.params.key}`);
    res.json({ success: true, deleted });
  } catch (error: any) {
    res.status(503).json({ error: error.message });
  }
});

// ==========================================
// RUTE STORAGE S3 (user_files)
// ==========================================
app.get('/api/files', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM user_files ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/files', async (req: Request, res: Response) => {
  try {
    const { fileName, storageObjectId } = req.body;
    const query = 'INSERT INTO user_files (user_id, file_name, storage_object_id) VALUES ($1, $2, $3) RETURNING *';
    const result = await pool.query(query, ['00000000-0000-0000-0000-000000000000', fileName, storageObjectId]);
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function getBucketCredentials() {
  let appId = '';
  let secretKey = '';

  for (const key of Object.keys(process.env)) {
    if (key.startsWith('BUCKET_') && key.endsWith('_SECRET_KEY')) {
      const slug = key.substring(7, key.length - 11).toUpperCase();
      secretKey = process.env[key] || '';
      appId = process.env[`BUCKET_${slug}_APP_ID`] || '';
      break;
    }
  }

  if (!secretKey) {
    secretKey = process.env.HERMES_STORAGE_SECRET_KEY || process.env.HERMES_SECRET_KEY || process.env.HERMES_STORAGE_TOKEN || process.env.HERMES_API_KEY || '';
    const envAppId = process.env.HERMES_STORAGE_APP_ID || process.env.HERMES_APP_ID || '';
    if (envAppId.startsWith('hsk_') || process.env.HERMES_STORAGE_APP_ID) {
      appId = envAppId;
    }
  }

  return { appId, secretKey };
}

app.delete('/api/files/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 1. Obținem storage_object_id din baza de date
    const fileResult = await pool.query('SELECT storage_object_id FROM user_files WHERE id = $1', [id]);
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Fișierul nu a fost găsit în baza de date.' });
    }

    const storageObjectId = fileResult.rows[0].storage_object_id;
    const storageUrl = getStorageUrl();
    const { appId: storageAppId, secretKey: storageSecretKey } = getBucketCredentials();

    // 2. Trimitem cererea DELETE către platforma de stocare S3
    try {
      await axios.delete(`${storageUrl}/objects/${storageObjectId}`, {
        headers: {
          'x-hermes-app-id': storageAppId,
          'x-hermes-secret-key': storageSecretKey,
          'Authorization': `Bearer ${storageSecretKey}`
        }
      });
      console.log(`✅ [Storage] Obiectul S3 ${storageObjectId} a fost șters din platformă.`);
    } catch (storageErr: any) {
      console.error(`⚠️ [Storage] Nu s-a putut șterge obiectul S3 ${storageObjectId} din platformă:`, storageErr.response?.data || storageErr.message);
      // Chiar dacă ștergerea din S3 eșuează (ex: 404 sau deja șters), continuăm cu ștergerea din DB pentru a nu rămâne blocați
    }

    // 3. Ștergem înregistrarea din baza de date locală
    await pool.query('DELETE FROM user_files WHERE id = $1', [id]);
    res.json({ success: true, message: 'Fișierul a fost șters cu succes.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Proxy pentru initializare upload in Storage Privat Hermes S3
app.post('/api/storage/upload/init', async (req: Request, res: Response) => {
  const storageUrl = getStorageUrl();
  const { appId: storageAppId, secretKey: storageSecretKey } = getBucketCredentials();

  // Determinam dinamic slug-ul bucket-ului din mediul proiectului (ex: BUCKET_FSAD_SECRET_KEY -> fsad)
  let bucketSlug = 'dsfd';
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('BUCKET_') && key.endsWith('_SECRET_KEY')) {
      bucketSlug = key.substring(7, key.length - 11).toLowerCase();
      break;
    }
  }

  console.log('Incoming init request body:', req.body);

  try {
    const { fileName, mimeType, sizeBytes } = req.body;

    const response = await axios.post(`${storageUrl}/upload/init`, {
      filePath: `/${bucketSlug}/${fileName}`,
      mimeType: mimeType,
      sizeBytes: sizeBytes
    }, {
      headers: {
        'x-hermes-app-id': storageAppId,
        'x-hermes-secret-key': storageSecretKey,
        'Authorization': `Bearer ${storageSecretKey}`
      }
    });

    const data = response.data;
    res.json({
      fileId: data.fileId || data.file_id,
      file_id: data.file_id || data.fileId,
      status: data.status,
      uploadUrl: data.uploadUrl || data.upload_url,
      upload_url: data.upload_url || data.uploadUrl
    });
  } catch (error: any) {
    const errorDetails: any = {};
    if (error) {
      Object.getOwnPropertyNames(error).forEach((key) => {
        errorDetails[key] = error[key];
      });
    }
    console.error('Error in upload/init proxy details:', errorDetails);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message || 'Unknown proxy error' });
  }
});

// Proxy pentru upload-ul binar propriu-zis in Storage Privat Hermes S3
app.post('/api/storage/upload/:id', async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id;
    const storageUrl = getStorageUrl();

    const url = new URL(storageUrl);
    const storageOrigin = url.origin;
    const targetUrl = `${storageOrigin}/api/v1/storage/upload/${uploadId}`;

    const headers: any = {
      'Content-Type': req.headers['content-type'] || 'application/octet-stream'
    };

    // Forward the binary stream directly using axios
    const response = await axios.post(targetUrl, req, {
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      responseType: 'json'
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('Error in binary upload proxy:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

app.get('/api/files/:id/download', async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;
    const host = req.get('host');
    const protocol = req.protocol;
    const downloadUrl = `${protocol}://${host}/api/storage/download/${fileId}`;
    res.json({ downloadUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Proxy pentru download securizat si privat din Storage Privat Hermes S3
app.get('/api/storage/download/:id', async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;

    const fileCheck = await pool.query('SELECT storage_object_id FROM user_files WHERE id = $1', [fileId]);
    if (fileCheck.rows.length === 0) return res.status(404).json({ error: 'Fișierul nu a fost găsit.' });

    const storageObjectId = fileCheck.rows[0].storage_object_id;

    const storageUrl = getStorageUrl();
    const { appId: storageAppId, secretKey: storageSecretKey } = getBucketCredentials();

    const targetUrl = `${storageUrl}/private/${storageObjectId}?token=${storageSecretKey}&app_id=${storageAppId}&secret_key=${storageSecretKey}`;

    const response = await axios.get(targetUrl, { responseType: 'stream' });

    if (response.headers['content-type']) res.setHeader('Content-Type', String(response.headers['content-type']));
    if (response.headers['content-length']) res.setHeader('Content-Length', String(response.headers['content-length']));
    if (response.headers['content-disposition']) res.setHeader('Content-Disposition', String(response.headers['content-disposition']));

    response.data.pipe(res);
  } catch (error: any) {
    console.error('Error in download proxy:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// Proxy pentru register in BaaS-ul platformei Hermes
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body;
    const appId = await getAppId();
    const config = await getBaaSConfig();
    const platformOrigin = getPlatformOrigin();
    const targetUrl = `${platformOrigin}/api/v1/baas/${appId}/auth/register`;

    const response = await axios.post(targetUrl, {
      identifier,
      password
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey || ''}`
      }
    });

    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error('Error in register proxy:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// Proxy pentru login in BaaS-ul platformei Hermes
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body;
    const appId = await getAppId();
    const config = await getBaaSConfig();
    const platformOrigin = getPlatformOrigin();
    const targetUrl = `${platformOrigin}/api/v1/baas/${appId}/auth/login`;

    const response = await axios.post(targetUrl, {
      identifier,
      password
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey || ''}`
      }
    });

    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error('Error in login proxy:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// ==========================================
// RUTE PERSISTENT VOLUMES (PVC)
// ==========================================
app.post('/api/volume/upload', async (req: Request, res: Response) => {
  try {
    const fileName = req.query.name as string;
    if (!fileName) return res.status(400).json({ error: 'Numele fișierului lipsește.' });

    const safeName = path.basename(fileName);
    const filePath = path.join(VOLUME_MOUNT_PATH, safeName);

    const writeStream = fs.createWriteStream(filePath);
    req.pipe(writeStream);

    req.on('end', () => {
      res.json({ success: true, name: safeName, path: filePath });
    });

    req.on('error', (err) => {
      res.status(500).json({ error: 'Eroare la scrierea pe volum: ' + err.message });
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/volume/files', async (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(VOLUME_MOUNT_PATH)) {
      return res.json([]);
    }

    const files = await fs.promises.readdir(VOLUME_MOUNT_PATH);
    const fileDataList = [];

    for (const f of files) {
      const filePath = path.join(VOLUME_MOUNT_PATH, f);
      const stat = await fs.promises.stat(filePath);
      if (stat.isFile()) {
        const content = await fs.promises.readFile(filePath, 'utf8');
        fileDataList.push({
          name: f,
          size: stat.size,
          content: content.length > 200 ? content.substring(0, 200) + '...' : content,
          modifiedAt: stat.mtime
        });
      }
    }
    res.json(fileDataList);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/volume/files/:name', async (req: Request, res: Response) => {
  try {
    const fileName = req.params.name;
    const safeName = path.basename(fileName);
    const filePath = path.join(VOLUME_MOUNT_PATH, safeName);

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      res.json({ success: true, message: `Fișierul ${safeName} a fost șters.` });
    } else {
      res.status(404).json({ error: 'Fișierul nu există pe volum.' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// RUTE CRON
// ==========================================
app.post('/api/cron/cleanup', async (req: Request, res: Response) => {
  try {
    console.log('🧹 [Cron Webhook] Se șterg fișierele mai vechi de 30 de zile...');
    const oldFiles = await pool.query("SELECT id, storage_object_id FROM user_files WHERE created_at < NOW() - INTERVAL '30 days'");

    const storageUrl = getStorageUrl();
    const { appId: storageAppId, secretKey: storageSecretKey } = getBucketCredentials();
    for (const file of oldFiles.rows) {
      await axios.delete(`${storageUrl}/objects/${file.storage_object_id}`, {
        headers: {
          'x-hermes-app-id': storageAppId,
          'x-hermes-secret-key': storageSecretKey,
          'Authorization': `Bearer ${storageSecretKey}`
        }
      });
      await pool.query('DELETE FROM user_files WHERE id = $1', [file.id]);
    }

    await pool.query('INSERT INTO cron_executions (purged_count) VALUES ($1)', [oldFiles.rows.length]);
    res.json({ success: true, purged: oldFiles.rows.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/cron/status', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM cron_executions ORDER BY run_at DESC LIMIT 10');
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// RUTA SERVERLESS KNATIVE PROXY
// ==========================================
app.get('/api/analytics', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(process.env.SERVERLESS_REPORT_URL || '', { timeout: 4000 });
    res.json(response.data);
  } catch (error) {
    res.status(503).json({ message: 'Funcția Knative este la rece (0 replici) și se trezește acum...' });
  }
});

app.post('/api/analytics/test', async (req: Request, res: Response) => {
  const { url, method, body } = req.body;
  if (!url) return res.status(400).json({ error: 'URL-ul este obligatoriu.' });

  let targetUrl = url;
  if (targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1')) {
    const isContainer = fs.existsSync('/.dockerenv') || process.env.KUBERNETES_SERVICE_HOST;
    if (isContainer) {
      targetUrl = targetUrl.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');
      console.log(`ℹ️ [Serverless Proxy] Rescris ${url} -> ${targetUrl} din container.`);
    }
  }

  try {
    const response = await axios({
      method: method || 'GET',
      url: targetUrl,
      data: body || {},
      timeout: 10000
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

app.listen(PORT, () => console.log(`🚀 [Hermes All-in-One Backend] pornit nativ pe portul ${PORT}`));