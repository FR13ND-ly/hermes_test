import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DriveService {
  private http = inject(HttpClient);
  
  // Endpoint-urile modulului tău de Rust pentru aplicația activă
  private hermesBaaSUrl = 'https://api.hermes-os.ro/api/v1/apps/APP_ID_AICI';
  private nodeBackendUrl = 'http://localhost:3000/api';
  
  // Token-ul S2S/App generat din tab-ul dedicat din Hermes
  private appApiKey = 'hm_tff.secret32charsAici'; 

  register(email: string, passwordHash: string, fullName: string): Observable<any> {
    const headers = new HttpHeaders().set('X-Hermes-App-Token', this.appApiKey);
    return this.http.post(`${this.hermesBaaSUrl}/register`, {
      email,
      password_hash: passwordHash,
      full_name: fullName
    }, { headers });
  }

  login(email: string, passwordHash: string): Observable<any> {
    const headers = new HttpHeaders().set('X-Hermes-App-Token', this.appApiKey);
    return this.http.post(`${this.hermesBaaSUrl}/login`, { email, password_hash: passwordHash }, { headers });
  }

  getFiles(userId: string): Observable<any[]> {
    const headers = new HttpHeaders().set('x-user-id', userId);
    return this.http.get<any[]>(`${this.nodeBackendUrl}/files`, { headers });
  }

  initUploadSession(fileName: string, mimeType: string, sizeBytes: number): Observable<any> {
    const headers = new HttpHeaders().set('X-Hermes-App-Token', this.appApiKey);
    // Lansează sesiunea de încărcare în Storage-ul tău din Rust via initialize_upload
    return this.http.post(`https://api.hermes-os.ro/api/v1/storage/upload/init`, {
      file_path: `/bucket-test-privat/${fileName}`,
      mime_type: mimeType,
      size_bytes: sizeBytes
    }, { headers });
  }

  uploadBinaryStream(uploadUrl: string, file: File): Observable<any> {
    // Trimite fișierul ca Body binar direct către process_upload_stream din Axum
    return this.http.post(`https://api.hermes-os.ro/api/v1${uploadUrl}`, file, {
      headers: new HttpHeaders().set('Content-Type', file.type)
    });
  }

  saveFileMetadata(userId: string, fileName: string, storageObjectId: string): Observable<any> {
    const headers = new HttpHeaders().set('x-user-id', userId);
    return this.http.post(`${this.nodeBackendUrl}/files`, { fileName, storageObjectId }, { headers });
  }

  getSecureDownloadUrl(userId: string, fileId: string): Observable<any> {
    const headers = new HttpHeaders().set('x-user-id', userId);
    return this.http.get(`${this.nodeBackendUrl}/files/${fileId}/download`, { headers });
  }

  triggerServerlessAnalytics(): Observable<any> {
    return this.http.get(`${this.nodeBackendUrl}/analytics`);
  }
}