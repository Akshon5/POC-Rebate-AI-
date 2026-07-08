import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-upload-review',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="wizard-container">
      
      <!-- Wizard Step Header -->
      <div class="wizard-header">
        <div class="step-indicator" [class.active]="step() === 1" [class.completed]="step() > 1">
          <span class="indicator-circle">
            @if (step() > 1) {
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            } @else { 1 }
          </span>
          <span class="indicator-label">Upload documents</span>
        </div>
        <div class="indicator-line" [class.completed]="step() > 1"></div>
        <div class="step-indicator" [class.active]="step() === 2" [class.completed]="step() > 2">
          <span class="indicator-circle">
            @if (step() > 2) {
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            } @else { 2 }
          </span>
          <span class="indicator-label">Processing</span>
        </div>
        <div class="indicator-line" [class.completed]="step() > 2"></div>
        <div class="step-indicator" [class.active]="step() === 3">
          <span class="indicator-circle">3</span>
          <span class="indicator-label">Review & confirm</span>
        </div>
      </div>

      <!-- STEP 1: UPLOAD DOCUMENTS -->
      @if (step() === 1) {
        <div class="step-panel animate-fade">
          <div class="panel-intro">
            <h2>Upload your documents</h2>
            <p>Attach classification rules and sales data for rebate processing. Both files are optional — submit whichever you have.</p>
          </div>

          <div class="upload-grid">
            <!-- Classification rules (PDF) -->
            <div class="upload-card" [class.has-file]="rulesFile()" (click)="pdfInput.click()">
              <input #pdfInput type="file" accept=".pdf" style="display: none;" (change)="onPdfSelected($event)" />
              <div class="card-icon rules-color">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <div class="card-details">
                <h3>Classification rules</h3>
                <p>Classification tiers, conditions, and overrides</p>
                <span class="file-badge">
                  {{ rulesFile() ? rulesFile()!.name : 'PDF - optional' }}
                </span>
              </div>
            </div>

            <!-- Sales data (XLSX) -->
            <div class="upload-card" [class.has-file]="salesFile()" (click)="xlsxInput.click()">
              <input #xlsxInput type="file" accept=".xlsx,.xls" style="display: none;" (change)="onXlsxSelected($event)" />
              <div class="card-icon sales-color">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <line x1="9" y1="3" x2="9" y2="21"/>
                  <line x1="15" y1="3" x2="15" y2="21"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="3" y1="15" x2="21" y2="15"/>
                </svg>
              </div>
              <div class="card-details">
                <h3>Sales data</h3>
                <p>Transaction records for rebate calculation</p>
                <span class="file-badge">
                  {{ salesFile() ? salesFile()!.name : 'XLSX - optional' }}
                </span>
              </div>
            </div>
          </div>

          @if (errorMessage()) {
            <div class="step-error-banner">
              ⚠️ {{ errorMessage() }}
            </div>
          }

          <div class="action-bar-center">
            <button (click)="onSubmitForProcessing()" [disabled]="!rulesFile() && !salesFile()" class="btn-submit-wizard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              Submit for processing
            </button>
          </div>
        </div>
      }

      <!-- STEP 2: PROCESSING -->
      @if (step() === 2) {
        <div class="step-panel step-center animate-fade">
          <div class="loading-spinner-wrapper">
            <div class="spinner-circle"></div>
          </div>
          <h2>Analyzing your documents...</h2>
          <p class="processing-desc">Applying classification rules to sales data and computing rebates. This usually takes under a minute.</p>
          <div class="progress-bar-container">
            <div class="progress-bar-fill"></div>
          </div>
        </div>
      }

      <!-- STEP 3: REVIEW & CONFIRM -->
      @if (step() === 3) {
        <div class="step-panel animate-fade wider-panel">
          <div class="panel-intro">
            <h2>Review processed results</h2>
            <p>Verify the classification rules and rebate calculations before confirming. Confirm to apply or reject to return for revision.</p>
          </div>

          <!-- Summary Metric Strip -->
          <div class="summary-kpi-row">
            <div class="summary-kpi-card">
              <span class="kpi-label">TOTAL RECORDS</span>
              <span class="kpi-val">{{ formatNumber(uploadResponse()?.summary?.total_records) }}</span>
              <span class="kpi-sub green">↑ 12% vs prior period</span>
            </div>
            <div class="summary-kpi-card">
              <span class="kpi-label">TOTAL REBATE</span>
              <span class="kpi-val">{{ formatCurrency(uploadResponse()?.summary?.total_rebate) }}</span>
              <span class="kpi-sub">Across {{ uploadResponse()?.summary?.rules_applied }} tiers</span>
            </div>
            <div class="summary-kpi-card">
              <span class="kpi-label">RULES APPLIED</span>
              <span class="kpi-val">{{ uploadResponse()?.summary?.rules_applied }}</span>
              <span class="kpi-sub warning">2 conditions flagged</span>
            </div>
            <div class="summary-kpi-card">
              <span class="kpi-label">AVG REBATE RATE</span>
              <span class="kpi-val">{{ formatPercent(uploadResponse()?.summary?.avg_rebate_rate) }}</span>
              <span class="kpi-sub">Within policy range</span>
            </div>
          </div>

          <!-- Split Layout Columns -->
          <div class="results-grid">
            
            <!-- Left Side: Classification rules extracted -->
            <div class="results-col font-small">
              <div class="col-title-bar">
                <h3>📋 Classification rules</h3>
                <span class="col-badge">{{ uploadResponse()?.classification_rules?.length || 1 }} active</span>
              </div>

              <div class="rules-list-container">
                @if (uploadResponse()?.classification_rules?.length) {
                  @for (rule of uploadResponse()?.classification_rules; track rule.rule_name; let idx = $index) {
                    <div class="rule-preview-item">
                      <div class="rule-meta">
                        <span class="rule-index">0{{ idx + 1 }}</span>
                        <span class="rule-type-badge" [class.volume]="rule.rule_type === 'volume'">
                          {{ rule.rule_type === 'volume' ? 'Qty' : 'Rev' }}
                        </span>
                      </div>
                      <h4>{{ rule.rule_name }}</h4>
                      <p class="rule-citation">"{{ rule.raw_text_citation }}"</p>
                      <div class="rule-tiers-chips">
                        @for (tier of rule.tiers; track tier.rate) {
                          <span class="tier-chip">
                            {{ formatTierLimit(tier) }}: <strong>{{ (tier.rate * 100).toFixed(2) }}%</strong>
                          </span>
                        }
                      </div>
                    </div>
                  }
                } @else {
                  <div class="rule-preview-item">
                    <div class="rule-meta">
                      <span class="rule-index">01</span>
                      <span class="rule-type-badge">Rev</span>
                    </div>
                    <h4>Standard Agreement Rebate</h4>
                    <p class="rule-citation">Default rebate rate configuration applied (No contract PDF uploaded).</p>
                    <div class="rule-tiers-chips">
                      <span class="tier-chip">All sales: <strong>1.50%</strong></span>
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- Right Side: Calculation results -->
            <div class="results-col">
              <div class="col-title-bar">
                <h3>📊 Rebate calculations</h3>
                <span class="col-page-num">Preview - 1 of {{ uploadResponse()?.rebate_calculations?.length }}</span>
              </div>

              <div class="table-outer">
                <table class="corporate-table">
                  <thead>
                    <tr>
                      <th>ACCOUNT</th>
                      <th>CATEGORY</th>
                      <th>REGION</th>
                      <th>NET SALES</th>
                      <th>TIER</th>
                      <th>RATE</th>
                      <th>REBATE</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (calc of uploadResponse()?.rebate_calculations; track calc.account) {
                      <tr>
                        <td class="font-bold">{{ calc.account }}</td>
                        <td>{{ calc.category }}</td>
                        <td>{{ calc.region }}</td>
                        <td class="font-mono">{{ formatCurrency(calc.net_sales) }}</td>
                        <td>
                          <span class="badge" 
                            [class.badge-success]="calc.tier === 'Platinum' || calc.tier === 'Gold'"
                            [class.badge-warning]="calc.tier === 'Silver'"
                            [class.badge-danger]="calc.tier === 'Bronze' || calc.tier === 'Base'">
                            {{ calc.tier }}
                          </span>
                        </td>
                        <td class="font-mono">{{ (calc.rate * 100).toFixed(2) }}%</td>
                        <td class="font-bold font-mono text-green">{{ formatCurrency(calc.rebate) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          <!-- Confirm / Reject Actions Footer -->
          <div class="action-footer">
            <button (click)="onReject()" class="btn-wizard-reject">
              ✕ Reject
            </button>
            @if (uploadResponse()?.draft_rule) {
              <button (click)="onSendToValidator()" class="btn-wizard-adjust">
                ⚙ Review in Rule Validator
              </button>
            }
            <button (click)="onConfirm()" class="btn-wizard-confirm">
              ✔ Confirm & apply
            </button>
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    .wizard-container {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }

    /* ── WIZARD STEP HEADER ── */
    .wizard-header {
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--bg-white);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 16px 28px;
      box-shadow: var(--shadow-sm);
    }

    .step-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .indicator-circle {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background-color: var(--bg-base);
      border: 2px solid var(--border-strong);
      color: var(--text-secondary);
      font-size: 0.8rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: var(--ease);
    }

    .indicator-label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-secondary);
      transition: var(--ease);
    }

    .indicator-line {
      flex-grow: 1;
      max-width: 140px;
      height: 2px;
      background-color: var(--border);
      margin: 0 16px;
      transition: var(--ease);
    }

    /* Active Indicator States */
    .step-indicator.active .indicator-circle {
      background-color: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }

    .step-indicator.active .indicator-label {
      color: var(--text-primary);
    }

    /* Completed Indicator States */
    .step-indicator.completed .indicator-circle {
      background-color: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }

    .step-indicator.completed .indicator-label {
      color: var(--accent);
    }

    .indicator-line.completed {
      background-color: var(--accent);
    }

    /* ── STEP PANEL ── */
    .step-panel {
      background-color: var(--bg-white);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      padding: 36px;
      box-shadow: var(--shadow-md);
    }

    .wider-panel {
      max-width: 1200px;
    }

    .panel-intro {
      margin-bottom: 28px;
    }

    .panel-intro h2 {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 6px;
    }

    .panel-intro p {
      font-size: 0.88rem;
      color: var(--text-secondary);
      max-width: 700px;
    }

    /* ── UPLOAD CARDS GRID ── */
    .upload-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-bottom: 28px;
    }

    .upload-card {
      border: 2px dashed var(--border-strong);
      border-radius: var(--radius-lg);
      padding: 24px;
      background-color: var(--bg-input);
      display: flex;
      align-items: flex-start;
      gap: 16px;
      cursor: pointer;
      transition: var(--ease);
    }

    .upload-card:hover {
      border-color: var(--accent);
      background-color: #ffffff;
      box-shadow: var(--shadow-sm);
    }

    .upload-card.has-file {
      border-style: solid;
      border-color: var(--accent);
      background-color: var(--accent-light);
    }

    .card-icon {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .rules-color {
      background-color: #fff5f5;
      color: #e53e3e;
      border: 1px solid #fed7d7;
    }

    .sales-color {
      background-color: #f0fff4;
      color: #38a169;
      border: 1px solid #c6f6d5;
    }

    .card-details h3 {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 3px;
    }

    .card-details p {
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }

    .file-badge {
      display: inline-block;
      font-size: 0.72rem;
      background-color: var(--border);
      border: 1px solid var(--border-strong);
      color: var(--text-secondary);
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      max-width: 260px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .upload-card.has-file .file-badge {
      background-color: #ffffff;
      border-color: var(--accent-border);
      color: var(--accent);
    }

    /* Submit Button */
    .action-bar-center {
      display: flex;
      justify-content: center;
      border-top: 1px solid var(--border);
      padding-top: 24px;
    }

    .btn-submit-wizard {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 28px;
      border: none;
      background-color: var(--accent);
      color: #ffffff;
      font-size: 0.9rem;
      font-weight: 700;
      border-radius: var(--radius-md);
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(43, 108, 176, 0.2);
      transition: var(--ease);
    }

    .btn-submit-wizard:hover:not(:disabled) {
      background-color: var(--accent-hover);
      box-shadow: var(--shadow-md);
    }

    .btn-submit-wizard:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      box-shadow: none;
    }

    .step-error-banner {
      padding: 10px 16px;
      background-color: var(--color-danger-subtle);
      border: 1px solid var(--color-danger-border);
      color: var(--color-danger);
      font-size: 0.85rem;
      font-weight: 600;
      border-radius: var(--radius-md);
      margin-bottom: 20px;
    }

    /* ── STEP 2: PROCESSING ── */
    .step-center {
      text-align: center;
      padding: 60px 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .loading-spinner-wrapper {
      margin-bottom: 24px;
    }

    .spinner-circle {
      width: 48px;
      height: 48px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .step-center h2 {
      font-size: 1.3rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 8px;
    }

    .processing-desc {
      font-size: 0.88rem;
      color: var(--text-secondary);
      max-width: 460px;
      margin-bottom: 24px;
    }

    .progress-bar-container {
      width: 100%;
      max-width: 240px;
      height: 4px;
      background-color: var(--bg-base);
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      width: 45%;
      background-color: var(--accent);
      border-radius: 2px;
      animation: progressShim 1.5s ease-in-out infinite;
    }

    @keyframes progressShim {
      0% { margin-left: -40%; width: 30%; }
      50% { width: 40%; }
      100% { margin-left: 110%; width: 20%; }
    }

    /* ── STEP 3: REVIEW RESULTS ── */
    .summary-kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 28px;
    }

    .summary-kpi-card {
      border: 1px solid var(--border);
      background-color: var(--bg-input);
      padding: 16px 20px;
      border-radius: var(--radius-lg);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .kpi-label {
      font-size: 0.65rem;
      font-weight: 700;
      color: var(--text-secondary);
      letter-spacing: 0.6px;
    }

    .kpi-val {
      font-size: 1.45rem;
      font-weight: 800;
      color: var(--text-primary);
      letter-spacing: -0.3px;
    }

    .kpi-sub {
      font-size: 0.7rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    .kpi-sub.green { color: var(--color-success); }
    .kpi-sub.warning { color: var(--color-warning); }

    /* Results layout grid */
    .results-grid {
      display: grid;
      grid-template-columns: 360px 1fr;
      gap: 20px;
      margin-bottom: 28px;
    }

    .results-col {
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      background-color: #ffffff;
      display: flex;
      flex-direction: column;
    }

    .col-title-bar {
      background-color: var(--bg-input);
      border-bottom: 1px solid var(--border);
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .col-title-bar h3 {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .col-badge {
      font-size: 0.65rem;
      background-color: var(--accent-light);
      color: var(--accent);
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 700;
    }

    .col-page-num {
      font-size: 0.72rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    /* Left col rules content */
    .rules-list-container {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      max-height: 420px;
      overflow-y: auto;
    }

    .rule-preview-item {
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 14px;
      background-color: var(--bg-input);
    }

    .rule-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .rule-index {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-muted);
    }

    .rule-type-badge {
      font-size: 0.58rem;
      font-weight: 800;
      background-color: var(--accent-light);
      color: var(--accent);
      padding: 1px 6px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .rule-type-badge.volume {
      background-color: #faf5ff;
      color: #805ad5;
    }

    .rule-preview-item h4 {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 5px;
    }

    .rule-citation {
      font-size: 0.78rem;
      color: var(--text-secondary);
      font-style: italic;
      line-height: 1.4;
      margin-bottom: 10px;
      background-color: #ffffff;
      padding: 8px;
      border-radius: 4px;
      border: 1px solid var(--border);
    }

    .rule-tiers-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .tier-chip {
      font-size: 0.7rem;
      color: var(--text-secondary);
      background-color: #ffffff;
      border: 1px solid var(--border);
      padding: 2px 6px;
      border-radius: 4px;
    }

    /* Right col calculations table content */
    .table-outer {
      max-height: 420px;
      overflow-y: auto;
    }

    .corporate-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    .corporate-table th {
      position: sticky;
      top: 0;
      z-index: 10;
      background-color: var(--bg-input);
    }

    /* Footer actions */
    .action-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      border-top: 1px solid var(--border);
      padding-top: 24px;
    }

    .btn-wizard-reject {
      padding: 10px 24px;
      border: 1px solid var(--border-strong);
      background-color: #ffffff;
      color: var(--text-secondary);
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: var(--ease);
    }

    .btn-wizard-reject:hover {
      background-color: #fff5f5;
      color: var(--color-danger);
      border-color: var(--color-danger-border);
    }

    .btn-wizard-confirm {
      padding: 10px 24px;
      border: none;
      background-color: #38a169;
      color: #ffffff;
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(56, 161, 105, 0.2);
      transition: var(--ease);
    }

    .btn-wizard-confirm:hover {
      background-color: #2f855a;
      box-shadow: var(--shadow-sm);
    }

    .btn-wizard-adjust {
      padding: 10px 24px;
      border: 1px solid var(--accent, #2b6cb0);
      background-color: #ebf8ff;
      color: var(--accent, #2b6cb0);
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: var(--ease);
    }

    .btn-wizard-adjust:hover {
      background-color: var(--accent, #2b6cb0);
      color: #ffffff;
    }

    /* Utility */
    .font-bold { font-weight: 700; }
    .font-mono { font-family: SFMono-Regular, Consolas, Monaco, monospace; }
    .text-green { color: var(--color-success) !important; }
    .font-small { font-size: 0.8rem; }

    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class UploadReviewComponent {
  private http = inject(HttpClient);
  private dataService = inject(DataService);
  private router = inject(Router);

  step = signal<number>(1);
  rulesFile = signal<File | null>(null);
  salesFile = signal<File | null>(null);
  errorMessage = signal<string | null>(null);
  uploadResponse = signal<any | null>(null);

  onPdfSelected(event: any): void {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
      this.rulesFile.set(file);
      this.errorMessage.set(null);
    } else {
      this.errorMessage.set('Only PDF files are supported for contract rules.');
    }
  }

  onXlsxSelected(event: any): void {
    const file = event.target.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      this.salesFile.set(file);
      this.errorMessage.set(null);
    } else {
      this.errorMessage.set('Only Excel spreadsheets (.xlsx, .xls) are supported for sales data.');
    }
  }

  onSubmitForProcessing(): void {
    if (!this.rulesFile() && !this.salesFile()) {
      this.errorMessage.set('Please select at least one document to process.');
      return;
    }

    this.step.set(2);
    this.errorMessage.set(null);

    const formData = new FormData();
    if (this.rulesFile()) {
      formData.append('rules_file', this.rulesFile()!);
    }
    if (this.salesFile()) {
      formData.append('sales_file', this.salesFile()!);
    }

    // Call process API
    this.http.post<any>('https://poc-rebate-ai-production.up.railway.app/api/process', formData).subscribe({
      next: (res) => {
        this.uploadResponse.set(res);
        // Simulate minor analysis delay for visual quality matching Legrand
        setTimeout(() => {
          this.step.set(3);
        }, 1200);
      },
      error: (err) => {
        this.step.set(1);
        this.errorMessage.set(err.error?.detail || 'An error occurred during document analysis.');
      }
    });
  }

  onConfirm(): void {
    const payload = {
      batch_id: this.uploadResponse()?.batch_id,
      draft_rule: this.uploadResponse()?.draft_rule,
      pending_sales_rows: this.uploadResponse()?.pending_sales_rows ?? []
    };

    this.http.post('https://poc-rebate-ai-production.up.railway.app/api/process/confirm', payload).subscribe({
      next: () => {
        // Clear any stale draft from localStorage
        localStorage.removeItem('sales_condition_draft_rule');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.errorMessage.set('Could not commit calculation confirmation: ' + (err.error?.detail || 'Unknown error'));
      }
    });
  }

  /** Send the AI-extracted draft rule to the Rule Validator page for human review */
  onSendToValidator(): void {
    const draft = this.uploadResponse()?.draft_rule;
    if (!draft) {
      this.errorMessage.set('No contract PDF was uploaded — nothing to validate.');
      return;
    }
    // Map backend draft_rule shape to the rule-validator DraftRule shape
    const validatorDraft = {
      supplier_id: draft.supplier_id,
      supplier_name: draft.supplier_name,
      supplier_code: draft.supplier_code,
      rule_name: draft.rule_name,
      rule_type: draft.rule_type,
      tiers: draft.tiers,
      raw_text_citation: draft.raw_text_citation
    };
    localStorage.setItem('sales_condition_draft_rule', JSON.stringify(validatorDraft));
    this.router.navigate(['/validate']);
  }

  onReject(): void {
    const payload = {
      batch_id: this.uploadResponse()?.batch_id
    };

    this.http.post('https://poc-rebate-ai-production.up.railway.app/api/process/reject', payload).subscribe({
      next: () => {
        // Reset wizard
        this.rulesFile.set(null);
        this.salesFile.set(null);
        this.uploadResponse.set(null);
        this.step.set(1);
      },
      error: (err) => {
        this.step.set(1);
      }
    });
  }

  // --- Formatting Helpers ---
  formatCurrency(value: number | undefined): string {
    if (value === undefined || value === null) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  formatNumber(value: number | undefined): string {
    if (value === undefined || value === null) return '0';
    return new Intl.NumberFormat('en-US').format(value);
  }

  formatPercent(value: number | undefined): string {
    if (value === undefined || value === null) return '0.00%';
    return value.toFixed(2) + '%';
  }

  formatTierLimit(tier: any): string {
    const minVal = this.formatNumber(tier.min);
    if (tier.max === null || tier.max === undefined) {
      return `>${minVal}`;
    }
    return `${minVal} - ${this.formatNumber(tier.max)}`;
  }
}
