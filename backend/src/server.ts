import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// CONFIGURARE POOL POSTGRES NATIV
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Auto-creare tabelă metadate fișiere la startup
const initDatabase = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS user_files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      storage_object_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await pool.query(createTableQuery);
  console.log('✅ [Postgres] Tabela user_files a fost verificată/creată.');
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
// RUTE DATABASE
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
// RUTA CRON JOB (Securizată prin token ales de tine)
// ==========================================
app.post('/api/cron/cleanup', async (req: Request, res: Response) => {
  const cronToken = req.headers['x-hermes-cron-token'];
  if (cronToken !== process.env.CRON_SECRET_TOKEN) {
    return res.status(403).json({ error: 'Doar Hermes Cron Engine poate rula această curățare.' });
  }

  try {
    console.log('🧹 [Cron Webhook] Se șterg fișierele mai vechi de 30 de zile...');
    const oldFiles = await pool.query("SELECT id, storage_object_id FROM user_files WHERE created_at < NOW() - INTERVAL '30 days'");

    for (const file of oldFiles.rows) {
      // Apelează direct delete_object din Rust controller-ul tău
      await axios.delete(`${process.env.HERMES_STORAGE_API_URL}/objects/${file.storage_object_id}`, {
        headers: { 'X-Hermes-API-Key': process.env.HERMES_API_KEY }
      });
      await pool.query('DELETE FROM user_files WHERE id = $1', [file.id]);
    }

    res.json({ success: true, purged: oldFiles.rows.length });
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