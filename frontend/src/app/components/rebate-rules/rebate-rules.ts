import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../services/data.service';

interface RuleDisplay {
  id: number;
  supplier_name: string;
  name: string;
  rule_type: string;
  tiers: { min: number; max: number | null; rate: number }[];
  citation: string | null;
  is_validated: boolean;
  period?: string;
  target?: number | null;
  rate?: number | null;
}

@Component({
  selector: 'app-rebate-rules',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rr-page">

      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h2 class="page-title">Rebate Rules</h2>
          <p class="page-sub">Active rebate rules extracted from supplier contracts</p>
        </div>
        <div class="header-badges">
          <span class="stat-pill">
            <span class="stat-dot dot-green"></span>
            {{ validatedCount() }} Validated
          </span>
          <span class="stat-pill">
            <span class="stat-dot dot-amber"></span>
            {{ pendingCount() }} Pending Review
          </span>
        </div>
      </div>

      <!-- Loading / Empty state -->
      @if (loading()) {
        <div class="state-card">
          <div class="spinner"></div>
          <p>Loading rebate rules…</p>
        </div>
      } @else if (rules().length === 0) {
        <div class="state-card">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <p>No rebate rules found. Ask your admin to upload supplier contracts.</p>
        </div>
      } @else {
        <!-- Rules Grid -->
        <div class="rules-grid">
          @for (rule of rules(); track rule.id) {
            <div class="rule-card" [class.rule-validated]="rule.is_validated" [class.rule-pending]="!rule.is_validated">

              <!-- Card Header -->
              <div class="rule-header">
                <div class="rule-title-row">
                  <span class="supplier-chip">{{ rule.supplier_name }}</span>
                  <span class="status-badge" [class.validated]="rule.is_validated" [class.pending]="!rule.is_validated">
                    {{ rule.is_validated ? 'Validated' : 'Pending' }}
                  </span>
                </div>
                <h3 class="rule-name">{{ rule.name }}</h3>
                <span class="rule-type">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                  {{ rule.rule_type === 'volume' ? 'Volume-based' : 'Revenue-based' }}
                </span>
              </div>

              <!-- Rule Configuration -->
              <div class="tiers-section">
                @if (rule.rate !== null && rule.rate !== undefined && rule.tiers.length === 0) {
                  <div class="tiers-label">Flat Target Rule</div>
                  <div class="flat-target-info" style="display: flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.85rem;">
                    <span style="background: #eef2ff; color: #4338ca; padding: 4px 8px; border-radius: 4px;">Target: {{ rule.target ? formatNum(rule.target) : 'None (All Sales)' }}</span>
                    <span style="background: #eef2ff; color: #4338ca; padding: 4px 8px; border-radius: 4px;">Rate: {{ (rule.rate * 100).toFixed(2) }}%</span>
                    <span style="background: #f1f5f9; color: #475569; padding: 4px 8px; border-radius: 4px;">Period: {{ rule.period || 'Yearly' }}</span>
                  </div>
                } @else {
                  <div class="tiers-label">Rebate Tiers</div>
                  <table class="tiers-table">
                    <thead>
                      <tr>
                        <th>Min</th>
                        <th>Max</th>
                        <th>Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (tier of rule.tiers; track $index) {
                        <tr>
                          <td>{{ formatNum(tier.min) }}</td>
                          <td>{{ tier.max !== null ? formatNum(tier.max) : '∞' }}</td>
                          <td class="rate-cell">{{ (tier.rate * 100).toFixed(2) }}%</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }
              </div>

              <!-- Citation -->
              @if (rule.citation) {
                <details class="citation-block">
                  <summary>View contract clause</summary>
                  <p class="citation-text">"{{ rule.citation }}"</p>
                </details>
              }

            </div>
          }
        </div>
      }

    </div>
  `,
  styles: [`
    .rr-page { padding: 28px 32px; max-width: 1200px; }

    /* Header */
    .page-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 28px; flex-wrap: wrap; gap: 12px;
    }
    .page-title { font-size: 1.4rem; font-weight: 700; color: var(--text-primary, #1a202c); margin: 0 0 4px; }
    .page-sub   { font-size: 0.82rem; color: var(--text-muted, #6b7280); margin: 0; }
    .header-badges { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .stat-pill {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 20px;
      background: var(--bg-surface, #fff); border: 1px solid var(--border, #e2e8f0);
      font-size: 0.78rem; font-weight: 600; color: var(--text-secondary, #4b5563);
    }
    .stat-dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot-green { background: #22c55e; }
    .dot-amber { background: #f59e0b; }

    /* States */
    .state-card {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      padding: 60px 20px; text-align: center;
      background: var(--bg-surface, #fff); border: 1px solid var(--border, #e2e8f0);
      border-radius: 12px; color: var(--text-muted, #9ca3af); font-size: 0.88rem;
    }
    .spinner {
      width: 32px; height: 32px; border-radius: 50%;
      border: 3px solid var(--border, #e2e8f0);
      border-top-color: var(--accent, #2b6cb0);
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Grid */
    .rules-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px; }

    /* Rule Card */
    .rule-card {
      background: var(--bg-surface, #fff); border-radius: 12px;
      border: 1px solid var(--border, #e2e8f0);
      padding: 20px; display: flex; flex-direction: column; gap: 16px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
      border-left: 4px solid var(--border, #e2e8f0);
      transition: box-shadow 0.15s, transform 0.15s;
    }
    .rule-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); transform: translateY(-1px); }
    .rule-validated { border-left-color: #22c55e; }
    .rule-pending   { border-left-color: #f59e0b; }

    /* Card Header */
    .rule-header { display: flex; flex-direction: column; gap: 6px; }
    .rule-title-row { display: flex; align-items: center; justify-content: space-between; }
    .supplier-chip {
      font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      padding: 3px 10px; border-radius: 10px;
      background: #eff6ff; color: #1d4ed8;
    }
    .status-badge {
      font-size: 0.7rem; font-weight: 700; padding: 3px 9px; border-radius: 10px;
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .status-badge.validated { background: #f0fdf4; color: #166534; }
    .status-badge.pending   { background: #fffbeb; color: #92400e; }
    .rule-name { font-size: 1rem; font-weight: 700; color: var(--text-primary, #1a202c); margin: 0; }
    .rule-type {
      display: flex; align-items: center; gap: 5px;
      font-size: 0.78rem; color: var(--text-muted, #9ca3af); font-weight: 500;
    }

    /* Tiers */
    .tiers-section { display: flex; flex-direction: column; gap: 8px; }
    .tiers-label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted, #9ca3af); }
    .tiers-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .tiers-table th {
      text-align: left; padding: 6px 10px;
      background: var(--bg-base, #f7f8fa); font-size: 0.72rem;
      font-weight: 700; color: var(--text-secondary, #6b7280);
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .tiers-table td { padding: 7px 10px; border-top: 1px solid var(--border-light, #f3f4f6); color: var(--text-primary, #374151); }
    .rate-cell { font-weight: 700; color: var(--accent, #2b6cb0); }

    /* Citation */
    .citation-block { border-top: 1px dashed var(--border, #e2e8f0); padding-top: 12px; }
    .citation-block summary {
      font-size: 0.78rem; font-weight: 600; color: var(--accent, #2b6cb0);
      cursor: pointer; list-style: none; display: flex; align-items: center; gap: 5px;
    }
    .citation-block summary::-webkit-details-marker { display: none; }
    .citation-text {
      margin: 10px 0 0; padding: 10px 14px;
      background: #f8fafc; border-left: 3px solid var(--accent, #2b6cb0);
      border-radius: 0 6px 6px 0; font-size: 0.78rem;
      color: var(--text-secondary, #4b5563); font-style: italic; line-height: 1.6;
    }
  `]
})
export class RebateRulesComponent implements OnInit {
  private data = inject(DataService);

  rules = signal<RuleDisplay[]>([]);
  loading = signal(true);
  validatedCount = signal(0);
  pendingCount = signal(0);

  ngOnInit() {
    this.data.getRules().subscribe({
      next: (list) => {
        const mapped: RuleDisplay[] = list.map((r: any) => ({
          id: r.id,
          supplier_name: r.supplier_name ?? r.supplier?.name ?? 'Unknown',
          name: r.name,
          rule_type: r.rule_type,
          tiers: r.tiers || [],
          citation: r.raw_text_citation ?? null,
          is_validated: r.is_validated,
          period: r.period,
          target: r.target,
          rate: r.rate
        }));
        this.rules.set(mapped);
        this.validatedCount.set(mapped.filter(r => r.is_validated).length);
        this.pendingCount.set(mapped.filter(r => !r.is_validated).length);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  parseTiers(json: string): { min: number; max: number | null; rate: number }[] {
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  }

  formatNum(n: number): string {
    return n.toLocaleString('en-US');
  }
}
