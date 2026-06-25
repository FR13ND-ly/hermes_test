import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { DriveService } from './drive';
import { ToastService } from './services/toast';
import { SessionService } from './services/session';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './app.html'
})
export class App implements OnInit {
  public driveService = inject(DriveService);
  public toastService = inject(ToastService);
  public session = inject(SessionService);

  ngOnInit() {
    // Load config from the server
    this.driveService.loadConfig();
  }

  logout() {
    this.session.clearSession();
    this.toastService.notify('Logged out.', 'info');
  }
}
