import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DriveService } from '../drive';
import { ToastService } from '../services/toast';

@Component({
  selector: 'app-redis-cache',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="border border-neutral-900 bg-neutral-950 p-6 space-y-6 rounded-none">
      <div class="flex items-center justify-between border-b border-neutral-900 pb-4">
        <div>
          <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-200">Cache schema: Redis KV</h3>
          <p class="text-[10px] text-neutral-500 mt-1 font-mono">Validate real-time caching operations inside the in-memory database.</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-[10px] font-mono px-2.5 py-1 border flex items-center gap-1.5 shrink-0 rounded-none font-bold"
                [ngClass]="redisStatus()?.connected ? 'text-emerald-400 border-emerald-900/40 bg-emerald-950/15' : 'text-rose-400 border-rose-900/40 bg-rose-950/15'">
            {{ redisStatus()?.connected ? 'STATUS: ONLINE' : 'STATUS: OFFLINE' }}
          </span>
          <button (click)="refreshRedis()" class="bg-neutral-900 hover:bg-neutral-850 text-neutral-300 text-[10px] font-bold uppercase tracking-wider py-1.5 px-3.5 border border-neutral-800 hover:border-neutral-700 rounded-none transition-colors cursor-pointer">
            Reload
          </button>
        </div>
      </div>

      @if (redisStatus() && !redisStatus().connected) {
        <div class="border border-rose-900/30 bg-rose-950/10 p-4 font-mono text-[10px] text-rose-300 leading-relaxed rounded-none">
          <p class="font-bold uppercase tracking-wider mb-1">Error: Cache Connection Failure</p>
          <p>{{ redisStatus().error }}</p>
          <p class="text-neutral-500 mt-2">Ensure your project deployment has a linked Redis instance. The cluster environment variables will populate automatically on reload.</p>
        </div>
      } @else if (redisStatus()?.url) {
        <div class="bg-neutral-950 border border-neutral-900 p-3 flex items-center justify-between font-mono text-[10px] text-neutral-500 rounded-none">
          <span>DOCKER-REDIS-ENDPOINT:</span>
          <span class="text-amber-500 select-all font-semibold">{{ redisStatus().url }}</span>
        </div>
      }

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <!-- Form -->
        <div class="bg-neutral-950 p-5 border border-neutral-900 space-y-4 shadow-md rounded-none">
          <h4 class="text-[10px] font-bold text-amber-500 uppercase tracking-widest">SET Key-Value</h4>
          <div class="space-y-3.5">
            <div>
              <label class="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Prefix Suffix</label>
              <div class="flex">
                <span class="bg-neutral-900 border border-r-0 border-neutral-900 text-neutral-500 text-xs px-3.5 py-2 font-mono select-none rounded-none flex items-center">test:</span>
                <input type="text" [(ngModel)]="redisKeyInput" placeholder="cache_key"
                       class="flex-1 bg-neutral-950 border border-neutral-900 rounded-none px-3 py-2 text-xs font-mono text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-amber-500 transition-colors">
              </div>
            </div>
            <div>
              <label class="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">String Value</label>
              <input type="text" [(ngModel)]="redisValueInput" placeholder="Cached data payload"
                     class="w-full bg-neutral-950 border border-neutral-900 rounded-none px-3 py-2 text-xs font-mono text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-amber-500 transition-colors">
            </div>
            <div>
              <label class="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">TTL Seconds (Optional)</label>
              <input type="number" [(ngModel)]="redisTtlInput" placeholder="No expiry (NULL)"
                     class="w-full bg-neutral-950 border border-neutral-900 rounded-none px-3 py-2 text-xs font-mono text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-amber-500 transition-colors">
            </div>
          </div>
          <button (click)="setRedisKey()"
                  class="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 py-2 rounded-none text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-md">
            EXECUTE SET
          </button>
        </div>

        <!-- Keys List with Pagination -->
        <div class="lg:col-span-2 space-y-3">
          <h4 class="text-[9px] font-bold text-neutral-500 uppercase tracking-wider px-1">Active Memory Keys (test:*)</h4>
          <div class="bg-neutral-950 border border-neutral-900 rounded-none overflow-hidden shadow-md divide-y divide-neutral-900">
            @for (entry of paginatedKeys(); track entry.key) {
              <div class="p-4 flex items-start justify-between hover:bg-neutral-900/10 transition-colors gap-4">
                <div class="space-y-1.5 min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <h5 class="font-bold text-xs text-neutral-200 truncate select-all">{{ entry.key }}</h5>
                    <span class="text-[9px] font-mono text-amber-500 bg-amber-500/5 border border-amber-500/20 px-1.5 py-0.5 shrink-0">
                      {{ entry.ttl < 0 ? 'PERSIST' : 'TTL: ' + entry.ttl + 's' }}
                    </span>
                  </div>
                  <p class="text-neutral-400 text-xs font-mono text-[10px] break-all leading-normal bg-neutral-900/20 p-2.5 border border-neutral-900 rounded-none overflow-x-auto">{{ entry.value }}</p>
                </div>
                <button (click)="deleteRedisKey(entry.key)"
                        class="bg-neutral-950 hover:bg-rose-950/20 text-rose-500 hover:text-rose-400 text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 rounded-none border border-neutral-900 hover:border-rose-900/30 transition-colors cursor-pointer shrink-0">
                  Del
                </button>
              </div>
            } @empty {
              <div class="p-16 text-center">
                <p class="text-xs text-neutral-500 font-mono italic">0 KEYS RETURNED (No match for prefix)</p>
                <p class="text-[10px] text-neutral-600 font-mono mt-1">Execute SET on the left to store cache items.</p>
              </div>
            }
          </div>

          <!-- Pagination Controls -->
          @if (redisKeys().length > 0) {
            <div class="flex items-center justify-between border-t border-neutral-900 pt-4 mt-2 font-mono text-[10px] text-neutral-500 px-1">
              <div>Showing {{ startIndex() + 1 }}–{{ endIndex() }} of {{ redisKeys().length }} entries</div>
              <div class="flex gap-2">
                <button [disabled]="currentPage() === 1" (click)="prevPage()" 
                        class="px-2.5 py-1 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-neutral-900 text-neutral-300 font-bold uppercase cursor-pointer">
                  Prev
                </button>
                <button [disabled]="currentPage() >= totalPages()" (click)="nextPage()" 
                        class="px-2.5 py-1 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-neutral-900 text-neutral-300 font-bold uppercase cursor-pointer">
                  Next
                </button>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export class RedisCacheComponent implements OnInit {
  private driveService = inject(DriveService);
  private toast = inject(ToastService);

  redisStatus = signal<any>(null);
  redisKeys = signal<any[]>([]);
  redisKeyInput = signal('');
  redisValueInput = signal('');
  redisTtlInput = signal<number | null>(null);

  // Pagination Signals
  currentPage = signal<number>(1);
  pageSize = signal<number>(5);

  totalPages = computed(() => {
    return Math.ceil(this.redisKeys().length / this.pageSize()) || 1;
  });

  startIndex = computed(() => {
    return (this.currentPage() - 1) * this.pageSize();
  });

  endIndex = computed(() => {
    const end = this.startIndex() + this.pageSize();
    const len = this.redisKeys().length;
    return end > len ? len : end;
  });

  paginatedKeys = computed(() => {
    return this.redisKeys().slice(this.startIndex(), this.endIndex());
  });

  ngOnInit() {
    this.refreshRedis();
  }

  refreshRedis() {
    this.driveService.getRedisStatus().subscribe({
      next: (s) => this.redisStatus.set(s),
      error: (e) => this.redisStatus.set({ connected: false, error: this.errMsg(e) })
    });
    this.driveService.getRedisKeys().subscribe({
      next: (data) => {
        this.redisKeys.set(data);
        if (this.currentPage() > this.totalPages()) {
          this.currentPage.set(this.totalPages());
        }
      },
      error: () => this.redisKeys.set([])
    });
  }

  setRedisKey() {
    if (!this.redisKeyInput().trim()) {
      this.toast.notify('Enter a Redis key.', 'error');
      return;
    }
    const ttl = this.redisTtlInput();
    this.driveService.setRedisKey(this.redisKeyInput(), this.redisValueInput(), ttl ?? undefined).subscribe({
      next: () => {
        this.redisKeyInput.set('');
        this.redisValueInput.set('');
        this.redisTtlInput.set(null);
        this.refreshRedis();
        this.toast.notify('Key written to Redis.', 'success');
      },
      error: (e) => this.toast.notify('Error writing to Redis: ' + this.errMsg(e), 'error')
    });
  }

  deleteRedisKey(key: string) {
    this.driveService.deleteRedisKey(key).subscribe({
      next: () => {
        this.refreshRedis();
        this.toast.notify('Key deleted from Redis.', 'success');
      },
      error: (e) => this.toast.notify('Error deleting key: ' + this.errMsg(e), 'error')
    });
  }

  prevPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
    }
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
    }
  }

  private errMsg(e: any): string {
    return e?.error?.error?.message || e?.error?.error || e?.error?.message || e?.message || 'Unknown error';
  }
}
