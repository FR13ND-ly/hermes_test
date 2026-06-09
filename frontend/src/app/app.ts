import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DriveService } from './drive';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html'
})
export class AppComponent {
  private driveService = inject(DriveService);

  // Angular Signals active pentru performanță sporită în SSR Hydration
  email = signal('');
  password = signal('');
  fullName = signal('');
  userId = signal<string | null>(null);
  userEmail = signal<string>('');
  files = signal<any[]>([]);
  serverlessOutput = signal<string>('Funcția Knative este oprită (0 replici)...');

  onRegister() {
    this.driveService.register(this.email(), this.password(), this.fullName()).subscribe({
      next: () => alert('Utilizator înregistrat în baza ta de date din Hermes!'),
      error: (e) => alert('Eroare: ' + e.error?.error || e.message)
    });
  }

  onLogin() {
    this.driveService.login(this.email(), this.password()).subscribe({
      next: (res: any) => {
        this.userId.set(res.app_user_id);
        this.userEmail.set(res.email);
        this.loadFiles();
      },
      error: () => alert('Date de logare invalide.')
    });
  }

  loadFiles() {
    const uid = this.userId();
    if (uid) this.driveService.getFiles(uid).subscribe(data => this.files.set(data));
  }

  onUpload(event: any) {
    const file: File = event.target.files[0];
    const uid = this.userId();
    if (!file || !uid) return;

    // Pasul 1: Inițializează upload în Rust Storage
    this.driveService.initUploadSession(file.name, file.type, file.size).subscribe((initRes: any) => {
      
      // Pasul 2: Stream binar direct în sistemul tău de fișiere
      this.driveService.uploadBinaryStream(initRes.upload_url, file).subscribe((uploadRes: any) => {
        
        // Pasul 3: Salvează referința în tabelul din Postgres prin Node.js
        this.driveService.saveFileMetadata(uid, file.name, uploadRes.id).subscribe(() => {
          alert('Fișier urcat fizic și indexat în baza de date!');
          this.loadFiles();
        });
      });
    });
  }

  downloadFile(fileId: string) {
    const uid = this.userId();
    if (uid) {
      this.driveService.getSecureDownloadUrl(uid, fileId).subscribe((res: any) => {
        // Deschide link-ul semnat criptografic cu expunere de 15 minute
        window.open(res.downloadUrl, '_blank');
      });
    }
  }

  runServerless() {
    this.serverlessOutput.set('Invocare HTTP... Knative pornește instanța în fundal...');
    this.driveService.triggerServerlessAnalytics().subscribe(data => {
      this.serverlessOutput.set(JSON.stringify(data, null, 2));
    });
  }
}