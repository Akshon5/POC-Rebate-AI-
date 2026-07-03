import { Component, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DataService } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-page">
      <!-- Top bar -->
      <div class="top-bar">
        <div class="tb-brand">
          <div class="tb-logo">SCP</div>
          <span class="tb-name">RebateIQ</span>
        </div>
      </div>

      <!-- Center card -->
      <div class="login-body">
        <div class="login-card">
          <div class="lc-header">
            <div class="lc-avatar">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <h2>Welcome Back</h2>
            <p>Sign in to Sales Condition POC</p>
          </div>

          <form (ngSubmit)="onSubmit()" class="lc-form" autocomplete="on">
            <div class="lc-field">
              <label for="username">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                USERNAME
              </label>
              <input type="text" id="username" name="username" [(ngModel)]="username"
                placeholder="Username" required autocomplete="username"/>
            </div>

            <div class="lc-field">
              <label for="password">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                PASSWORD
              </label>
              <input type="password" id="password" name="password" [(ngModel)]="password"
                placeholder="••••••••" required autocomplete="current-password"/>
            </div>

            @if (errorMessage()) {
              <div class="lc-error">{{ errorMessage() }}</div>
            }

            <button type="submit" [disabled]="isLoading()" class="lc-btn">
              @if (isLoading()) {
                <span class="lc-spin"></span> Signing in...
              } @else {
                Sign In
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              }
            </button>
          </form>

          <div class="lc-divider"><span>demo credentials</span></div>

          <div class="lc-creds">
            <div class="cr"><span class="cr-label">Admin</span> <code>admin</code> / <code>password123</code></div>
            <div class="cr"><span class="cr-label">User</span> <code>user</code> / <code>password123</code></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      background-color: #f0f2f5;
      font-family: 'Inter', sans-serif;
      display: flex;
      flex-direction: column;
    }

    /* Top bar */
    .top-bar {
      height: 52px;
      background-color: #2b5797;
      display: flex;
      align-items: center;
      padding: 0 28px;
    }

    .tb-brand { display: flex; align-items: center; gap: 10px; }

    .tb-logo {
      width: 28px;
      height: 28px;
      background: #ffffff;
      color: #2b5797;
      font-size: 0.6rem;
      font-weight: 900;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
    }

    .tb-name {
      font-size: 0.95rem;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.3px;
    }

    /* Body */
    .login-body {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
    }

    .login-card {
      width: 100%;
      max-width: 400px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 40px 36px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }

    /* Header */
    .lc-header { text-align: center; margin-bottom: 32px; }

    .lc-avatar {
      width: 56px;
      height: 56px;
      border-radius: 14px;
      background-color: #ebf4ff;
      border: 1px solid #bee3f8;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #2b6cb0;
      margin-bottom: 18px;
    }

    .lc-header h2 {
      font-size: 1.3rem;
      font-weight: 700;
      color: #1a202c;
      margin-bottom: 5px;
    }

    .lc-header p {
      font-size: 0.82rem;
      color: #a0aec0;
    }

    /* Form */
    .lc-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .lc-field { display: flex; flex-direction: column; gap: 6px; }

    .lc-field label {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 0.68rem;
      font-weight: 700;
      color: #718096;
      letter-spacing: 0.6px;
    }

    .lc-field label svg { color: #a0aec0; }

    .lc-field input {
      width: 100%;
      padding: 11px 14px;
      border-radius: 6px;
      background-color: #f7f8fa;
      border: 1px solid #e2e8f0;
      color: #1a202c;
      font-size: 0.9rem;
      font-family: 'Inter', sans-serif;
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    .lc-field input::placeholder { color: #cbd5e0; }

    .lc-field input:focus {
      outline: none;
      border-color: #2b6cb0;
      box-shadow: 0 0 0 3px rgba(43,108,176,0.08);
      background-color: #ffffff;
    }

    /* Error */
    .lc-error {
      padding: 10px 14px;
      background: #fff5f5;
      border: 1px solid #fed7d7;
      border-radius: 6px;
      color: #e53e3e;
      font-size: 0.82rem;
      font-weight: 500;
    }

    /* Button */
    .lc-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 6px;
      background-color: #2b6cb0;
      color: #ffffff;
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      transition: background-color 0.15s;
      margin-top: 4px;
      box-shadow: 0 1px 3px rgba(43,108,176,0.3);
    }

    .lc-btn:hover:not(:disabled) { background-color: #2c5282; }
    .lc-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .lc-spin {
      width: 13px; height: 13px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: inline-block;
    }

    /* Divider */
    .lc-divider {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 24px 0 14px;
      font-size: 0.68rem;
      color: #cbd5e0;
      letter-spacing: 0.5px;
    }
    .lc-divider::before, .lc-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background-color: #e2e8f0;
    }

    /* Creds */
    .lc-creds { display: flex; flex-direction: column; gap: 6px; }

    .cr {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-radius: 6px;
      background: #f7f8fa;
      border: 1px solid #e2e8f0;
      font-size: 0.78rem;
      color: #718096;
    }

    .cr-label {
      font-size: 0.65rem;
      font-weight: 800;
      color: #a0aec0;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .cr code {
      color: #2b6cb0;
      background: #ebf4ff;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 0.8rem;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class LoginComponent {
  private dataService = inject(DataService);
  private authService = inject(AuthService);
  private router = inject(Router);

  username = '';
  password = '';
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  onSubmit(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.dataService.login(this.username, this.password).subscribe({
      next: (user) => {
        this.authService.setSession(user);
        this.isLoading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.status === 401
          ? 'Invalid username or password.'
          : 'Cannot connect to authentication server.');
      }
    });
  }
}
