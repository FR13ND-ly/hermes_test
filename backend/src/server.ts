import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const VOLUME_MOUNT_PATH = process.env.VOLUME_MOUNT_PATH || '/data';

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
  await pool.query(createUserFilesTable);
  await pool.query(createCronExecutionsTable);
  console.log('✅ [Postgres] Tabelele user_files și cron_executions au fost verificate/create.');
};
initDatabase().catch(console.error);

// MIDDLEWARE PENTRU BAAS AUTH (Validează x-user-id trimis de Angular)
const requirePermission = (requiredRole: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: 'Missing X-User-Id header.' });
    
    // Extragem rolurile injectate opțional de proxy-ul Hermes
    const userRolesHeader = (req.headers['x-user-roles'] as string) || 'user';
    const roles = userRolesHeader.split(',').map(r => r.trim().toLowerCase());

    if (requiredRole !== 'any' && !roles.includes(requiredRole.toLowerCase())) {
      return res.status(403).json({ error: `Forbidden. Necesită rolul: ${requiredRole}` });
    }
    next();
  };
};

// ==========================================
// RUTE CONFIGURARE
// ==========================================
app.get('/api/config', (req: Request, res: Response) => {
  res.json({
    hermesBaaSUrl: process.env.HERMES_BAAS_URL || 'https://api.hermes-os.ro/api/v1/apps/APP_ID_AICI',
    appApiKey: process.env.HERMES_APP_TOKEN || 'hm_tff.secret32charsAici',
    serverlessUrl: process.env.SERVERLESS_REPORT_URL || '',
    volumePath: VOLUME_MOUNT_PATH
  });
});

// ==========================================
// RUTE DATABASE (user_files)
// ==========================================

// Preluare fișiere din DB parametrizat
app.get('/api/files', requirePermission('any'), async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const result = await pool.query('SELECT * FROM user_files WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Salvare metadate fișier după upload
app.post('/api/files', requirePermission('any'), async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { fileName, storageObjectId } = req.body;
    const query = 'INSERT INTO user_files (user_id, file_name, storage_object_id) VALUES ($1, $2, $3) RETURNING *';
    const result = await pool.query(query, [userId, fileName, storageObjectId]);
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// RUTE STORAGE (Presigned URL via S2S API Key)
// ==========================================
app.get('/api/files/:id/download', requirePermission('any'), async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;
    const userId = req.headers['x-user-id'] as string;

    const fileCheck = await pool.query('SELECT storage_object_id FROM user_files WHERE id = $1 AND user_id = $2', [fileId, userId]);
    if (fileCheck.rows.length === 0) return res.status(403).json({ error: 'Acces interzis.' });

    const storageObjectId = fileCheck.rows[0].storage_object_id;

    // Apelează controllerul tău de Rust din Hermes pentru private download token
    const hermesRes = await axios.post(
      `${process.env.HERMES_STORAGE_API_URL}/buckets/generate-token`, 
      {}, // Corp gol conform metodei tale generate_bucket_token
      { headers: { 'X-Hermes-API-Key': process.env.HERMES_API_KEY } }
    );

    // Întoarcem link-ul virtual generat de calculate_virtual_url din Rust
    const downloadUrl = `${process.env.HERMES_STORAGE_API_URL}/private/${storageObjectId}?token=${hermesRes.data.token}`;
    res.json({ downloadUrl });
  } catch (error: any) {
    res.status(500).json({ error: 'Eroare la securizarea link-ului din Hermes Storage.' });
  }
});

// ==========================================
// RUTE PERSISTENT VOLUMES (PVC)
// ==========================================

// Scriere fișier în volumul persistent
app.post('/api/volume/write', async (req: Request, res: Response) => {
  try {
    const { fileName, content } = req.body;
    if (!fileName) return res.status(400).json({ error: 'Numele fișierului este obligatoriu.' });

    const safeName = path.basename(fileName);
    const filePath = path.join(VOLUME_MOUNT_PATH, safeName);

    await fs.promises.writeFile(filePath, content || '', 'utf8');
    res.json({ success: true, path: filePath });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Citire fișiere din volumul persistent
app.get('/api/volume/read', async (req: Request, res: Response) => {
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

// ==========================================
// RUTE CRON JOB LOGS
// ==========================================

// Webhook invocat de Hermes Cron Engine
app.post('/api/cron/cleanup', async (req: Request, res: Response) => {
  const cronToken = req.headers['x-hermes-cron-token'];
  if (cronToken !== process.env.CRON_SECRET_TOKEN) {
    return res.status(403).json({ error: 'Doar Hermes Cron Engine poate rula această curățare.' });
  }

  try {
    console.log('🧹 [Cron Webhook] Se șterg fișierele mai vechi de 30 de zile...');
    const oldFiles = await pool.query("SELECT id, storage_object_id FROM user_files WHERE created_at < NOW() - INTERVAL '30 days'");

    for (const file of oldFiles.rows) {
      await axios.delete(`${process.env.HERMES_STORAGE_API_URL}/objects/${file.storage_object_id}`, {
        headers: { 'X-Hermes-API-Key': process.env.HERMES_API_KEY }
      });
      await pool.query('DELETE FROM user_files WHERE id = $1', [file.id]);
    }

    // Salvăm execuția cron-ului în DB pentru vizualizare din interfață
    await pool.query('INSERT INTO cron_executions (purged_count) VALUES ($1)', [oldFiles.rows.length]);

    res.json({ success: true, purged: oldFiles.rows.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Preluare istoric rulare crons
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

app.listen(PORT, () => console.log(`🚀 [Hermes All-in-One Backend] pornit nativ pe portul ${PORT}`));