import { Pool } from 'pg';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

function getStorageUrl(): string {
  if (process.env.HERMES_STORAGE_URL) return process.env.HERMES_STORAGE_URL;
  if (process.env.HERMES_STORAGE_API_URL) return process.env.HERMES_STORAGE_API_URL;
  
  if (process.env.HERMES_PLATFORM_URL) {
    return `${process.env.HERMES_PLATFORM_URL}/api/v1/storage`;
  }

  let storageUrl = 'http://localhost:8000/api/v1/storage';
  if (storageUrl.endsWith('/storage')) {
    storageUrl = storageUrl.replace('/storage', '/api/v1/storage');
  }
  const isContainer = fs.existsSync('/.dockerenv') || process.env.KUBERNETES_SERVICE_HOST;
  if (isContainer && storageUrl.includes('localhost')) {
    storageUrl = storageUrl.replace('localhost', 'host.docker.internal');
  }
  return storageUrl;
}

async function runCleanup() {
  console.log('🧹 [Cron CLI] Începerea procesului de curățare...');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const oldFiles = await pool.query(
      "SELECT id, storage_object_id FROM user_files WHERE created_at < NOW() - INTERVAL '30 days'"
    );
    console.log(`🧹 [Cron CLI] S-au găsit ${oldFiles.rows.length} fișiere mai vechi de 30 de zile.`);

    const storageUrl = getStorageUrl();
    const storageToken = process.env.HERMES_STORAGE_TOKEN || process.env.HERMES_API_KEY || '';

    for (const file of oldFiles.rows) {
      try {
        await axios.delete(`${storageUrl}/objects/${file.storage_object_id}`, {
          headers: { 'Authorization': `Bearer ${storageToken}` }
        });
        await pool.query('DELETE FROM user_files WHERE id = $1', [file.id]);
        console.log(`✅ [Cron CLI] Fișierul ${file.id} a fost curățat din Storage și DB.`);
      } catch (err: any) {
        console.error(`❌ [Cron CLI] Eroare la curățarea fișierului ${file.id}:`, err.message);
      }
    }

    await pool.query('INSERT INTO cron_executions (purged_count) VALUES ($1)', [oldFiles.rows.length]);
    console.log('✅ [Cron CLI] Procesul de curățare s-a terminat cu succes.');
    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ [Cron CLI] Eroare critică în timpul execuției:', error.message);
    await pool.end();
    process.exit(1);
  }
}

runCleanup();
