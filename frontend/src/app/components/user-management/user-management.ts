import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';

interface AppUser {
  id: number;
  username: string;
  full_name: string | null;
  email: string | null;
  role: string;
}

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="um-page">

      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h2 class="page-title">User Management</h2>
          <p class="page-sub">Add, view and manage application users</p>
        </div>
        <button class="btn-primary" (click)="showForm.set(!showForm())">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {{ showForm() ? 'Cancel' : 'Add User' }}
        </button>
      </div>

      <!-- Add User Form -->
      @if (showForm()) {
        <div class="form-card">
          <h3 class="form-title">Register New User</h3>
          <div class="form-grid">
            <div class="field">
              <label>Full Name</label>
              <input type="text" [(ngModel)]="newUser.full_name" placeholder="e.g. Jane Doe" />
            </div>
            <div class="field">
              <label>Email Address</label>
              <input type="email" [(ngModel)]="newUser.email" placeholder="e.g. jane@company.com" />
            </div>
            <div class="field">
              <label>Username</label>
              <input type="text" [(ngModel)]="newUser.username" placeholder="e.g. jdoe" />
            </div>
            <div class="field">
              <label>Password</label>
              <input type="password" [(ngModel)]="newUser.password" placeholder="Set a password" />
            </div>
            <div class="field">
              <label>Role</label>
              <select [(ngModel)]="newUser.role">
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div class="field field-action">
              <label>&nbsp;</label>
              <button class="btn-save" (click)="createUser()" [disabled]="saving()">
                {{ saving() ? 'Saving...' : 'Create User' }}
              </button>
            </div>
          </div>
          @if (formError()) {
            <div class="msg msg-error">{{ formError() }}</div>
          }
          @if (formSuccess()) {
            <div class="msg msg-success">{{ formSuccess() }}</div>
          }
        </div>
      }

      <!-- Users Table -->
      <div class="table-card">
        @if (loading()) {
          <div class="state-info">Loading users…</div>
        } @else if (users().length === 0) {
          <div class="state-info">No users found.</div>
        } @else {
          <table class="um-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Username</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr>
                  <td class="cell-id">{{ u.id }}</td>
                  <td class="cell-name">{{ u.full_name || '—' }}</td>
                  <td class="cell-email">{{ u.email || '—' }}</td>
                  <td class="cell-user">{{ u.username }}</td>
                  <td>
                    <span class="badge" [class.badge-admin]="u.role === 'admin'" [class.badge-user]="u.role === 'user'">
                      {{ u.role }}
                    </span>
                  </td>
                  <td>
                    @if (u.username !== auth.currentUser()?.username) {
                      <button class="btn-delete" (click)="deleteUser(u.id, u.username)">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6"/><path d="M14 11v6"/>
                        </svg>
                        Delete
                      </button>
                    } @else {
                      <span class="current-badge">You</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

    </div>
  `,
  styles: [`
    .um-page { padding: 28px 32px; max-width: 1100px; }

    /* Header */
    .page-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 24px;
    }
    .page-title { font-size: 1.4rem; font-weight: 700; color: var(--text-primary, #1a202c); margin: 0 0 4px; }
    .page-sub   { font-size: 0.82rem; color: var(--text-muted, #6b7280); margin: 0; }

    /* Buttons */
    .btn-primary {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 6px; border: none;
      background: var(--accent, #2b6cb0); color: #fff;
      font-size: 0.83rem; font-weight: 600; cursor: pointer;
      transition: opacity 0.15s;
    }
    .btn-primary:hover { opacity: 0.88; }
    .btn-save {
      padding: 9px 20px; border-radius: 6px; border: none;
      background: var(--accent, #2b6cb0); color: #fff;
      font-size: 0.83rem; font-weight: 600; cursor: pointer;
      width: 100%; transition: opacity 0.15s;
    }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-delete {
      display: flex; align-items: center; gap: 5px;
      padding: 5px 10px; border-radius: 5px; border: 1px solid #fca5a5;
      background: #fff5f5; color: #dc2626;
      font-size: 0.78rem; font-weight: 500; cursor: pointer;
      transition: background 0.15s;
    }
    .btn-delete:hover { background: #fee2e2; }

    /* Form card */
    .form-card {
      background: var(--bg-surface, #fff); border: 1px solid var(--border, #e2e8f0);
      border-radius: 10px; padding: 22px 24px; margin-bottom: 24px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    .form-title { font-size: 0.95rem; font-weight: 600; color: var(--text-primary, #1a202c); margin: 0 0 18px; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px 16px; }
    .field { display: flex; flex-direction: column; gap: 5px; }
    .field-action { justify-content: flex-end; }
    .field label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary, #374151); }
    .field input, .field select {
      padding: 8px 11px; border-radius: 6px;
      border: 1px solid var(--border, #d1d5db);
      background: var(--bg-input, #f7f8fa);
      font-size: 0.83rem; color: var(--text-primary, #1a202c);
      outline: none; transition: border-color 0.15s;
    }
    .field input:focus, .field select:focus { border-color: var(--accent, #2b6cb0); }

    /* Messages */
    .msg { margin-top: 12px; padding: 9px 14px; border-radius: 6px; font-size: 0.82rem; font-weight: 500; }
    .msg-error   { background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; }
    .msg-success { background: #f0fdf4; color: #166534; border: 1px solid #86efac; }

    /* Table */
    .table-card {
      background: var(--bg-surface, #fff); border: 1px solid var(--border, #e2e8f0);
      border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    .state-info { padding: 32px; text-align: center; color: var(--text-muted, #9ca3af); font-size: 0.88rem; }
    .um-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
    .um-table thead tr { background: var(--bg-base, #f0f2f5); }
    .um-table th {
      padding: 11px 16px; text-align: left;
      font-size: 0.75rem; font-weight: 700; letter-spacing: 0.04em;
      color: var(--text-secondary, #6b7280); text-transform: uppercase;
      border-bottom: 1px solid var(--border, #e2e8f0);
    }
    .um-table td { padding: 12px 16px; border-bottom: 1px solid var(--border-light, #f3f4f6); color: var(--text-primary, #1a202c); }
    .um-table tbody tr:last-child td { border-bottom: none; }
    .um-table tbody tr:hover { background: var(--bg-hover, #f9fafb); }
    .cell-id    { color: var(--text-muted, #9ca3af); font-size: 0.78rem; width: 48px; }
    .cell-name  { font-weight: 600; }
    .cell-email { color: var(--text-secondary, #4b5563); }
    .cell-user  { font-family: monospace; font-size: 0.82rem; }

    /* Badges */
    .badge { display: inline-flex; padding: 3px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .badge-admin { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .badge-user  { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
    .current-badge { font-size: 0.72rem; color: var(--text-muted, #9ca3af); font-style: italic; }
  `]
})
export class UserManagementComponent implements OnInit {
  private data = inject(DataService);
  auth = inject(AuthService);

  users = signal<AppUser[]>([]);
  loading = signal(true);
  showForm = signal(false);
  saving = signal(false);
  formError = signal('');
  formSuccess = signal('');

  newUser = { full_name: '', email: '', username: '', password: '', role: 'user' };

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.loading.set(true);
    this.data.getUsers().subscribe({
      next: (list) => { this.users.set(list); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  createUser() {
    this.formError.set('');
    this.formSuccess.set('');
    const { full_name, email, username, password, role } = this.newUser;
    if (!full_name || !email || !username || !password) {
      this.formError.set('All fields are required.');
      return;
    }
    this.saving.set(true);
    this.data.createUser({ full_name, email, username, password, role }).subscribe({
      next: (user) => {
        this.users.update(list => [...list, user]);
        this.newUser = { full_name: '', email: '', username: '', password: '', role: 'user' };
        this.formSuccess.set(`User "${user.username}" created successfully.`);
        this.saving.set(false);
        setTimeout(() => { this.formSuccess.set(''); this.showForm.set(false); }, 2000);
      },
      error: (err) => {
        this.formError.set(err?.error?.detail || 'Failed to create user.');
        this.saving.set(false);
      }
    });
  }

  deleteUser(id: number, username: string) {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    this.data.deleteUser(id).subscribe({
      next: () => this.users.update(list => list.filter(u => u.id !== id)),
      error: () => alert('Failed to delete user.')
    });
  }
}
