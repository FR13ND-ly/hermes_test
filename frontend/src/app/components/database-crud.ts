import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DriveService } from '../drive';
import { ToastService } from '../services/toast';

@Component({
  selector: 'app-database-crud',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="border border-neutral-900 bg-neutral-950 p-6 space-y-6 rounded-none">
      <div class="flex items-center justify-between border-b border-neutral-900 pb-4">
        <div>
          <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-200">Table schema: test_items</h3>
          <p class="text-[10px] text-neutral-500 mt-1 font-mono">Verify read, write, and delete transactions against Postgres.</p>
        </div>
        <button (click)="loadItems()" class="bg-neutral-900 hover:bg-neutral-850 text-neutral-300 text-[10px] font-bold uppercase tracking-wider py-1.5 px-3.5 border border-neutral-800 hover:border-neutral-700 rounded-none transition-colors cursor-pointer shadow-sm">
          Reload Data
        </button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <!-- Form -->
        <div class="bg-neutral-950 p-5 border border-neutral-900 space-y-4 shadow-md rounded-none">
          <h4 class="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
            {{ editingItemId() ? 'Update Entry' : 'New Entry' }}
          </h4>
          <div class="space-y-3.5">
            <div>
              <label class="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Item Title</label>
              <input type="text" [(ngModel)]="itemTitle" placeholder="Task or item name"
                     class="w-full bg-neutral-950 border border-neutral-900 rounded-none px-3 py-2 text-xs font-mono text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-indigo-600 transition-colors">
            </div>
            <div>
              <label class="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Description</label>
              <textarea [(ngModel)]="itemDesc" rows="5" placeholder="Operational details or JSON string"
                        class="w-full bg-neutral-950 border border-neutral-900 rounded-none px-3 py-2 text-xs font-mono text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-indigo-600 transition-colors resize-none"></textarea>
            </div>
          </div>
          <div class="flex gap-2 pt-1.5">
            <button *ngIf="!editingItemId()" (click)="addItem()"
                    class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-neutral-950 py-2 rounded-none text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-md">
              Insert
            </button>
            <button *ngIf="editingItemId()" (click)="saveEdit()"
                    class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-neutral-950 py-2 rounded-none text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-md">
              Save
            </button>
            <button *ngIf="editingItemId()" (click)="cancelEdit()"
                    class="bg-neutral-900 hover:bg-neutral-800 text-neutral-400 py-2 px-4 rounded-none text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border border-neutral-800">
              Cancel
            </button>
          </div>
        </div>

        <!-- Records List with Pagination -->
        <div class="lg:col-span-2 space-y-3">
          <h4 class="text-[9px] font-bold text-neutral-500 uppercase tracking-wider px-1">Active Rowsets</h4>
          <div class="bg-neutral-950 border border-neutral-900 rounded-none overflow-hidden shadow-md divide-y divide-neutral-900">
            @for (item of paginatedItems(); track item.id) {
              <div class="p-4 flex items-start justify-between hover:bg-neutral-900/10 transition-colors gap-4">
                <div class="space-y-1.5 min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <h5 class="font-bold text-xs text-neutral-200 truncate select-all">{{ item.title }}</h5>
                    <span class="text-[9px] font-mono text-neutral-600 bg-neutral-900 border border-neutral-850 px-1 py-0.5 shrink-0">{{ item.id.substring(0, 8) }}</span>
                  </div>
                  <p class="text-neutral-400 text-xs font-mono text-[10px] break-all leading-normal whitespace-pre-wrap">{{ item.description || '(NULL)' }}</p>
                  <span class="text-[9px] text-neutral-600 block font-mono">timestamp: {{ item.created_at | date:'yyyy-MM-dd HH:mm:ss' }}</span>
                </div>
                <div class="flex gap-2 shrink-0">
                  <button (click)="startEdit(item)"
                          class="bg-neutral-900 hover:bg-neutral-850 text-neutral-300 text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 rounded-none border border-neutral-800 hover:border-neutral-700 transition-colors cursor-pointer">
                    Edit
                  </button>
                  <button (click)="deleteItem(item.id)"
                          class="bg-neutral-950 hover:bg-rose-950/20 text-rose-500 hover:text-rose-400 text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 rounded-none border border-neutral-900 hover:border-rose-900/30 transition-colors cursor-pointer">
                    Delete
                  </button>
                </div>
              </div>
            } @empty {
              <div class="p-16 text-center">
                <p class="text-xs text-neutral-500 font-mono italic">TABLE EMPTY (0 rows returned)</p>
                <p class="text-[10px] text-neutral-600 font-mono mt-1">Insert a test row to verify transactions.</p>
              </div>
            }
          </div>

          <!-- Pagination Controls -->
          @if (items().length > 0) {
            <div class="flex items-center justify-between border-t border-neutral-900 pt-4 mt-2 font-mono text-[10px] text-neutral-500 px-1">
              <div>Showing {{ startIndex() + 1 }}–{{ endIndex() }} of {{ items().length }} entries</div>
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
export class DatabaseCrudComponent implements OnInit {
  private driveService = inject(DriveService);
  private toast = inject(ToastService);

  items = signal<any[]>([]);
  itemTitle = signal('');
  itemDesc = signal('');
  editingItemId = signal<string | null>(null);

  // Pagination Signals
  currentPage = signal<number>(1);
  pageSize = signal<number>(5);

  totalPages = computed(() => {
    return Math.ceil(this.items().length / this.pageSize()) || 1;
  });

  startIndex = computed(() => {
    return (this.currentPage() - 1) * this.pageSize();
  });

  endIndex = computed(() => {
    const end = this.startIndex() + this.pageSize();
    const len = this.items().length;
    return end > len ? len : end;
  });

  paginatedItems = computed(() => {
    return this.items().slice(this.startIndex(), this.endIndex());
  });

  ngOnInit() {
    this.loadItems();
  }

  loadItems() {
    this.driveService.getItems().subscribe({
      next: (data) => {
        this.items.set(data);
        // Ensure page index is valid after reload
        if (this.currentPage() > this.totalPages()) {
          this.currentPage.set(this.totalPages());
        }
      },
      error: (e) => console.warn('Error loading items:', e)
    });
  }

  addItem() {
    if (!this.itemTitle().trim()) {
      this.toast.notify('Please enter a title.', 'error');
      return;
    }
    this.driveService.createItem(this.itemTitle(), this.itemDesc()).subscribe({
      next: () => {
        this.itemTitle.set('');
        this.itemDesc.set('');
        this.loadItems();
        this.toast.notify('Resource added to database.', 'success');
      },
      error: (e) => this.toast.notify('Error adding item: ' + this.errMsg(e), 'error')
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
        this.toast.notify('Changes saved.', 'success');
      },
      error: (e) => this.toast.notify('Error saving changes: ' + this.errMsg(e), 'error')
    });
  }

  cancelEdit() {
    this.editingItemId.set(null);
    this.itemTitle.set('');
    this.itemDesc.set('');
  }

  deleteItem(id: string) {
    if (confirm('Are you sure you want to delete this item from the database?')) {
      this.driveService.deleteItem(id).subscribe({
        next: () => {
          this.loadItems();
          this.toast.notify('Item deleted.', 'success');
        },
        error: (e) => this.toast.notify('Error deleting item: ' + this.errMsg(e), 'error')
      });
    }
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
