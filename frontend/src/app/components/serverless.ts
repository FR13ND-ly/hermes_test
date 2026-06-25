import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DriveService } from '../drive';

@Component({
  selector: 'app-serverless',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="border border-neutral-900 bg-neutral-950 p-6 space-y-6 rounded-none shadow-md max-w-5xl">
      <div class="border-b border-neutral-900 pb-4">
        <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-200">Knative Ingress Gateway</h3>
        <p class="text-[10px] text-neutral-500 mt-1 font-mono">Simulate runtime invocation of serverless functions within the cluster scope.</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <!-- Method -->
        <div class="col-span-1">
          <label class="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-2 font-mono">Method</label>
          <select [value]="serverlessMethod()" (change)="serverlessMethod.set($any($event.target).value)"
                  class="w-full bg-neutral-950 border border-neutral-900 text-neutral-300 text-xs rounded-none p-2.5 outline-none focus:border-neutral-700 cursor-pointer transition-colors font-mono">
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <!-- URL -->
        <div class="col-span-3">
          <label class="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-2 font-mono">Serverless Function Cluster Domain URL</label>
          <input type="text" [value]="serverlessUrl()" (input)="serverlessUrl.set($any($event.target).value)"
                 placeholder="http://serverless-endpoint-slug.namespace.svc.cluster.local"
                 class="w-full bg-neutral-950 border border-neutral-900 text-neutral-100 text-xs rounded-none p-2.5 outline-none focus:border-neutral-700 placeholder-neutral-800 transition-colors font-mono" />
        </div>
      </div>

      <!-- Body -->
      <div *ngIf="serverlessMethod() === 'POST' || serverlessMethod() === 'PUT'" class="space-y-2">
        <label class="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider font-mono">Request Payload (JSON)</label>
        <textarea [value]="serverlessBody()" (input)="serverlessBody.set($any($event.target).value)"
                  placeholder='{ "test": true }' rows="5"
                  class="w-full bg-neutral-950 border border-neutral-900 text-neutral-100 text-xs font-mono rounded-none p-3 outline-none focus:border-neutral-700 placeholder-neutral-800 transition-colors resize-none shadow-inner"></textarea>
      </div>

      <button (click)="runServerless()" 
              class="w-full bg-emerald-600 hover:bg-emerald-500 text-neutral-950 font-bold text-xs py-3 px-4 rounded-none shadow-md transition-colors cursor-pointer uppercase tracking-wider">
        Invoke Function
      </button>

      <!-- Pre Console -->
      <div class="relative space-y-2 font-mono">
        <label class="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider px-1">Response Output Stream</label>
        <pre class="bg-neutral-950 border border-neutral-900 text-emerald-500 font-mono text-[10px] p-5 rounded-none overflow-x-auto max-h-56 leading-relaxed shadow-inner select-all">{{ serverlessOutput() }}</pre>
      </div>
    </div>
  `
})
export class ServerlessComponent implements OnInit {
  private driveService = inject(DriveService);

  serverlessOutput = signal<string>('The Knative function is in "idle" state (0 replicas)...');
  serverlessUrl = signal<string>('');
  serverlessMethod = signal<string>('GET');
  serverlessBody = signal<string>('');

  ngOnInit() {
    if (this.driveService.serverlessUrl()) {
      this.serverlessUrl.set(this.driveService.serverlessUrl());
    }
  }

  runServerless() {
    this.serverlessOutput.set('HTTP invocation Knative... Server is cold-starting the ephemeral pod...');
    this.driveService.triggerServerlessTest(
      this.serverlessUrl(),
      this.serverlessMethod(),
      this.serverlessBody()
    ).subscribe({
      next: (data) => {
        this.serverlessOutput.set(JSON.stringify(data, null, 2));
      },
      error: (err) => {
        this.serverlessOutput.set('Serverless invocation error: ' + JSON.stringify(err.error || err.message, null, 2));
      }
    });
  }
}
