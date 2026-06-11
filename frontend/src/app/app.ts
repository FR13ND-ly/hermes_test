import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DriveService } from './drive';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html'
})
export class App implements OnInit {
  public driveService = inject(DriveService);

  // User session signals (for S3 storage BaaS testing)
  email = signal('');
  password = signal('');
  fullName = signal('');
  userId = signal<string | null>(null);
  userEmail = signal<string>('');
  files = signal<any[]>([]);

  // Database CRUD signals (test_items table)
  items = signal<any[]>([]);
  itemTitle = signal('');
  itemDesc = signal('');
  editingItemId = signal<string | null>(null);

  // Serverless Knative signals
  serverlessOutput = signal<string>('Funcția Knative este în starea "idle" (0 replici)...');

  // Volume (PVC) signals
  volumeFiles = signal<any[]>([]);

  // Cron logs signals
  cronExecutions = signal<any[]>([]);

  // Configuration management signals
  showConfig = signal(false);
  baasUrlInput = signal('');
  apiKeyInput = signal('');
  backendUrlInput = signal('');

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
      const savedUserEmail = localStorage.getItem('hermes_user_email');
      if (savedUserId && savedUserEmail) {
        this.userId.set(savedUserId);
        this.userEmail.set(savedUserEmail);
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

    alert('Configurație actualizată cu succes!');
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
      alert('Te rog introdu un titlu.');
      return;
    }
    this.driveService.createItem(this.itemTitle(), this.itemDesc()).subscribe({
      next: () => {
        this.itemTitle.set('');
        this.itemDesc.set('');
        this.loadItems();
      },
      error: (e) => alert('Eroare la adăugarea itemului: ' + e.message)
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
      },
      error: (e) => alert('Eroare la salvarea modificărilor: ' + e.message)
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
        next: () => this.loadItems(),
        error: (e) => alert('Eroare la ștergerea elementului: ' + e.message)
      });
    }
  }

  // ==========================================
  // BAAS AUTHENTICATION & STORAGE S3
  // ==========================================
  onRegister() {
    this.driveService.register(this.email(), this.password(), this.fullName()).subscribe({
      next: () => alert('Utilizator înregistrat cu succes în BaaS!'),
      error: (e) => alert('Eroare înregistrare: ' + (e.error?.error || e.message))
    });
  }

  onLogin() {
    this.driveService.login(this.email(), this.password()).subscribe({
      next: (res: any) => {
        this.userId.set(res.app_user_id);
        this.userEmail.set(res.email);

        if (typeof window !== 'undefined') {
          localStorage.setItem('hermes_user_id', res.app_user_id);
          localStorage.setItem('hermes_user_email', res.email);
        }

        this.loadFiles();
      },
      error: (e) => alert('Autentificare eșuată. Verifică datele introduse.')
    });
  }

  logout() {
    this.userId.set(null);
    this.userEmail.set('');
    this.files.set([]);

    if (typeof window !== 'undefined') {
      localStorage.removeItem('hermes_user_id');
      localStorage.removeItem('hermes_user_email');
    }
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

    this.driveService.initUploadSession(file.name, file.type, file.size).subscribe({
      next: (initRes: any) => {
        this.driveService.uploadBinaryStream(initRes.upload_url, file).subscribe({
          next: (uploadRes: any) => {
            this.driveService.saveFileMetadata(file.name, uploadRes.id).subscribe(() => {
              alert('Fișier încărcat în Storage privat S3 și salvat în baza de date!');
              this.loadFiles();
            });
          },
          error: (err) => alert('Eroare la transferul fișierului: ' + err.message)
        });
      },
      error: (err) => alert('Eroare inițializare upload: ' + (err.error?.error || err.message))
    });
  }

  downloadFile(fileId: string) {
    this.driveService.getSecureDownloadUrl(fileId).subscribe({
      next: (res: any) => {
        window.open(res.downloadUrl, '_blank');
      },
      error: (err) => alert('Eroare descărcare fișier: ' + err.message)
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
        alert('Fișier încărcat direct pe volumul persistent (PVC)!');
        this.refreshVolumeFiles();
      },
      error: (e) => alert('Eroare la scrierea pe volum: ' + (e.error?.error || e.message))
    });
  }

  deleteVolumeFile(name: string) {
    if (confirm(`Sigur vrei să ștergi fișierul "${name}" de pe volum?`)) {
      this.driveService.deleteVolumeFile(name).subscribe({
        next: () => this.refreshVolumeFiles(),
        error: (e) => alert('Eroare la ștergerea fișierului de pe volum: ' + e.message)
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
    this.driveService.triggerServerlessAnalytics().subscribe({
      next: (data) => {
        this.serverlessOutput.set(JSON.stringify(data, null, 2));
      },
      error: (err) => {
        this.serverlessOutput.set('Eroare invocare serverless: ' + (err.error?.message || err.message));
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
