import { Injectable, signal, computed } from '@angular/core';

export interface UserSession {
  id: number;
  username: string;
  role: string; // 'admin' or 'user'
  full_name?: string;
  email?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Store the active session using signals
  private currentSession = signal<UserSession | null>(null);

  // Computed signals for components to listen to
  readonly currentUser = this.currentSession.asReadonly();
  readonly isLoggedIn = computed(() => this.currentSession() !== null);
  readonly isAdmin = computed(() => this.currentSession()?.role === 'admin');

  constructor() {
    // Attempt to load session from localStorage on start
    const saved = localStorage.getItem('sales_condition_poc_session');
    if (saved) {
      try {
        this.currentSession.set(JSON.parse(saved));
      } catch (e) {
        localStorage.removeItem('sales_condition_poc_session');
      }
    }
  }

  setSession(user: UserSession): void {
    this.currentSession.set(user);
    localStorage.setItem('sales_condition_poc_session', JSON.stringify(user));
  }

  logout(): void {
    this.currentSession.set(null);
    localStorage.removeItem('sales_condition_poc_session');
  }
}
