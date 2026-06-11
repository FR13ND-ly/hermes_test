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

// Proxy pentru initializare upload in Storage Privat Hermes S3
app.post('/api/storage/upload/init', async (req: Request, res: Response) => {
  let storageUrl = process.env.HERMES_STORAGE_URL || process.env.HERMES_STORAGE_API_URL || 'http://localhost:8000/api/v1/storage';
  const storageToken = process.env.HERMES_STORAGE_TOKEN || process.env.HERMES_API_KEY || '';

  if (storageUrl.endsWith('/storage')) {
    storageUrl = storageUrl.replace('/storage', '/api/v1/storage');
  }

  try {
    const { fileName, mimeType, sizeBytes } = req.body;

    const response = await axios.post(`${storageUrl}/upload/init`, {
      filePath: `/dsfd/${fileName}`,
      mimeType: mimeType,
      sizeBytes: sizeBytes
    }, {
      headers: { 'Authorization': `Bearer ${storageToken}` }
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('Error in upload/init proxy:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      storageUrl,
      hasToken: !!storageToken
    });
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// Proxy pentru upload-ul binar propriu-zis in Storage Privat Hermes S3
app.post('/api/storage/upload/:id', async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id;
    let storageUrl = process.env.HERMES_STORAGE_URL || process.env.HERMES_STORAGE_API_URL || 'http://localhost:8000/api/v1/storage';

    if (storageUrl.endsWith('/storage')) {
      storageUrl = storageUrl.replace('/storage', '/api/v1/storage');
    }

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

    let storageUrl = process.env.HERMES_STORAGE_URL || process.env.HERMES_STORAGE_API_URL || 'http://localhost:8000/api/v1/storage';
    const storageToken = process.env.HERMES_STORAGE_TOKEN || process.env.HERMES_API_KEY || '';

    if (storageUrl.endsWith('/storage')) {
      storageUrl = storageUrl.replace('/storage', '/api/v1/storage');
    }

    const targetUrl = `${storageUrl}/private/${storageObjectId}?token=${storageToken}`;

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

app.listen(PORT, () => console.log(`🚀 [Hermes All-in-One Backend] pornit nativ pe portul ${PORT}`));