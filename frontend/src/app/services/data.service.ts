import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:8000/api';

  // Auth
  login(username: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/login`, { username, password });
  }

  // Suppliers
  getSuppliers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/suppliers`);
  }

  createSupplier(name: string, code: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/suppliers`, { name, code });
  }

  // Contracts & AI Extraction
  uploadContract(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.apiUrl}/contracts/upload`, formData);
  }

  // Rules (Human-in-the-loop)
  getRules(validatedOnly = false): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/rules?validated_only=${validatedOnly}`);
  }

  saveValidatedRule(rule: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/rules/save`, rule);
  }

  // Sales Register Upload
  uploadSalesRegister(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.apiUrl}/sales/upload`, formData);
  }

  // Dashboard KPIs & Analytics
  getDashboardKpis(): Observable<any> {
    return this.http.get(`${this.apiUrl}/dashboard/kpis`);
  }

  getCalculations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/dashboard/calculations`);
  }
}
