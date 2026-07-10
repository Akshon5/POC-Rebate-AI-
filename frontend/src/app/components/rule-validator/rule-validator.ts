import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataService } from '../../services/data.service';

interface DraftTier {
  min: number;
  max: number | null;
  rate: number; // percentage value represented as decimal, e.g. 0.02
}

interface DraftRule {
  supplier_id: number;
  supplier_name: string;
  supplier_code: string;
  rule_name: string;
  rule_type: string;
  tiers: DraftTier[];
  raw_text_citation: string;
}

@Component({
  selector: 'app-rule-validator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="validator-wrapper animate-fade-in">
      
      <!-- Page Header -->
      <div class="page-header">
        <div class="page-title">
          <h2>AI Rule Extraction Validator</h2>
          <p>Human-in-the-Loop: Review, adjust, and approve AI-extracted rebate rules from contract clauses</p>
        </div>
      </div>

      @if (!draftRule()) {
        <!-- Fallback view when no PDF has been uploaded yet -->
        <div class="no-draft-panel glass-panel">
          <span class="panel-icon">🔍</span>
          <h3>No Draft Rule Loaded</h3>
          <p>The system needs a contract text input to generate draft rules.</p>
          <button (click)="goToAdmin()" class="btn-primary">
            Upload Contract PDF in Admin Console
          </button>
          
          <div class="quick-test-section">
            <p>Or load a sample draft to test the review console:</p>
            <div class="test-buttons">
              <button (click)="loadSampleDraft('dhl')" class="btn-secondary">Load Sample Draft (Volume-Based)</button>
              <button (click)="loadSampleDraft('junho')" class="btn-secondary">Load Sample Draft (Revenue-Based)</button>
            </div>
          </div>
        </div>
      } @else {
        <!-- Main Form Grid -->
        <div class="grid-cols-2">
          <!-- Left Column: Raw PDF Citation & AI Audit Trail -->
          <div class="glass-panel citation-column">
            <div class="column-header">
              <h3>📌 Source Contract Citation</h3>
              <span class="badge-source">AI Extracted Clause</span>
            </div>
            
            <div class="citation-meta">
              <span class="meta-label">Contract Owner:</span>
              <span class="meta-val">{{ draftRule()!.supplier_name }} ({{ draftRule()!.supplier_code }})</span>
            </div>

            <div class="pdf-box">
              <p class="pdf-text">"{{ draftRule()!.raw_text_citation }}"</p>
            </div>

            <div class="audit-disclaimer">
              <p>💡 <strong>Note to auditor:</strong> Verify the extracted rate thresholds (tiers) match the text highlight above. You can add, delete, or modify individual tiers in the right-hand panel before validation.</p>
            </div>
          </div>

          <!-- Right Column: Edit & Validate Tiers Console -->
          <div class="glass-panel edit-column">
            <h3>⚙️ Rule Configuration Tiers</h3>
            
            <form (ngSubmit)="onApprove()" class="rule-edit-form">
              <div class="form-group">
                <label for="ruleName">Rule Name</label>
                <input 
                  type="text" 
                  id="ruleName" 
                  [(ngModel)]="draftRule()!.rule_name" 
                  name="rule_name" 
                  class="form-input"
                  required
                />
              </div>

              <div class="form-group">
                <label for="ruleType">Calculation Metric Basis</label>
                <select 
                  id="ruleType" 
                  [(ngModel)]="draftRule()!.rule_type" 
                  name="rule_type" 
                  class="form-input"
                >
                  <option value="volume">Volume-Based (quantity of items/units shipped)</option>
                  <option value="revenue">Revenue-Based (total purchase value in USD)</option>
                </select>
              </div>

              <!-- Tiers Editor -->
              <div class="tiers-editor-section">
                <div class="tiers-header">
                  <label>Configured Threshold Tiers</label>
                  <button type="button" (click)="addTierRow()" class="btn-add-tier">+ Add Tier</button>
                </div>

                <div class="tiers-rows">
                  @for (tier of draftRule()!.tiers; track $index) {
                    <div class="tier-edit-row">
                      <div class="tier-input-group">
                        <span class="row-label">Min</span>
                        <input 
                          type="number" 
                          [(ngModel)]="tier.min" 
                          name="tier_min_{{$index}}" 
                          class="form-input tier-input" 
                          min="0"
                          required
                        />
                      </div>
                      
                      <div class="tier-input-group">
                        <span class="row-label">Max</span>
                        <!-- Custom input mapping for null/infinity values -->
                        <input 
                          type="number" 
                          [ngModel]="tier.max" 
                          (ngModelChange)="onTierMaxChange($index, $event)"
                          name="tier_max_{{$index}}" 
                          class="form-input tier-input" 
                          placeholder="Infinity"
                        />
                      </div>

                      <div class="tier-input-group">
                        <span class="row-label">Rate (%)</span>
                        <!-- Display decimal rates as clean percentages for the user -->
                        <input 
                          type="number" 
                          [ngModel]="tier.rate * 100" 
                          (ngModelChange)="onTierRateChange($index, $event)"
                          name="tier_rate_{{$index}}" 
                          class="form-input tier-input rate-field" 
                          step="0.1"
                          required
                        />
                      </div>

                      <button type="button" (click)="removeTierRow($index)" class="btn-remove-row" title="Delete Tier">
                        ✕
                      </button>
                    </div>
                  }
                </div>
              </div>

              <!-- Actions Buttons -->
              <div class="form-actions">
                <button type="button" (click)="discardDraft()" class="btn-secondary">
                  Discard Draft
                </button>
                <button type="submit" [disabled]="saving()" class="btn-primary btn-save">
                  ✔ Approve & Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .validator-wrapper {
      display: flex;
      flex-direction: column;
      gap: 30px;
    }

    /* Fallback dead state */
    .no-draft-panel {
      text-align: center;
      padding: 60px 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;
      max-width: 600px;
      margin: 40px auto 0 auto;
    }

    .panel-icon {
      font-size: 3.5rem;
      
    }

    .no-draft-panel h3 {
      font-size: 1.4rem;
      font-weight: 700;
      letter-spacing: -0.3px;
    }

    .no-draft-panel p {
      color: var(--text-secondary);
      font-size: 0.95rem;
      margin-bottom: 10px;
    }

    .quick-test-section {
      margin-top: 30px;
      border-top: 1px solid var(--border);
      padding-top: 20px;
      width: 100%;
    }

    .quick-test-section p {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    .test-buttons {
      display: flex;
      gap: 15px;
      justify-content: center;
    }

    /* Columns setup */
    .column-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }

    .badge-source {
      background-color: var(--accent-subtle);
      color: #c084fc;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 20px;
      border: 1px solid rgba(43,108,176,0.2);
    }

    .citation-meta {
      font-size: 0.9rem;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }

    .meta-label {
      color: var(--text-muted);
      margin-right: 8px;
    }

    .meta-val {
      font-weight: 600;
    }

    .pdf-box {
      background-color: var(--color-warning-subtle);
      border: 1px solid rgba(245, 158, 11, 0.15);
      padding: 24px;
      border-radius: 12px;
      margin-bottom: 25px;
      box-shadow: inset 0 2px 10px rgba(0,0,0,0.06);
    }

    .pdf-text {
      font-family: 'Courier New', Courier, monospace;
      font-size: 0.85rem;
      line-height: 1.55;
      color: #fef08a;
      white-space: pre-line;
    }

    .audit-disclaimer {
      font-size: 0.8rem;
      line-height: 1.5;
      color: var(--text-secondary);
    }

    /* Editing pane */
    .rule-edit-form {
      display: flex;
      flex-direction: column;
      gap: 20px;
      margin-top: 15px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group label {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-secondary);
    }

    /* Tiers grid editor */
    .tiers-editor-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .tiers-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .tiers-header label {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .btn-add-tier {
      background-color: var(--accent-subtle);
      color: var(--accent);
      border: 1px solid rgba(43,108,176,0.2);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: var(--ease);
    }

    .btn-add-tier:hover {
      background-color: rgba(43,108,176,0.15);
      color: #ffffff;
    }

    .tiers-rows {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 300px;
      overflow-y: auto;
      padding: 12px;
      background-color: var(--bg-base);
      border-radius: 10px;
      border: 1px solid var(--border);
    }

    .tier-edit-row {
      display: flex;
      align-items: center;
      gap: 12px;
      background-color: #f7f8fa;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
    }

    .tier-input-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }

    .row-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    .tier-input {
      padding: 8px;
      font-size: 0.8rem;
    }

    .rate-field {
      border-color: rgba(16, 185, 129, 0.25);
    }

    .btn-remove-row {
      background-color: transparent;
      border: none;
      color: var(--color-danger);
      font-size: 0.95rem;
      cursor: pointer;
      padding: 5px;
      opacity: 0.7;
      transition: var(--ease);
    }

    .btn-remove-row:hover {
      opacity: 1;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 15px;
      margin-top: 15px;
      border-top: 1px solid var(--border);
      padding-top: 20px;
    }

    .btn-save {
      background: linear-gradient(135deg, var(--color-success) 0%, #047857 100%);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
    }

    .btn-save:hover {
      box-shadow: 0 6px 16px rgba(16, 185, 129, 0.3);
    }
  `]
})
export class RuleValidatorComponent implements OnInit {
  private dataService = inject(DataService);
  private router = inject(Router);

  draftRule = signal<DraftRule | null>(null);
  saving = signal(false);

  ngOnInit(): void {
    const cached = localStorage.getItem('sales_condition_draft_rule');
    if (cached) {
      try {
        this.draftRule.set(JSON.parse(cached));
      } catch (e) {
        localStorage.removeItem('sales_condition_draft_rule');
      }
    }
  }

  goToAdmin(): void {
    this.router.navigate(['/upload-review']);
  }

  // Allow custom handling of maximum tier (can be null/empty, standing for infinity)
  onTierMaxChange(index: number, val: any): void {
    const rule = this.draftRule();
    if (!rule) return;
    
    if (val === '' || val === null || val === undefined) {
      rule.tiers[index].max = null;
    } else {
      rule.tiers[index].max = Number(val);
    }
    this.draftRule.set({ ...rule });
  }

  // Handle rates transformation between UI percentage and DB decimals
  onTierRateChange(index: number, val: number): void {
    const rule = this.draftRule();
    if (!rule) return;
    rule.tiers[index].rate = val / 100.0;
    this.draftRule.set({ ...rule });
  }

  // Add row
  addTierRow(): void {
    const rule = this.draftRule();
    if (!rule) return;
    
    // Sort or check last row to estimate next min threshold
    const lastTier = rule.tiers[rule.tiers.length - 1];
    const nextMin = lastTier && lastTier.max !== null ? lastTier.max + 1 : 0;

    rule.tiers.push({
      min: nextMin,
      max: null,
      rate: 0.01 // default 1%
    });
    this.draftRule.set({ ...rule });
  }

  // Remove row
  removeTierRow(index: number): void {
    const rule = this.draftRule();
    if (!rule) return;
    rule.tiers.splice(index, 1);
    this.draftRule.set({ ...rule });
  }

  // Discard
  discardDraft(): void {
    localStorage.removeItem('sales_condition_draft_rule');
    this.draftRule.set(null);
  }

  // Save rules
  onApprove(): void {
    const rule = this.draftRule();
    if (!rule) return;

    this.saving.set(true);

    // Call data service saving
    const savePayload = {
      supplier_id: rule.supplier_id,
      name: rule.rule_name,
      rule_type: rule.rule_type,
      tiers: rule.tiers,
      raw_text_citation: rule.raw_text_citation,
      is_validated: true // validating the rule!
    };

    this.dataService.saveValidatedRule(savePayload).subscribe({
      next: () => {
        this.saving.set(false);
        // Clear cached draft since it's now saved
        localStorage.removeItem('sales_condition_draft_rule');
        this.draftRule.set(null);
        // Redirect to dashboard to see active calculations
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.saving.set(false);
        alert(err.error?.detail || 'Failed to save validated rule.');
      }
    });
  }

  // Helper mock loader to easily test the validator console
  loadSampleDraft(type: 'dhl' | 'junho'): void {
    if (type === 'dhl') {
      this.draftRule.set({
        supplier_id: 1,
        supplier_name: 'DHL Malaysia',
        supplier_code: 'DHL',
        rule_name: 'DHL volume-based shipment rebates 2025',
        rule_type: 'volume',
        tiers: [
          { min: 0, max: 5000, rate: 0.010 },
          { min: 5001, max: 20000, rate: 0.025 },
          { min: 20001, max: null, rate: 0.045 }
        ],
        raw_text_citation: `SUPPLIER SERVICES AGREEMENT - DHL 2025\nThis agreement is entered into by DHL Malaysia and the Client.\nSection 4: Rebate Structure\nThe Supplier agrees to pay a Volume-Based Rebate on all logistics purchases made in the calendar year of 2025.\nThe rebates shall be calculated annually as a percentage of total shipment volume (quantity of units) as follows:\n- From 0 to 5,000 units shipped: 1.0% rebate rate.\n- From 5,001 to 20,000 units shipped: 2.5% rebate rate.\n- From 20,001 units and above: 4.5% rebate rate.`
      });
    } else {
      this.draftRule.set({
        supplier_id: 2,
        supplier_name: 'Jun Ho Corp',
        supplier_code: 'JUNHO',
        rule_name: 'Jun Ho revenue-based purchase rebates 2025',
        rule_type: 'revenue',
        tiers: [
          { min: 0, max: 50000, rate: 0.00 },
          { min: 50000, max: 200000, rate: 0.030 },
          { min: 200000, max: null, rate: 0.055 }
        ],
        raw_text_citation: `BẢN THỎA THUẬN CHIẾT KHẤU THƯƠNG MẠI - JUN HO 2025\nBên B (Supplier): Jun Ho Corp agrees to provide Sales Rebates based on total purchase revenue (Revenue-Based Rebate).\nĐiều 6: Mức chiết khấu đạt được (Section 6: Rebate Tiers achieved)\nTỷ lệ chiết khấu sẽ được tính dựa trên tổng giá trị mua hàng (doanh thu tính bằng USD) trong năm tài khóa:\n- Dưới $50,000 USD: Tỷ lệ chiết khấu là 0.0%.\n- Từ $50,000 USD đến $200,000 USD: Tỷ lệ chiết khấu là 3.0%.\n- Trên $200,000 USD: Tỷ lệ chiết khấu là 5.5%.`
      });
    }
  }
}
