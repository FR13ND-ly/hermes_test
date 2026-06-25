import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  userId = signal<string | null>(null);
  userIdentifier = signal<string>('');

  constructor() {
    if (typeof window !== 'undefined') {
      const savedUserId = localStorage.getItem('hermes_user_id');
      const savedIdentifier = localStorage.getItem('hermes_user_identifier');
      if (savedUserId && savedIdentifier) {
        this.userId.set(savedUserId);
        this.userIdentifier.set(savedIdentifier);
      }
    }
  }

  saveSession(userId: string, identifier: string, accessToken?: string, refreshToken?: string) {
    this.userId.set(userId);
    this.userIdentifier.set(identifier);
    if (typeof window !== 'undefined') {
      localStorage.setItem('hermes_user_id', userId);
      localStorage.setItem('hermes_user_identifier', identifier);
      if (accessToken) localStorage.setItem('hermes_access_token', accessToken);
      if (refreshToken) localStorage.setItem('hermes_refresh_token', refreshToken);
    }
  }

  clearSession() {
    this.userId.set(null);
    this.userIdentifier.set('');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('hermes_user_id');
      localStorage.removeItem('hermes_user_identifier');
      localStorage.removeItem('hermes_access_token');
      localStorage.removeItem('hermes_refresh_token');
    }
  }
}
