import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DriveService } from '../drive';
import { ToastService } from '../services/toast';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="border border-neutral-900 bg-neutral-950 p-6 space-y-6 rounded-none shadow-md max-w-4xl">
      <div class="border-b border-neutral-900 pb-4 flex items-center justify-between">
        <div>
          <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-200">System Gateway Configuration</h3>
          <p class="text-[10px] text-neutral-500 mt-1 font-mono">Point this client interface to in-cluster routing endpoints.</p>
        </div>
      </div>

      <div class="space-y-4 font-mono">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label class="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Backend API Gateway URL</label>
            <input type="text" [(ngModel)]="backendUrlInput" 
                   class="w-full bg-neutral-950 border border-neutral-900 rounded-none px-3 py-2.5 text-xs text-neutral-100 placeholder-neutral-800 focus:outline-none focus:border-indigo-600 transition-colors">
          </div>
          <div>
            <label class="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-2">BaaS Authentication Gate URL</label>
            <input type="text" [(ngModel)]="baasUrlInput" 
                   class="w-full bg-neutral-950 border border-neutral-900 rounded-none px-3 py-2.5 text-xs text-neutral-100 placeholder-neutral-800 focus:outline-none focus:border-indigo-600 transition-colors">
          </div>
        </div>
        <div>
          <label class="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Server Authorization Token (API Key)</label>
          <input type="text" [(ngModel)]="apiKeyInput" 
                 class="w-full bg-neutral-950 border border-neutral-900 rounded-none px-3 py-2.5 text-xs text-indigo-400 placeholder-neutral-800 focus:outline-none focus:border-indigo-600 transition-colors">
        </div>
      </div>

      <div class="flex gap-3 pt-4 border-t border-neutral-900 font-mono">
        <button (click)="saveConfig()" 
                class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-neutral-950 font-bold text-xs py-2.5 rounded-none shadow-md transition-colors cursor-pointer uppercase tracking-wider">
          Apply Settings
        </button>
        <button (click)="resetConfigToDefaults()"
                class="bg-neutral-900 hover:bg-neutral-850 text-neutral-400 font-bold text-xs py-2.5 px-6 rounded-none border border-neutral-800 hover:border-neutral-700 transition-colors cursor-pointer uppercase tracking-wider">
          Reset Client
        </button>
      </div>
    </div>
  `
})
export class SettingsComponent implements OnInit {
  public driveService = inject(DriveService);
  private toast = inject(ToastService);

  baasUrlInput = signal('');
  apiKeyInput = signal('');
  backendUrlInput = signal('');

  ngOnInit() {
    this.baasUrlInput.set(this.driveService.hermesBaaSUrl());
    this.apiKeyInput.set(this.driveService.appApiKey());
    this.backendUrlInput.set(this.driveService.nodeBackendUrl());
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

    this.driveService.loadConfig();
    this.toast.notify('Configuration updated successfully!', 'success');
  }

  resetConfigToDefaults() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('hermes_backend_url');
      localStorage.removeItem('hermes_baas_url');
      localStorage.removeItem('hermes_api_key');
    }
    window.location.reload();
  }
}
