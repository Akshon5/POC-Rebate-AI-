import { inject } from '@angular/core';
import { Routes, Router } from '@angular/router';
import { AuthService } from './services/auth.service';

// Functional route guards for Auth
const authGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) {
    return true;
  }
  router.navigate(['/login']);
  return false;
};

const adminGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAdmin()) {
    return true;
  }
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
    path: 'upload-review',
    loadComponent: () => import('./components/upload-review/upload-review').then(m => m.UploadReviewComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'validate',
    loadComponent: () => import('./components/rule-validator/rule-validator').then(m => m.RuleValidatorComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: '',
    redirectTo: '/upload-review',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: '/upload-review'
  }
];
