import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  toasts = signal<{ id: number; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  private toastSeq = 0;

  notify(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const id = ++this.toastSeq;
    this.toasts.update(t => [...t, { id, message, type }]);
    setTimeout(() => this.dismissToast(id), 4500);
  }

  dismissToast(id: number) {
    this.toasts.update(t => t.filter(x => x.id !== id));
  }
}
