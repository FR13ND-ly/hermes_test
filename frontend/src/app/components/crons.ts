import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DriveService } from '../drive';

@Component({
  selector: 'app-crons',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="border border-neutral-900 bg-neutral-950 p-6 space-y-6 rounded-none shadow-md max-w-5xl">
      <div class="flex items-center justify-between border-b border-neutral-900 pb-4">
        <div>
          <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-200">Execution Logs: Cron Scheduler</h3>
          <p class="text-[10px] text-neutral-500 mt-1 font-mono">Audit periodic tasks executed automatically by the platform daemon.</p>
        </div>
        <button (click)="refreshCronStatus()" 
                class="bg-neutral-900 hover:bg-neutral-850 text-neutral-300 text-[10px] font-bold uppercase tracking-wider py-1.5 px-3.5 border border-neutral-800 hover:border-neutral-700 rounded-none transition-colors cursor-pointer">
          Reload History
        </button>
      </div>

      <div class="bg-neutral-950 border border-neutral-900 rounded-none overflow-hidden shadow-md">
        <div class="grid grid-cols-3 p-3 bg-neutral-900 font-bold text-[9px] text-neutral-400 uppercase tracking-widest border-b border-neutral-900 select-none">
          <span>Timestamp</span>
          <span>Job Cleanup Scope</span>
          <span class="text-right">Execution Status</span>
        </div>
        <div class="divide-y divide-neutral-900 font-mono">
          @for (cron of paginatedCronExecutions(); track cron.id) {
            <div class="grid grid-cols-3 p-3.5 hover:bg-neutral-900/10 transition-colors text-xs items-center">
              <span class="text-neutral-300">{{ cron.run_at | date:'yyyy-MM-dd HH:mm:ss' }}</span>
              <span class="text-amber-500 font-semibold">
                Purged {{ cron.purged_count }} files
              </span>
              <span class="text-right">
                <span class="inline-flex text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-none bg-emerald-950/15 border border-emerald-900/40 text-emerald-400 select-none">
                  Success
                </span>
              </span>
            </div>
          } @empty {
            <div class="p-16 text-center text-xs text-neutral-500 font-mono italic">
              0 EXECUTIONS LOGGED IN DATABASE
            </div>
          }
        </div>
      </div>

      <!-- Pagination Controls -->
      @if (cronExecutions().length > 0) {
        <div class="flex items-center justify-between border-t border-neutral-900 pt-4 mt-2 font-mono text-[10px] text-neutral-500 px-1">
          <div>Showing {{ startIndex() + 1 }}–{{ endIndex() }} of {{ cronExecutions().length }} entries</div>
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
  `
})
export class CronsComponent implements OnInit {
  private driveService = inject(DriveService);

  cronExecutions = signal<any[]>([]);

  // Pagination Signals
  currentPage = signal<number>(1);
  pageSize = signal<number>(10);

  totalPages = computed(() => {
    return Math.ceil(this.cronExecutions().length / this.pageSize()) || 1;
  });

  startIndex = computed(() => {
    return (this.currentPage() - 1) * this.pageSize();
  });

  endIndex = computed(() => {
    const end = this.startIndex() + this.pageSize();
    const len = this.cronExecutions().length;
    return end > len ? len : end;
  });

  paginatedCronExecutions = computed(() => {
    return this.cronExecutions().slice(this.startIndex(), this.endIndex());
  });

  ngOnInit() {
    this.refreshCronStatus();
  }

  refreshCronStatus() {
    this.driveService.getCronStatus().subscribe({
      next: (logs) => {
        this.cronExecutions.set(logs);
        if (this.currentPage() > this.totalPages()) {
          this.currentPage.set(this.totalPages());
        }
      },
      error: (e) => console.warn('Could not read cron history:', e)
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
}
