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
    const headers = new HttpHeaders().set('X-Hermes-App-Token', this.appApiKey());
    return this.http.post(`${this.hermesBaaSUrl()}/register`, {
      email,
      password_hash: passwordHash,
      full_name: fullName
    }, { headers });
  }

  login(email: string, passwordHash: string): Observable<any> {
    const headers = new HttpHeaders().set('X-Hermes-App-Token', this.appApiKey());
    return this.http.post(`${this.hermesBaaSUrl()}/login`, { email, password_hash: passwordHash }, { headers });
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
  getFiles(userId: string): Observable<any[]> {
    const headers = new HttpHeaders().set('x-user-id', userId);
    return this.http.get<any[]>(`${this.nodeBackendUrl()}/files`, { headers });
  }

  initUploadSession(fileName: string, mimeType: string, sizeBytes: number): Observable<any> {
    const headers = new HttpHeaders().set('X-Hermes-App-Token', this.appApiKey());
    const url = new URL(this.hermesBaaSUrl());
    const origin = url.origin;
    return this.http.post(`${origin}/api/v1/storage/upload/init`, {
      file_path: `/bucket-test-privat/${fileName}`,
      mime_type: mimeType,
      size_bytes: sizeBytes
    }, { headers });
  }

  uploadBinaryStream(uploadUrl: string, file: File): Observable<any> {
    const url = new URL(this.hermesBaaSUrl());
    const origin = url.origin;
    return this.http.post(`${origin}/api/v1${uploadUrl}`, file, {
      headers: new HttpHeaders().set('Content-Type', file.type)
    });
  }

  saveFileMetadata(userId: string, fileName: string, storageObjectId: string): Observable<any> {
    const headers = new HttpHeaders().set('x-user-id', userId);
    return this.http.post(`${this.nodeBackendUrl()}/files`, { fileName, storageObjectId }, { headers });
  }

  getSecureDownloadUrl(userId: string, fileId: string): Observable<any> {
    const headers = new HttpHeaders().set('x-user-id', userId);
    return this.http.get(`${this.nodeBackendUrl()}/files/${fileId}/download`, { headers });
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