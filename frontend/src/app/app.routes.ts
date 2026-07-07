import { inject } from '@angular/core';
import { Routes, Router } from '@angular/router';
import { AuthService } from './services/auth.service';

// Functional route guards
const authGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) return true;
  router.navigate(['/login']);
  return false;
};

const adminGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAdmin()) return true;
  router.navigate(['/dashboard']);
  return false;
};

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./components/login/login').then(m => m.LoginComponent)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./components/dashboard/dashboard').then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    // Rebate Rules — visible to ALL authenticated users
    path: 'rebate-rules',
    loadComponent: () => import('./components/rebate-rules/rebate-rules').then(m => m.RebateRulesComponent),
    canActivate: [authGuard]
  },
  {
    // Upload & Review — Admin only
    path: 'upload-review',
    loadComponent: () => import('./components/upload-review/upload-review').then(m => m.UploadReviewComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    // Rule Validator — Admin only
    path: 'validate',
    loadComponent: () => import('./components/rule-validator/rule-validator').then(m => m.RuleValidatorComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    // User Management — Admin only
    path: 'users',
    loadComponent: () => import('./components/user-management/user-management').then(m => m.UserManagementComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
