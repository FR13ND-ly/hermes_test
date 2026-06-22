import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DriveService } from './drive';
import { switchMap } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html'
})
export class App implements OnInit {
  public driveService = inject(DriveService);

  // User session signals (Hermes BaaS: per-app identifier + password)
  identifier = signal('');
  password = signal('');
  userId = signal<string | null>(null);
  userIdentifier = signal<string>('');
  files = signal<any[]>([]);
  activeUploads = signal<any[]>([]);

  // Toast notifications (replace the native alert() popups)
  toasts = signal<{ id: number; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  private toastSeq = 0;

  // Database CRUD signals (test_items table)
  items = signal<any[]>([]);
  itemTitle = signal('');
  itemDesc = signal('');
  editingItemId = signal<string | null>(null);

  // Serverless Knative signals
  serverlessOutput = signal<string>('Funcția Knative este în starea "idle" (0 replici)...');
  serverlessUrl = signal<string>('');
  serverlessMethod = signal<string>('GET');
  serverlessBody = signal<string>('');

  // Volume (PVC) signals
  volumeFiles = signal<any[]>([]);

  // Cron logs signals
  cronExecutions = signal<any[]>([]);

  // Configuration management signals
  showConfig = signal(false);
  baasUrlInput = signal('');
  apiKeyInput = signal('');
  backendUrlInput = signal('');

  // ==========================================
  // TOAST NOTIFICATIONS
  // ==========================================
  notify(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const id = ++this.toastSeq;
    this.toasts.update(t => [...t, { id, message, type }]);
    setTimeout(() => this.dismissToast(id), 4500);
  }

  dismissToast(id: number) {
    this.toasts.update(t => t.filter(x => x.id !== id));
  }

  /** Pull a readable message out of an HTTP error (Hermes returns { error: { message } }). */
  private errMsg(e: any): string {
    return e?.error?.error?.message || e?.error?.error || e?.error?.message || e?.message || 'Eroare necunoscută';
  }

  ngOnInit() {
    // Load local storage overrides if in browser
    if (typeof window !== 'undefined') {
      const savedBackend = localStorage.getItem('hermes_backend_url');
      if (savedBackend) {
        if (savedBackend.includes(window.location.origin)) {
          localStorage.removeItem('hermes_backend_url');
        } else {
          this.driveService.nodeBackendUrl.set(savedBackend);
        }
      }

      const savedBaaS = localStorage.getItem('hermes_baas_url');
      if (savedBaaS) this.driveService.hermesBaaSUrl.set(savedBaaS);

      const savedApiKey = localStorage.getItem('hermes_api_key');
      if (savedApiKey) this.driveService.appApiKey.set(savedApiKey);

      // Load user session if saved
      const savedUserId = localStorage.getItem('hermes_user_id');
      const savedIdentifier = localStorage.getItem('hermes_user_identifier');
      if (savedUserId && savedIdentifier) {
        this.userId.set(savedUserId);
        this.userIdentifier.set(savedIdentifier);
      }
    }

    // Sync input signals
    this.baasUrlInput.set(this.driveService.hermesBaaSUrl());
    this.apiKeyInput.set(this.driveService.appApiKey());
    this.backendUrlInput.set(this.driveService.nodeBackendUrl());

    // Load dynamic variables from Express backend env at runtime
    this.driveService.loadConfig();

    // After loading config, sync inputs again and load initial data
    setTimeout(() => {
      this.baasUrlInput.set(this.driveService.hermesBaaSUrl());
      this.apiKeyInput.set(this.driveService.appApiKey());
      this.backendUrlInput.set(this.driveService.nodeBackendUrl());

      this.loadItems();
      this.loadFiles();
      this.refreshVolumeFiles();
      this.refreshCronStatus();
      if (this.driveService.serverlessUrl()) {
        this.serverlessUrl.set(this.driveService.serverlessUrl());
      }
    }, 1000);
  }

  saveConfig() {
    this.driveService.nodeBackendUrl.set(this.backendUrlInput());
    this.driveService.hermesBaaSUrl.set(this.baasUrlInput());
    this.driveService.appApiKey.set(this.apiKeyInput());

    if (typeof window !== 'undefined') {
      localStorage.setItem('hermes_backend_url', this.backendUrlInput());
      localStorage.setItem('hermes_baas_url', this.baasUrlInput());
      localStorage.setItem('hermes_api_key', this.apiKeyInput());
    }

    // Load new dynamic variables (like storageUrl, storageToken) from the new backend URL
    this.driveService.loadConfig();

    this.notify('Configurație actualizată cu succes!', 'success');
    this.showConfig.set(false);

    // Refresh active data after a short delay to allow config to load
    setTimeout(() => {
      this.loadItems();
      this.loadFiles();
      this.refreshVolumeFiles();
      this.refreshCronStatus();
    }, 500);
  }

  resetConfigToDefaults() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('hermes_backend_url');
      localStorage.removeItem('hermes_baas_url');
      localStorage.removeItem('hermes_api_key');
    }
    window.location.reload();
  }

  // ==========================================
  // DATABASE CRUD (test_items)
  // ==========================================
  loadItems() {
    this.driveService.getItems().subscribe({
      next: (data) => this.items.set(data),
      error: (e) => console.warn('Eroare încărcare items:', e)
    });
  }

  addItem() {
    if (!this.itemTitle().trim()) {
      this.notify('Te rog introdu un titlu.', 'error');
      return;
    }
    this.driveService.createItem(this.itemTitle(), this.itemDesc()).subscribe({
      next: () => {
        this.itemTitle.set('');
        this.itemDesc.set('');
        this.loadItems();
        this.notify('Resursă adăugată în baza de date.', 'success');
      },
      error: (e) => this.notify('Eroare la adăugarea itemului: ' + this.errMsg(e), 'error')
    });
  }

  startEdit(item: any) {
    this.editingItemId.set(item.id);
    this.itemTitle.set(item.title);
    this.itemDesc.set(item.description);
  }

  saveEdit() {
    const id = this.editingItemId();
    if (!id) return;
    this.driveService.updateItem(id, this.itemTitle(), this.itemDesc()).subscribe({
      next: () => {
        this.cancelEdit();
        this.loadItems();
        this.notify('Modificările au fost salvate.', 'success');
      },
      error: (e) => this.notify('Eroare la salvarea modificărilor: ' + this.errMsg(e), 'error')
    });
  }

  cancelEdit() {
    this.editingItemId.set(null);
    this.itemTitle.set('');
    this.itemDesc.set('');
  }

  deleteItem(id: string) {
    if (confirm('Sigur vrei să ștergi acest element din baza de date?')) {
      this.driveService.deleteItem(id).subscribe({
        next: () => {
          this.loadItems();
          this.notify('Element șters.', 'success');
        },
        error: (e) => this.notify('Eroare la ștergerea elementului: ' + this.errMsg(e), 'error')
      });
    }
  }

  // ==========================================
  // BAAS AUTHENTICATION & STORAGE S3
  // ==========================================
  onRegister() {
    if (!this.identifier().trim()) {
      this.notify('Introdu un identificator.', 'error');
      return;
    }
    if (this.password().length < 8) {
      this.notify('Parola trebuie să aibă cel puțin 8 caractere.', 'error');
      return;
    }
    this.driveService.register(this.identifier().trim(), this.password()).subscribe({
      next: () => this.notify('Utilizator înregistrat cu succes în BaaS! Acum te poți autentifica.', 'success'),
      error: (e) => this.notify('Eroare înregistrare: ' + this.errMsg(e), 'error')
    });
  }

  onLogin() {
    this.driveService.login(this.identifier().trim(), this.password()).subscribe({
      next: (res: any) => {
        this.userId.set(res.appUserId);
        this.userIdentifier.set(res.identifier);

        if (typeof window !== 'undefined') {
          localStorage.setItem('hermes_user_id', res.appUserId);
          localStorage.setItem('hermes_user_identifier', res.identifier);
          if (res.accessToken) localStorage.setItem('hermes_access_token', res.accessToken);
          if (res.refreshToken) localStorage.setItem('hermes_refresh_token', res.refreshToken);
        }

        this.password.set('');
        this.notify('Autentificat ca ' + res.identifier, 'success');
        this.loadFiles();
      },
      error: () => this.notify('Autentificare eșuată. Verifică datele introduse.', 'error')
    });
  }

  logout() {
    this.userId.set(null);
    this.userIdentifier.set('');
    this.files.set([]);

    if (typeof window !== 'undefined') {
      localStorage.removeItem('hermes_user_id');
      localStorage.removeItem('hermes_user_identifier');
      localStorage.removeItem('hermes_access_token');
      localStorage.removeItem('hermes_refresh_token');
    }
    this.notify('Te-ai deconectat.', 'info');
  }

  loadFiles() {
    this.driveService.getFiles().subscribe({
      next: (data) => this.files.set(data),
      error: (e) => console.warn('Eroare încărcare fișiere S3:', e)
    });
  }

  onUpload(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;

    // Reset value so the file input can trigger on same file again if canceled
    event.target.value = '';

    const uploadId = Date.now().toString();
    const uploadItem = {
      id: uploadId,
      fileName: file.name,
      status: 'Inițializare...',
      subscription: null as any
    };

    this.activeUploads.update(uploads => [...uploads, uploadItem]);

    const sub = this.driveService.initUploadSession(file.name, file.type, file.size).pipe(
      switchMap((initRes: any) => {
        uploadItem.status = 'Se încarcă...';
        return this.driveService.uploadBinaryStream(initRes.upload_url, file);
      }),
      switchMap((uploadRes: any) => {
        uploadItem.status = 'Salvare metadate...';
        return this.driveService.saveFileMetadata(file.name, uploadRes.id);
      })
    ).subscribe({
      next: () => {
        this.activeUploads.update(uploads => uploads.filter(u => u.id !== uploadId));
        this.notify('Fișier încărcat în Storage privat S3 și salvat în baza de date!', 'success');
        this.loadFiles();
      },
      error: (err) => {
        this.activeUploads.update(uploads => uploads.filter(u => u.id !== uploadId));
        if (err.name !== 'CanceledError' && err.message !== 'canceled' && err.status !== 0) {
          this.notify('Eroare la încărcare: ' + this.errMsg(err), 'error');
        }
      }
    });

    uploadItem.subscription = sub;
  }

  cancelUpload(uploadId: string) {
    const upload = this.activeUploads().find(u => u.id === uploadId);
    if (upload && upload.subscription) {
      upload.subscription.unsubscribe();
      this.activeUploads.update(uploads => uploads.filter(u => u.id !== uploadId));
    }
  }

  deleteS3File(id: string) {
    if (confirm('Sigur vrei să ștergi acest fișier din stocarea S3 și din baza de date?')) {
      this.driveService.deleteFile(id).subscribe({
        next: () => {
          this.notify('Fișierul a fost șters!', 'success');
          this.loadFiles();
        },
        error: (err) => this.notify('Eroare la ștergerea fișierului: ' + this.errMsg(err), 'error')
      });
    }
  }

  downloadFile(fileId: string) {
    this.driveService.getSecureDownloadUrl(fileId).subscribe({
      next: (res: any) => {
        window.open(res.downloadUrl, '_blank');
      },
      error: (err) => this.notify('Eroare descărcare fișier: ' + this.errMsg(err), 'error')
    });
  }

  // ==========================================
  // PERSISTENT VOLUME (PVC)
  // ==========================================
  onVolumeUpload(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;

    this.driveService.uploadFileToVolume(file).subscribe({
      next: () => {
        this.notify('Fișier încărcat direct pe volumul persistent (PVC)!', 'success');
        this.refreshVolumeFiles();
      },
      error: (e) => this.notify('Eroare la scrierea pe volum: ' + this.errMsg(e), 'error')
    });
  }

  deleteVolumeFile(name: string) {
    if (confirm(`Sigur vrei să ștergi fișierul "${name}" de pe volum?`)) {
      this.driveService.deleteVolumeFile(name).subscribe({
        next: () => {
          this.refreshVolumeFiles();
          this.notify('Fișier șters de pe volum.', 'success');
        },
        error: (e) => this.notify('Eroare la ștergerea fișierului de pe volum: ' + this.errMsg(e), 'error')
      });
    }
  }

  refreshVolumeFiles() {
    this.driveService.getVolumeFiles().subscribe({
      next: (files) => this.volumeFiles.set(files),
      error: (e) => console.warn('Nu s-au putut prelua fișierele din volum:', e)
    });
  }

  // ==========================================
  // SERVERLESS & CRON
  // ==========================================
  runServerless() {
    this.serverlessOutput.set('Invocare HTTP Knative... Serverul pornește la rece pod-ul efemer...');
    this.driveService.triggerServerlessTest(
      this.serverlessUrl(),
      this.serverlessMethod(),
      this.serverlessBody()
    ).subscribe({
      next: (data) => {
        console.log('Răspuns serverless:', data);
        this.serverlessOutput.set(JSON.stringify(data, null, 2));
      },
      error: (err) => {
        this.serverlessOutput.set('Eroare invocare serverless: ' + JSON.stringify(err.error || err.message, null, 2));
      }
    });
  }

  refreshCronStatus() {
    this.driveService.getCronStatus().subscribe({
      next: (logs) => this.cronExecutions.set(logs),
      error: (e) => console.warn('Nu s-a putut citi istoricul cron:', e)
    });
  }
}
