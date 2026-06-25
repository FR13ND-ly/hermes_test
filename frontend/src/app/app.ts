import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DriveService } from './drive';
import { ToastService } from './services/toast';
import { DatabaseCrudComponent } from './components/database-crud';
import { RedisCacheComponent } from './components/redis-cache';
import { BaasAuthComponent } from './components/baas-auth';
import { FileStorageComponent } from './components/file-storage';
import { ServerlessComponent } from './components/serverless';
import { CronsComponent } from './components/crons';
import { SettingsComponent } from './components/settings';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    DatabaseCrudComponent,
    RedisCacheComponent,
    BaasAuthComponent,
    FileStorageComponent,
    ServerlessComponent,
    CronsComponent,
    SettingsComponent
  ],
  templateUrl: './app.html'
})
export class App implements OnInit {
  public driveService = inject(DriveService);
  public toastService = inject(ToastService);

  activeTab = signal('database');

  userId = signal<string | null>(null);
  userIdentifier = signal<string>('');

  ngOnInit() {
    // Load user session if saved in localStorage
    if (typeof window !== 'undefined') {
      const savedUserId = localStorage.getItem('hermes_user_id');
      const savedIdentifier = localStorage.getItem('hermes_user_identifier');
      if (savedUserId && savedIdentifier) {
        this.userId.set(savedUserId);
        this.userIdentifier.set(savedIdentifier);
      }
    }
    // Load config from the server
    this.driveService.loadConfig();
  }

  onLoginSuccess(user: { userId: string; identifier: string }) {
    this.userId.set(user.userId);
    this.userIdentifier.set(user.identifier);
  }

  logout() {
    this.userId.set(null);
    this.userIdentifier.set('');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('hermes_user_id');
      localStorage.removeItem('hermes_user_identifier');
      localStorage.removeItem('hermes_access_token');
      localStorage.removeItem('hermes_refresh_token');
    }
    this.toastService.notify('Logged out.', 'info');
  }
}
