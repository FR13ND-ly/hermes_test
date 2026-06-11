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

  // User session signals
  email = signal('');
  password = signal('');
  fullName = signal('');
  userId = signal<string | null>(null);
  userEmail = signal<string>('');
  files = signal<any[]>([]);

  // Serverless Knative signals
  serverlessOutput = signal<string>('Funcția Knative este în starea "idle" (0 replici)...');

  // Volume (PVC) signals
  volumeFiles = signal<any[]>([]);
  volumeFileName = signal('test-pvc.txt');
  volumeFileContent = signal('Această linie a fost salvată pe volumul persistent din Hermes!');

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
      if (savedBackend) this.driveService.nodeBackendUrl.set(savedBackend);

      const savedBaaS = localStorage.getItem('hermes_baas_url');
      if (savedBaaS) this.driveService.hermesBaaSUrl.set(savedBaaS);

      const savedApiKey = localStorage.getItem('hermes_api_key');
      if (savedApiKey) this.driveService.appApiKey.set(savedApiKey);
    }

    // Sync input signals
    this.baasUrlInput.set(this.driveService.hermesBaaSUrl());
    this.apiKeyInput.set(this.driveService.appApiKey());
    this.backendUrlInput.set(this.driveService.nodeBackendUrl());

    // Load dynamic variables from Express backend env at runtime
    this.driveService.loadConfig();

    // After loading config, sync inputs again briefly
    setTimeout(() => {
      this.baasUrlInput.set(this.driveService.hermesBaaSUrl());
      this.apiKeyInput.set(this.driveService.appApiKey());
      this.backendUrlInput.set(this.driveService.nodeBackendUrl());
      
      // Load initial lists
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

    alert('Configurație actualizată cu succes!');
    this.showConfig.set(false);

    // Refresh active data
    if (this.userId()) this.loadFiles();
    this.refreshVolumeFiles();
    this.refreshCronStatus();
  }

  resetConfigToDefaults() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('hermes_backend_url');
      localStorage.removeItem('hermes_baas_url');
      localStorage.removeItem('hermes_api_key');
    }
    // Reload to default config
    window.location.reload();
  }

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
        this.loadFiles();
      },
      error: (e) => alert('Autentificare eșuată. Verifică datele introduse.')
    });
  }

  logout() {
    this.userId.set(null);
    this.userEmail.set('');
    this.files.set([]);
  }

  loadFiles() {
    const uid = this.userId();
    if (uid) this.driveService.getFiles(uid).subscribe(data => this.files.set(data));
  }

  onUpload(event: any) {
    const file: File = event.target.files[0];
    const uid = this.userId();
    if (!file || !uid) return;

    // Step 1: Initialize upload session in Hermes Storage
    this.driveService.initUploadSession(file.name, file.type, file.size).subscribe({
      next: (initRes: any) => {
        // Step 2: Upload raw binary to S3 via Axum Storage Gateway stream
        this.driveService.uploadBinaryStream(initRes.upload_url, file).subscribe({
          next: (uploadRes: any) => {
            // Step 3: Save file meta database reference in Postgres via Express
            this.driveService.saveFileMetadata(uid, file.name, uploadRes.id).subscribe(() => {
              alert('Fișier încărcat în Storage privat și salvat în baza de date!');
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
    const uid = this.userId();
    if (uid) {
      this.driveService.getSecureDownloadUrl(uid, fileId).subscribe({
        next: (res: any) => {
          // Open the presigned virtual URL generated by Rust
          window.open(res.downloadUrl, '_blank');
        },
        error: (err) => alert('Eroare descărcare fișier: ' + err.message)
      });
    }
  }

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

  // Persistent Volume Actions
  refreshVolumeFiles() {
    this.driveService.readFromVolume().subscribe({
      next: (files) => this.volumeFiles.set(files),
      error: (e) => console.warn('Nu s-au putut prelua fișierele din volum:', e)
    });
  }

  writeVolumeFile() {
    if (!this.volumeFileName().trim()) {
      alert('Te rog introdu un nume de fișier.');
      return;
    }
    this.driveService.writeToVolume(this.volumeFileName(), this.volumeFileContent()).subscribe({
      next: () => {
        alert('Fișier salvat pe volumul persistent (PVC)!');
        this.refreshVolumeFiles();
      },
      error: (e) => alert('Eroare scriere volum: ' + (e.error?.error || e.message))
    });
  }

  // Cron Status Actions
  refreshCronStatus() {
    this.driveService.getCronStatus().subscribe({
      next: (logs) => this.cronExecutions.set(logs),
      error: (e) => console.warn('Nu s-a putut citi istoricul cron:', e)
    });
  }
}
