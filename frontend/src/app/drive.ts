import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DriveService {
  private http = inject(HttpClient);
  
  hermesBaaSUrl = signal('https://api.hermes-os.ro/api/v1/apps/APP_ID_AICI');
  nodeBackendUrl = signal('http://localhost:3000/api');
  appApiKey = signal('hm_tff.secret32charsAici'); 
  volumePath = signal('/data');

  constructor() {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      // Daca nu suntem pe porturile locale de dev (4000/4200), folosim origin-ul curent pentru backend API
      if (!origin.includes('localhost:4000') && !origin.includes('localhost:4200') && !origin.includes('127.0.0.1:4000') && !origin.includes('127.0.0.1:4200')) {
        this.nodeBackendUrl.set(`${origin}/api`);
      }
    }
  }

  loadConfig() {
    this.http.get<any>(`${this.nodeBackendUrl()}/config`).subscribe({
      next: (config) => {
        if (config.hermesBaaSUrl) this.hermesBaaSUrl.set(config.hermesBaaSUrl);
        if (config.appApiKey) this.appApiKey.set(config.appApiKey);
        if (config.volumePath) this.volumePath.set(config.volumePath);
      },
      error: (err) => console.warn('Could not load dynamic configuration from backend:', err)
    });
  }

  // BaaS Authentication APIs
  register(email: string, passwordHash: string, fullName: string): Observable<any> {
    return this.http.post(`${this.nodeBackendUrl()}/auth/register`, {
      email,
      password_hash: passwordHash,
      full_name: fullName
    });
  }

  login(email: string, passwordHash: string): Observable<any> {
    return this.http.post(`${this.nodeBackendUrl()}/auth/login`, { email, password_hash: passwordHash });
  }

  // Database CRUD (test_items)
  getItems(): Observable<any[]> {
    return this.http.get<any[]>(`${this.nodeBackendUrl()}/items`);
  }

  createItem(title: string, description: string): Observable<any> {
    return this.http.post(`${this.nodeBackendUrl()}/items`, { title, description });
  }

  updateItem(id: string, title: string, description: string): Observable<any> {
    return this.http.put(`${this.nodeBackendUrl()}/items/${id}`, { title, description });
  }

  deleteItem(id: string): Observable<any> {
    return this.http.delete(`${this.nodeBackendUrl()}/items/${id}`);
  }

  // Storage S3 Module
  getFiles(): Observable<any[]> {
    return this.http.get<any[]>(`${this.nodeBackendUrl()}/files`);
  }

  initUploadSession(fileName: string, mimeType: string, sizeBytes: number): Observable<any> {
    return this.http.post(`${this.nodeBackendUrl()}/storage/upload/init`, {
      fileName,
      mimeType,
      sizeBytes
    });
  }

  uploadBinaryStream(uploadUrl: string, file: File): Observable<any> {
    const fileId = uploadUrl.split('/').pop();
    return this.http.post(`${this.nodeBackendUrl()}/storage/upload/${fileId}`, file, {
      headers: new HttpHeaders().set('Content-Type', file.type || 'application/octet-stream')
    });
  }

  saveFileMetadata(fileName: string, storageObjectId: string): Observable<any> {
    return this.http.post(`${this.nodeBackendUrl()}/files`, { fileName, storageObjectId });
  }

  getSecureDownloadUrl(fileId: string): Observable<any> {
    return this.http.get(`${this.nodeBackendUrl()}/files/${fileId}/download`);
  }

  // Volumes PVC Module
  uploadFileToVolume(file: File): Observable<any> {
    return this.http.post(`${this.nodeBackendUrl()}/volume/upload?name=${encodeURIComponent(file.name)}`, file, {
      headers: new HttpHeaders().set('Content-Type', file.type || 'application/octet-stream')
    });
  }

  getVolumeFiles(): Observable<any[]> {
    return this.http.get<any[]>(`${this.nodeBackendUrl()}/volume/files`);
  }

  deleteVolumeFile(name: string): Observable<any> {
    return this.http.delete(`${this.nodeBackendUrl()}/volume/files/${encodeURIComponent(name)}`);
  }

  // Serverless Module
  triggerServerlessAnalytics(): Observable<any> {
    return this.http.get(`${this.nodeBackendUrl()}/analytics`);
  }

  // Cron Module
  getCronStatus(): Observable<any[]> {
    return this.http.get<any[]>(`${this.nodeBackendUrl()}/cron/status`);
  }
}