import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DriveService } from '../drive';
import { ToastService } from '../services/toast';
import { switchMap } from 'rxjs';

@Component({
  selector: 'app-file-storage',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-6 max-w-5xl">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        <!-- S3 Upload box -->
        <section class="border border-neutral-900 bg-neutral-950 p-6 space-y-5 rounded-none shadow-md">
          <div class="border-b border-neutral-900 pb-3 flex items-center gap-2">
            <svg class="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-19.5 0A2.25 2.25 0 0 0 4.5 15h15a2.25 2.25 0 0 0 2.25-2.25m-19.5 0v.225c0 1.18.91 2.164 2.09 2.201a51.964 51.964 0 0 0 15.32 0c1.18-.037 2.09-1.022 2.09-2.201v-.225M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            <div>
              <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-200">S3 Object Bucket</h3>
              <p class="text-[10px] text-neutral-500 mt-1 font-mono">Stream binary files to the S3-compatible platform storage system.</p>
            </div>
          </div>

          <!-- Upload selector -->
          <div class="group relative border border-dashed border-neutral-800 hover:border-neutral-700 bg-neutral-900/10 p-5 text-center cursor-pointer transition-colors rounded-none">
            <input type="file" (change)="onUpload($event)" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
            <div class="space-y-1">
              <p class="text-xs font-bold text-neutral-300 uppercase tracking-wider">Select S3 Payload</p>
              <p class="text-[9px] text-neutral-600 font-mono">Upload objects through the centralized Hermes Gateway</p>
            </div>
          </div>

          <!-- Active Uploads progress -->
          @if (activeUploads().length > 0) {
            <div class="space-y-2 font-mono">
              <h4 class="text-[9px] font-bold text-amber-500 uppercase tracking-wider px-1">Active Pipeline</h4>
              <div class="bg-neutral-950 border border-neutral-900 divide-y divide-neutral-900 overflow-hidden shadow-inner">
                @for (upload of activeUploads(); track upload.id) {
                  <div class="flex items-center justify-between p-3 text-xs">
                    <div class="flex flex-col min-w-0 pr-4">
                      <span class="truncate font-semibold text-neutral-300 max-w-[160px]">{{ upload.fileName }}</span>
                      <span class="text-[9px] text-amber-500 font-bold uppercase tracking-wider mt-0.5">{{ upload.status }}</span>
                    </div>
                    <button (click)="cancelUpload(upload.id)" class="bg-neutral-900 hover:bg-neutral-850 text-red-500 hover:text-red-400 text-[9px] font-bold uppercase tracking-wider py-1 px-3 border border-neutral-800 transition-colors cursor-pointer shrink-0">
                      Cancel
                    </button>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Files list with Pagination -->
          <div class="space-y-2 font-mono">
            <h4 class="text-[9px] font-bold text-neutral-500 uppercase tracking-wider px-1">S3 Metadata Index</h4>
            <div class="bg-neutral-950 border border-neutral-900 divide-y divide-neutral-900 max-h-56 overflow-y-auto">
              @for (file of paginatedS3Files(); track file.id) {
                <div class="flex items-center justify-between p-3 hover:bg-neutral-900/10 transition-colors gap-4">
                  <div class="min-w-0 flex-1">
                    <span class="truncate font-bold text-xs text-neutral-300 block" [title]="file.file_name">{{ file.file_name }}</span>
                    <span class="text-[9px] text-neutral-600 block mt-0.5 select-all">{{ file.id }}</span>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <button (click)="downloadFile(file.id)" class="bg-neutral-900 hover:bg-neutral-850 text-neutral-300 text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 border border-neutral-800 hover:border-neutral-700 transition-colors cursor-pointer">
                      Get
                    </button>
                    <button (click)="deleteS3File(file.id)" class="bg-neutral-950 hover:bg-rose-950/20 text-rose-500 hover:text-rose-400 text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 border border-neutral-900 hover:border-rose-900/30 transition-colors cursor-pointer">
                      Delete
                    </button>
                  </div>
                </div>
              } @empty {
                <div class="p-8 text-center text-xs text-neutral-600 italic">No storage objects returned from S3.</div>
              }
            </div>

            <!-- S3 Pagination Controls -->
            @if (files().length > 0) {
              <div class="flex items-center justify-between border-t border-neutral-900 pt-4 mt-2 font-mono text-[10px] text-neutral-500 px-1">
                <div>Showing {{ s3StartIndex() + 1 }}–{{ s3EndIndex() }} of {{ files().length }} files</div>
                <div class="flex gap-2">
                  <button [disabled]="s3CurrentPage() === 1" (click)="s3PrevPage()" 
                          class="px-2.5 py-1 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-neutral-900 text-neutral-300 font-bold uppercase cursor-pointer">
                    Prev
                  </button>
                  <button [disabled]="s3CurrentPage() >= s3TotalPages()" (click)="s3NextPage()" 
                          class="px-2.5 py-1 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-neutral-900 text-neutral-300 font-bold uppercase cursor-pointer">
                    Next
                  </button>
                </div>
              </div>
            }
          </div>
        </section>

        <!-- PVC upload box -->
        <section class="border border-neutral-900 bg-neutral-950 p-6 space-y-5 rounded-none shadow-md">
          <div class="border-b border-neutral-900 pb-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5 12 11.25 3.75 7.5M20.25 11.25 12 15 3.75 11.25m16.5 3.75-8.25 3.75-8.25-3.75" />
              </svg>
              <div>
                <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-200">Persistent Volume Claim</h3>
                <p class="text-[10px] text-neutral-500 mt-1 font-mono">Write files directly onto the in-cluster persistent volume mountpoint.</p>
              </div>
            </div>
            <button (click)="refreshVolumeFiles()" class="bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded p-1.5 text-xs font-bold text-neutral-400 hover:text-neutral-200 cursor-pointer">
              🔄
            </button>
          </div>

          <!-- Upload selector -->
          <div class="group relative border border-dashed border-neutral-800 hover:border-neutral-700 bg-neutral-900/10 p-5 text-center cursor-pointer transition-colors rounded-none">
            <input type="file" (change)="onVolumeUpload($event)" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
            <div class="space-y-1">
              <p class="text-xs font-bold text-neutral-300 uppercase tracking-wider">Select PVC Payload</p>
              <p class="text-[9px] text-neutral-600 font-mono">Saves local data to the active container file volume</p>
            </div>
          </div>

          <!-- Files list with Pagination -->
          <div class="space-y-2 font-mono">
            <h4 class="text-[9px] font-bold text-neutral-500 uppercase tracking-wider px-1">Files on PVC Mount</h4>
            <div class="bg-neutral-950 border border-neutral-900 divide-y divide-neutral-900 max-h-56 overflow-y-auto">
              @for (file of paginatedVolumeFiles(); track file.name) {
                <div class="p-3 hover:bg-neutral-900/10 transition-colors space-y-2">
                  <div class="flex justify-between items-center gap-4">
                    <span class="font-bold text-xs text-neutral-300 block">📄 {{ file.name }}</span>
                    <div class="flex gap-3 items-center shrink-0">
                      <span class="text-neutral-500 text-[10px] font-mono">{{ file.size }} B</span>
                      <button (click)="deleteVolumeFile(file.name)" class="text-red-500 hover:text-red-400 text-[9px] font-bold uppercase tracking-wider bg-neutral-900 hover:bg-neutral-850 px-2 py-1 rounded-none border border-neutral-800 hover:border-neutral-700 cursor-pointer transition-colors">
                        Delete
                      </button>
                    </div>
                  </div>
                  <pre class="text-[9px] text-neutral-400 bg-neutral-950 border border-neutral-900 px-3 py-2 rounded-none font-mono overflow-x-auto select-all max-h-16 leading-relaxed shadow-inner">{{ file.content }}</pre>
                </div>
              } @empty {
                <div class="p-8 text-center text-xs text-neutral-600 italic">Persistent Volume space is empty.</div>
              }
            </div>

            <!-- PVC Pagination Controls -->
            @if (volumeFiles().length > 0) {
              <div class="flex items-center justify-between border-t border-neutral-900 pt-4 mt-2 font-mono text-[10px] text-neutral-500 px-1">
                <div>Showing {{ volumeStartIndex() + 1 }}–{{ volumeEndIndex() }} of {{ volumeFiles().length }} files</div>
                <div class="flex gap-2">
                  <button [disabled]="volumeCurrentPage() === 1" (click)="volumePrevPage()" 
                          class="px-2.5 py-1 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-neutral-900 text-neutral-300 font-bold uppercase cursor-pointer">
                    Prev
                  </button>
                  <button [disabled]="volumeCurrentPage() >= volumeTotalPages()" (click)="volumeNextPage()" 
                          class="px-2.5 py-1 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-neutral-900 text-neutral-300 font-bold uppercase cursor-pointer">
                    Next
                  </button>
                </div>
              </div>
            }
          </div>
        </section>

      </div>
    </div>
  `
})
export class FileStorageComponent implements OnInit {
  public driveService = inject(DriveService);
  private toast = inject(ToastService);

  files = signal<any[]>([]);
  activeUploads = signal<any[]>([]);
  volumeFiles = signal<any[]>([]);

  // S3 Pagination Signals
  s3CurrentPage = signal<number>(1);
  s3PageSize = signal<number>(5);

  s3TotalPages = computed(() => {
    return Math.ceil(this.files().length / this.s3PageSize()) || 1;
  });

  s3StartIndex = computed(() => {
    return (this.s3CurrentPage() - 1) * this.s3PageSize();
  });

  s3EndIndex = computed(() => {
    const end = this.s3StartIndex() + this.s3PageSize();
    const len = this.files().length;
    return end > len ? len : end;
  });

  paginatedS3Files = computed(() => {
    return this.files().slice(this.s3StartIndex(), this.s3EndIndex());
  });

  // PVC Pagination Signals
  volumeCurrentPage = signal<number>(1);
  volumePageSize = signal<number>(5);

  volumeTotalPages = computed(() => {
    return Math.ceil(this.volumeFiles().length / this.volumePageSize()) || 1;
  });

  volumeStartIndex = computed(() => {
    return (this.volumeCurrentPage() - 1) * this.volumePageSize();
  });

  volumeEndIndex = computed(() => {
    const end = this.volumeStartIndex() + this.volumePageSize();
    const len = this.volumeFiles().length;
    return end > len ? len : end;
  });

  paginatedVolumeFiles = computed(() => {
    return this.volumeFiles().slice(this.volumeStartIndex(), this.volumeEndIndex());
  });

  ngOnInit() {
    this.loadFiles();
    this.refreshVolumeFiles();
  }

  loadFiles() {
    this.driveService.getFiles().subscribe({
      next: (data) => {
        this.files.set(data);
        if (this.s3CurrentPage() > this.s3TotalPages()) {
          this.s3CurrentPage.set(this.s3TotalPages());
        }
      },
      error: (e) => console.warn('Error loading S3 files:', e)
    });
  }

  onUpload(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;

    event.target.value = '';

    const uploadId = Date.now().toString();
    const uploadItem = {
      id: uploadId,
      fileName: file.name,
      status: 'Initializing...',
      subscription: null as any
    };

    this.activeUploads.update(uploads => [...uploads, uploadItem]);

    const sub = this.driveService.initUploadSession(file.name, file.type, file.size).pipe(
      switchMap((initRes: any) => {
        uploadItem.status = 'Uploading...';
        return this.driveService.uploadBinaryStream(initRes.upload_url, file);
      }),
      switchMap((uploadRes: any) => {
        uploadItem.status = 'Saving metadata...';
        return this.driveService.saveFileMetadata(file.name, uploadRes.id);
      })
    ).subscribe({
      next: () => {
        this.activeUploads.update(uploads => uploads.filter(u => u.id !== uploadId));
        this.toast.notify('File uploaded to S3 Storage!', 'success');
        this.loadFiles();
      },
      error: (err) => {
        this.activeUploads.update(uploads => uploads.filter(u => u.id !== uploadId));
        if (err.name !== 'CanceledError' && err.message !== 'canceled' && err.status !== 0) {
          this.toast.notify('Upload error: ' + this.errMsg(err), 'error');
        }
      }
    });

    uploadItem.subscription = sub;
  }

  cancelUpload(uploadId: string) {
    const upload = this.activeUploads().find(u => u.id === uploadId);
    if (upload && upload.subscription) {
      upload.subscription.unsubscribe();
      this.activeUploads.update(uploads => uploads.filter(u => u.id !== uploadId));
    }
  }

  deleteS3File(id: string) {
    if (confirm('Are you sure you want to delete this file from S3 storage and the database?')) {
      this.driveService.deleteFile(id).subscribe({
        next: () => {
          this.toast.notify('File deleted!', 'success');
          this.loadFiles();
        },
        error: (err) => this.toast.notify('Error deleting file: ' + this.errMsg(err), 'error')
      });
    }
  }

  downloadFile(fileId: string) {
    this.driveService.getSecureDownloadUrl(fileId).subscribe({
      next: (res: any) => {
        window.open(res.downloadUrl, '_blank');
      },
      error: (err) => this.toast.notify('File download error: ' + this.errMsg(err), 'error')
    });
  }

  onVolumeUpload(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;

    this.driveService.uploadFileToVolume(file).subscribe({
      next: () => {
        this.toast.notify('File uploaded directly to persistent volume (PVC)!', 'success');
        this.refreshVolumeFiles();
      },
      error: (e) => this.toast.notify('Error writing to volume: ' + this.errMsg(e), 'error')
    });
  }

  deleteVolumeFile(name: string) {
    if (confirm(`Are you sure you want to delete file "${name}" from the volume?`)) {
      this.driveService.deleteVolumeFile(name).subscribe({
        next: () => {
          this.refreshVolumeFiles();
          this.toast.notify('File deleted from volume.', 'success');
        },
        error: (e) => this.toast.notify('Error deleting file from volume: ' + this.errMsg(e), 'error')
      });
    }
  }

  refreshVolumeFiles() {
    this.driveService.getVolumeFiles().subscribe({
      next: (files) => {
        this.volumeFiles.set(files);
        if (this.volumeCurrentPage() > this.volumeTotalPages()) {
          this.volumeCurrentPage.set(this.volumeTotalPages());
        }
      },
      error: (e) => console.warn('Could not retrieve volume files:', e)
    });
  }

  s3PrevPage() {
    if (this.s3CurrentPage() > 1) {
      this.s3CurrentPage.update(p => p - 1);
    }
  }

  s3NextPage() {
    if (this.s3CurrentPage() < this.s3TotalPages()) {
      this.s3CurrentPage.update(p => p + 1);
    }
  }

  volumePrevPage() {
    if (this.volumeCurrentPage() > 1) {
      this.volumeCurrentPage.update(p => p - 1);
    }
  }

  volumeNextPage() {
    if (this.volumeCurrentPage() < this.volumeTotalPages()) {
      this.volumeCurrentPage.update(p => p + 1);
    }
  }

  private errMsg(e: any): string {
    return e?.error?.error?.message || e?.error?.error || e?.error?.message || e?.message || 'Unknown error';
  }
}
