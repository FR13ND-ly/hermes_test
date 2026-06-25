import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DriveService } from '../drive';
import { ToastService } from '../services/toast';
import { SessionService } from '../services/session';

@Component({
  selector: 'app-baas-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="border border-neutral-900 bg-neutral-950 p-6 space-y-6 rounded-none">
      <div class="border-b border-neutral-900 pb-4">
        <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-200">Gateway: BaaS Authentication</h3>
        <p class="text-[10px] text-neutral-500 mt-1 font-mono">Test token generation, user hashing, and RBAC authentication over the centralized user pool.</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <!-- Session Management Box -->
        <div class="bg-neutral-950 p-5 border border-neutral-900 space-y-5 shadow-md rounded-none">
          <h4 class="text-[10px] font-bold text-violet-400 uppercase tracking-widest flex items-center gap-2">
            <span class="w-1.5 h-1.5 bg-neutral-700" [ngClass]="{'bg-emerald-500': session.userId()}"></span>
            {{ session.userId() ? 'ACTIVE SESSION' : 'UNAUTHENTICATED VISIT' }}
          </h4>

          @if (!session.userId()) {
            <!-- Login / Register Form -->
            <div class="space-y-4">
              <div>
                <label class="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Identifier</label>
                <input type="text" [(ngModel)]="identifier" placeholder="Email, username, or phone"
                       class="w-full bg-neutral-950 border border-neutral-900 rounded-none px-3 py-2 text-xs font-mono text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-violet-600 transition-colors">
                <p class="text-[9px] text-neutral-600 mt-1 font-mono">Opaque key used to identify the user record.</p>
              </div>
              <div>
                <label class="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Password</label>
                <input type="password" [(ngModel)]="password" placeholder="••••••••"
                       class="w-full bg-neutral-950 border border-neutral-900 rounded-none px-3 py-2 text-xs font-mono text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-violet-600 transition-colors">
                <p class="text-[9px] text-neutral-600 mt-1 font-mono">Minimum 8 characters length.</p>
              </div>
              <div class="flex gap-3 pt-1.5">
                <button (click)="onRegister()"
                        class="flex-1 bg-neutral-900 hover:bg-neutral-850 text-neutral-300 py-2 rounded-none text-xs font-bold uppercase tracking-wider border border-neutral-800 transition-colors cursor-pointer">
                  Register
                </button>
                <button (click)="onLogin()"
                        class="flex-1 bg-violet-600 hover:bg-violet-500 text-white py-2 rounded-none text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-md">
                  Log In
                </button>
              </div>
            </div>
          } @else {
            <!-- Authenticated View -->
            <div class="space-y-4">
              <div class="bg-neutral-900/10 p-4 border border-neutral-900 rounded-none space-y-3 font-mono text-xs leading-relaxed">
                <div class="flex justify-between items-center border-b border-neutral-900 pb-2">
                  <span class="text-neutral-500">Identifier:</span>
                  <span class="font-bold text-neutral-200 select-all">{{ session.userIdentifier() }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-neutral-500">Subject UUID:</span>
                  <span class="font-bold text-violet-400 select-all truncate max-w-[200px]" [title]="session.userId()">{{ session.userId() }}</span>
                </div>
              </div>
              
              <button (click)="onLogout()"
                      class="w-full bg-neutral-950 hover:bg-rose-950/20 text-rose-500 hover:text-rose-400 py-2.5 rounded-none text-xs font-bold uppercase tracking-wider border border-neutral-900 hover:border-rose-900/30 transition-colors cursor-pointer">
                Invalidate Token
              </button>
            </div>
          }
        </div>

        <!-- Information Area -->
        <div class="font-mono text-xs text-neutral-400 space-y-4 bg-neutral-900/10 border border-neutral-900 p-5 rounded-none">
          <h4 class="font-bold text-neutral-300 uppercase tracking-widest text-[9px]">Authentication Specification</h4>
          <div class="space-y-3 leading-normal">
            <p><strong>1. Registration Flow:</strong> User credentials are pushed via the public BaaS auth endpoints and persistent hashing algorithms. The database user pool is updated in real-time.</p>
            <p><strong>2. Token Validation:</strong> On login verification, the server generates a cryptographically signed JWT bearer token containing security scopes.</p>
            <p><strong>3. Dashboard Sync:</strong> Created users can be inspected directly in the central identity console of the Hermes administration dashboard.</p>
          </div>

          <div class="bg-neutral-950 border border-neutral-900 p-3 space-y-1 rounded-none">
            <p class="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">Gateway Endpoint</p>
            <p class="font-mono text-[10px] text-violet-400 truncate select-all">{{ driveService.hermesBaaSUrl() }}</p>
          </div>
        </div>
      </div>
    </div>
  `
})
export class BaasAuthComponent {
  public driveService = inject(DriveService);
  private toast = inject(ToastService);
  public session = inject(SessionService);

  identifier = '';
  password = '';

  onRegister() {
    if (!this.identifier.trim()) {
      this.toast.notify('Enter an identifier.', 'error');
      return;
    }
    if (this.password.length < 8) {
      this.toast.notify('Password must be at least 8 characters.', 'error');
      return;
    }
    this.driveService.register(this.identifier.trim(), this.password).subscribe({
      next: () => this.toast.notify('User registered in BaaS! You can now log in.', 'success'),
      error: (e) => this.toast.notify('Registration error: ' + this.errMsg(e), 'error')
    });
  }

  onLogin() {
    this.driveService.login(this.identifier.trim(), this.password).subscribe({
      next: (res: any) => {
        this.session.saveSession(res.appUserId, res.identifier, res.accessToken, res.refreshToken);
        this.password = '';
        this.toast.notify('Logged in as ' + res.identifier, 'success');
      },
      error: () => this.toast.notify('Login failed. Check your credentials.', 'error')
    });
  }

  onLogout() {
    this.session.clearSession();
    this.toast.notify('Logged out.', 'info');
  }

  private errMsg(e: any): string {
    return e?.error?.error?.message || e?.error?.error || e?.error?.message || e?.message || 'Unknown error';
  }
}
