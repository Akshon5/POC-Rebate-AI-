import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-admin-console',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="admin-wrapper animate-fade-in">
      
      <!-- Page Header -->
      <div class="page-header">
        <div class="page-title">
          <h2>Admin Management Console</h2>
          <p>Import supplier contracts, upload sales register logs, and manage supplier records</p>
        </div>
      </div>

      <div class="grid-cols-2">
        <!-- Left Side: Data Import Operations -->
        <div class="glass-panel uploads-column">
          <h3>📊 Import Operations</h3>
          <p class="subtitle">Upload files to feed the rebate calculation database</p>

          <!-- PDF Agreement Upload Dropzone -->
          <div class="upload-box">
            <div class="upload-icon">📄</div>
            <h4>Supplier Agreement Contracts</h4>
            <p>Upload a supplier agreement (PDF format only) to run AI rule extraction</p>
            
            <label class="file-select-btn">
              Choose PDF Contract
              <input 
                type="file" 
                accept=".pdf" 
                (change)="onPdfSelected($event)" 
                style="display: none;"
                [disabled]="pdfLoading()"
              />
            </label>

            @if (pdfLoading()) {
              <div class="loading-state">
                <span class="spinner"></span> Running OCR & Extracting Rules...
              </div>
            }
            @if (pdfSuccess()) {
              <div class="status-banner success">
                ✔ Contract parsed! Routing to Rule Validator...
              </div>
            }
          </div>

          <!-- Excel Sales Register Upload Dropzone -->
          <div class="upload-box excel-box">
            <div class="upload-icon">📊</div>
            <h4>Sales Register Transactions</h4>
            <p>Upload transactional item-level records (Excel .xlsx / .xls format)</p>
            
            <label class="file-select-btn excel-btn">
              Choose Excel Register
              <input 
                type="file" 
                accept=".xlsx,.xls" 
                (change)="onExcelSelected($event)" 
                style="display: none;"
                [disabled]="excelLoading()"
              />
            </label>

            @if (excelLoading()) {
              <div class="loading-state">
                <span class="spinner"></span> Parsing transactions & running calculations...
              </div>
            }
            @if (excelResult()) {
              <div class="status-banner success font-small">
                <strong>Import complete!</strong><br>
                Records: {{ excelResult()!.records_imported }}<br>
                Suppliers updated: {{ excelResult()!.suppliers_updated }}<br>
                Calculations rerun: {{ excelResult()!.calculations_executed }}
              </div>
            }
          </div>
        </div>

        <!-- Right Side: Supplier Database Management -->
        <div class="glass-panel db-column">
          <h3>🏢 Supplier Database</h3>
          <p class="subtitle">View and add active suppliers registered in the system</p>

          <!-- Create Supplier Form -->
          <form (ngSubmit)="onCreateSupplier()" class="supplier-form">
            <div class="form-row">
              <div class="form-group flex-1">
                <label for="supName">Supplier Name</label>
                <input 
                  type="text" 
                  id="supName" 
                  [(ngModel)]="newSupName" 
                  name="newSupName" 
                  placeholder="e.g., DHL Malaysia" 
                  class="form-input"
                  required
                />
              </div>
              <div class="form-group width-100">
                <label for="supCode">Code</label>
                <input 
                  type="text" 
                  id="supCode" 
                  [(ngModel)]="newSupCode" 
                  name="newSupCode" 
                  placeholder="DHL" 
                  class="form-input"
                  required
                />
              </div>
            </div>
            @if (supplierError()) {
              <div class="status-banner error font-small">{{ supplierError() }}</div>
            }
            <button type="submit" class="btn-primary">Add Supplier Record</button>
          </form>

          <!-- List of Suppliers -->
          <div class="supplier-list-container">
            <h4>Active Suppliers List</h4>
            <div class="list-scroller">
              @for (sup of suppliers(); track sup.id) {
                <div class="supplier-card">
                  <div class="sup-meta">
                    <span class="badge-code">{{ sup.code }}</span>
                    <strong>{{ sup.name }}</strong>
                  </div>
                  <span class="rules-count">{{ sup.rules?.length || 0 }} rules loaded</span>
                </div>
              } @empty {
                <div class="empty-list">No suppliers configured.</div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .admin-wrapper {
      display: flex;
      flex-direction: column;
      gap: 30px;
    }

    .subtitle {
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-bottom: 20px;
    }

    /* Column specific flex alignment */
    .uploads-column, .db-column {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* Dropzone Upload Box styling */
    .upload-box {
      border: 2px dashed var(--border);
      border-radius: 12px;
      padding: 30px 20px;
      text-align: center;
      background-color: transparent;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      transition: var(--ease);
    }

    .upload-box:hover {
      border-color: var(--accent);
      background-color: var(--accent-subtle);
      box-shadow: 0 4px 20px rgba(43,108,176,0.06);
    }

    .excel-box:hover {
      border-color: var(--color-success);
      background-color: var(--color-success-subtle);
      box-shadow: 0 4px 20px rgba(16, 185, 129, 0.08);
    }

    .upload-icon {
      font-size: 2.2rem;
      
    }

    .upload-box h4 {
      font-size: 1rem;
      font-weight: 700;
    }

    .upload-box p {
      font-size: 0.8rem;
      color: var(--text-secondary);
      max-width: 320px;
      line-height: 1.4;
    }

    .file-select-btn {
      display: inline-block;
      padding: 10px 20px;
      background: linear-gradient(135deg, var(--accent) 0%, #2c5282 100%);
      color: white;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(43,108,176,0.12);
      transition: var(--ease);
    }

    .file-select-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 14px rgba(43,108,176,0.2);
    }

    .excel-btn {
      background: linear-gradient(135deg, var(--color-success) 0%, #047857 100%);
      box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);
    }

    .excel-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 14px rgba(16, 185, 129, 0.3);
    }

    .loading-state {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: var(--text-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .status-banner {
      width: 100%;
      padding: 12px;
      border-radius: 8px;
      text-align: left;
      line-height: 1.5;
    }

    .status-banner.success {
      background-color: var(--color-success-subtle);
      border: 1px solid rgba(16, 185, 129, 0.2);
      color: #a7f3d0;
    }

    .status-banner.error {
      background-color: var(--color-danger-subtle);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: var(--color-danger);
    }

    .font-small {
      font-size: 0.8rem;
    }

    /* Supplier database form */
    .supplier-form {
      display: flex;
      flex-direction: column;
      gap: 15px;
      background-color: transparent;
      padding: 18px;
      border-radius: 10px;
      border: 1px solid var(--border);
    }

    .form-row {
      display: flex;
      gap: 15px;
    }

    .flex-1 { flex: 1; }
    .width-100 { width: 100px; }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
    }

    /* Supplier list scroller */
    .supplier-list-container {
      margin-top: 15px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .supplier-list-container h4 {
      font-size: 0.9rem;
      color: var(--text-secondary);
      font-weight: 600;
    }

    .list-scroller {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 250px;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      background-color: var(--bg-base);
    }

    .supplier-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-radius: 6px;
      background-color: #f7f8fa;
      border: 1px solid var(--border);
    }

    .sup-meta {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .badge-code {
      font-size: 0.7rem;
      font-weight: 800;
      color: var(--text-primary);
      background-color: var(--bg-white);
      border: 1px solid var(--border);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .sup-meta strong {
      font-size: 0.85rem;
    }

    .rules-count {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .empty-list {
      text-align: center;
      padding: 20px;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class AdminConsoleComponent implements OnInit {
  private dataService = inject(DataService);
  private router = inject(Router);

  // Lists
  suppliers = signal<any[]>([]);
  
  // Loading flags
  pdfLoading = signal(false);
  pdfSuccess = signal(false);

  excelLoading = signal(false);
  excelResult = signal<any | null>(null);

  // Form bindings
  newSupName = '';
  newSupCode = '';
  supplierError = signal<string | null>(null);

  ngOnInit(): void {
    this.loadSuppliers();
  }

  loadSuppliers(): void {
    this.dataService.getSuppliers().subscribe({
      next: (sups) => this.suppliers.set(sups)
    });
  }

  // Handle PDF Contract upload
  onPdfSelected(event: Event): void {
    const element = event.currentTarget as HTMLInputElement;
    const file = element.files?.[0];
    if (!file) return;

    this.pdfLoading.set(true);
    this.pdfSuccess.set(false);

    this.dataService.uploadContract(file).subscribe({
      next: (extractedDraft) => {
        this.pdfLoading.set(false);
        this.pdfSuccess.set(true);
        
        // Cache extracted draft rules in localStorage for the RuleValidator component
        localStorage.setItem('sales_condition_draft_rule', JSON.stringify(extractedDraft));

        // Delay routing slightly for visual success state confirmation
        setTimeout(() => {
          this.router.navigate(['/validate']);
        }, 1200);
      },
      error: (err) => {
        this.pdfLoading.set(false);
        alert(err.error?.detail || 'Failed to parse contract file.');
      }
    });
  }

  // Handle Excel Sales Register upload
  onExcelSelected(event: Event): void {
    const element = event.currentTarget as HTMLInputElement;
    const file = element.files?.[0];
    if (!file) return;

    this.excelLoading.set(true);
    this.excelResult.set(null);

    this.dataService.uploadSalesRegister(file).subscribe({
      next: (result) => {
        this.excelLoading.set(false);
        this.excelResult.set(result);
      },
      error: (err) => {
        this.excelLoading.set(false);
        alert(err.error?.detail || 'Failed to import Excel sales register.');
      }
    });
  }

  // Create new manual supplier
  onCreateSupplier(): void {
    this.supplierError.set(null);
    if (!this.newSupName || !this.newSupCode) return;

    this.dataService.createSupplier(this.newSupName, this.newSupCode).subscribe({
      next: () => {
        this.newSupName = '';
        this.newSupCode = '';
        this.loadSuppliers();
      },
      error: (err) => {
        this.supplierError.set(err.error?.detail || 'Could not register supplier.');
      }
    });
  }
}
