import { Pool } from 'pg';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

function getStorageUrl(): string {
  let storageUrl = 'http://localhost:8000/api/v1/storage';
  if (process.env.HERMES_PLATFORM_URL) {
    storageUrl = `${process.env.HERMES_PLATFORM_URL}/api/v1/storage`;
  }
  const isContainer = fs.existsSync('/.dockerenv') || process.env.KUBERNETES_SERVICE_HOST;
  if (isContainer && storageUrl.includes('localhost')) {
    storageUrl = storageUrl.replace('localhost', 'host.docker.internal');
  }
  return storageUrl;
}

function getStorageCredentials() {
  const secretKey = process.env.HERMES_STORAGE_SECRET_KEY || process.env.HERMES_APP_TOKEN || '';
  const appId = process.env.HERMES_STORAGE_APP_ID || '';
  return { appId, secretKey };
}

async function runCleanup() {
  console.log('🧹 [Cron CLI] Starting cleanup process...');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const oldFiles = await pool.query(
      "SELECT id, storage_object_id FROM user_files WHERE created_at < NOW() - INTERVAL '30 days'"
    );
    console.log(`🧹 [Cron CLI] Found ${oldFiles.rows.length} files older than 30 days.`);

    const storageUrl = getStorageUrl();
    const { appId: storageAppId, secretKey: storageSecretKey } = getStorageCredentials();

    for (const file of oldFiles.rows) {
      try {
        const headers: any = { 'Authorization': `Bearer ${storageSecretKey}` };
        if (storageAppId) {
          headers['x-app-id'] = storageAppId;
        }
        await axios.delete(`${storageUrl}/objects/${file.storage_object_id}`, {
          headers
        });
        await pool.query('DELETE FROM user_files WHERE id = $1', [file.id]);
        console.log(`✅ [Cron CLI] File ${file.id} cleaned from Storage and DB.`);
      } catch (err: any) {
        console.error(`❌ [Cron CLI] Error cleaning file ${file.id}:`, err.message);
      }
    }

    await pool.query('INSERT INTO cron_executions (purged_count) VALUES ($1)', [oldFiles.rows.length]);
    console.log('✅ [Cron CLI] Cleanup process completed successfully.');
    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ [Cron CLI] Critical error during execution:', error.message);
    await pool.end();
    process.exit(1);
  }
}

runCleanup();
