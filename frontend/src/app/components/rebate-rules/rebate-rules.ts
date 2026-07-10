import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  imports: [CommonModule, FormsModule],
  template: `
    <div class="rr-page">

      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h2 class="page-title">Rebate Rules</h2>
          <p class="page-sub">Active rebate rules extracted from supplier contracts</p>
        </div>
        <div class="header-right">
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
          <div class="filter-group">
            <label class="filter-label">Filter by Supplier</label>
            <select class="supplier-select" [ngModel]="selectedSupplier()" (ngModelChange)="selectedSupplier.set($event)">
              <option value="All">All Suppliers</option>
              @for (s of uniqueSuppliers(); track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
          </div>
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
        <!-- Results count -->
        <p class="results-count">Showing {{ filteredRules().length }} rule{{ filteredRules().length !== 1 ? 's' : '' }}{{ selectedSupplier() !== 'All' ? ' for ' + selectedSupplier() : '' }}</p>

        <!-- Rules Table -->
        <div class="table-wrap">
          <table class="rules-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Status</th>
                <th>Rule Name</th>
                <th>Type</th>
                <th>Configuration</th>
                <th>Citation</th>
              </tr>
            </thead>
            <tbody>
              @for (rule of filteredRules(); track rule.id) {
                <tr class="rule-row" [class.row-validated]="rule.is_validated" [class.row-pending]="!rule.is_validated">
                  <td class="td-supplier">
                    <span class="supplier-chip">{{ rule.supplier_name }}</span>
                  </td>
                  <td>
                    <span class="status-badge" [class.validated]="rule.is_validated" [class.pending]="!rule.is_validated">
                      {{ rule.is_validated ? 'Validated' : 'Pending' }}
                    </span>
                  </td>
                  <td class="td-name">{{ rule.name }}</td>
                  <td>
                    <span class="type-chip">
                      {{ rule.rule_type === 'volume' ? 'Volume' : 'Revenue' }}
                    </span>
                  </td>
                  <td class="td-config">
                    @if (rule.rate !== null && rule.rate !== undefined && rule.tiers.length === 0) {
                      <div class="config-pills">
                        @if (rule.target) {
                          <span class="pill pill-target">Target: {{ formatShort(rule.target) }}</span>
                        } @else {
                          <span class="pill pill-none">Target: All Sales</span>
                        }
                        <span class="pill pill-rate">{{ (rule.rate * 100).toFixed(2) }}%</span>
                        <span class="pill pill-period">{{ rule.period || 'Yearly' }}</span>
                      </div>
                    } @else {
                      <div class="tier-summary">
                        @for (tier of rule.tiers; track $index) {
                          <span class="tier-chip">
                            {{ formatShort(tier.min) }}{{ tier.max !== null ? '–' + formatShort(tier.max) : '+' }}: {{ (tier.rate * 100).toFixed(1) }}%
                          </span>
                        }
                      </div>
                    }
                  </td>
                  <td class="td-citation">
                    @if (rule.citation) {
                      <details class="citation-details">
                        <summary class="citation-btn">View ↓</summary>
                        <div class="citation-popup">
                          <p class="citation-text">"{{ rule.citation }}"</p>
                        </div>
                      </details>
                    } @else {
                      <span class="no-citation">—</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

    </div>
  `,
  styles: [`
    .rr-page { padding: 28px 32px; max-width: 1400px; }

    /* Header */
    .page-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 16px; flex-wrap: wrap; gap: 16px;
    }
    .page-title { font-size: 1.4rem; font-weight: 700; color: var(--text-primary, #1a202c); margin: 0 0 4px; }
    .page-sub   { font-size: 0.82rem; color: var(--text-muted, #6b7280); margin: 0; }
    .header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
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

    /* Filter */
    .filter-group { display: flex; align-items: center; gap: 10px; }
    .filter-label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary, #4b5563); white-space: nowrap; }
    .supplier-select {
      padding: 8px 32px 8px 12px;
      border-radius: 8px;
      border: 1px solid var(--border, #e2e8f0);
      background-color: var(--bg-surface, #fff);
      color: var(--text-primary, #1a202c);
      font-size: 0.82rem;
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      min-width: 220px;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .supplier-select:focus {
      outline: none;
      border-color: var(--accent, #2b6cb0);
      box-shadow: 0 0 0 2px rgba(43, 108, 176, 0.15);
    }

    /* Results count */
    .results-count {
      font-size: 0.78rem; color: var(--text-muted, #9ca3af);
      margin: 0 0 14px; font-weight: 500;
    }

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

    /* Table wrapper */
    .table-wrap {
      background: var(--bg-surface, #fff);
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 12px;
      overflow-x: auto;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
    }

    .rules-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 820px;
    }

    .rules-table thead th {
      padding: 11px 16px;
      text-align: left;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted, #9ca3af);
      background: var(--bg-base, #f7f8fa);
      border-bottom: 1px solid var(--border, #e2e8f0);
      white-space: nowrap;
    }

    .rules-table thead th:first-child { border-radius: 12px 0 0 0; }
    .rules-table thead th:last-child  { border-radius: 0 12px 0 0; }

    .rule-row td {
      padding: 13px 16px;
      border-bottom: 1px solid var(--border-light, #f3f4f6);
      vertical-align: middle;
      font-size: 0.84rem;
      color: var(--text-primary, #1a202c);
    }
    .rule-row:last-child td { border-bottom: none; }
    .rule-row:hover td { background: #fafbff; }

    /* Left accent stripe by status */
    .rule-row td:first-child { border-left: 3px solid transparent; }
    .row-validated td:first-child { border-left-color: #22c55e; }
    .row-pending   td:first-child { border-left-color: #f59e0b; }

    .td-supplier { min-width: 170px; }
    .td-name { font-weight: 600; min-width: 200px; }
    .td-config { min-width: 250px; }
    .td-citation { min-width: 100px; }

    /* Chips */
    .supplier-chip {
      font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em;
      padding: 3px 9px; border-radius: 8px;
      background: #eff6ff; color: #1d4ed8;
      white-space: nowrap;
    }
    .status-badge {
      font-size: 0.68rem; font-weight: 700; padding: 3px 9px; border-radius: 8px;
      text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;
    }
    .status-badge.validated { background: #f0fdf4; color: #166534; }
    .status-badge.pending   { background: #fffbeb; color: #92400e; }

    .type-chip {
      font-size: 0.72rem; font-weight: 600; padding: 3px 9px; border-radius: 8px;
      background: #f5f3ff; color: #6d28d9; white-space: nowrap;
    }

    /* Configuration column pills */
    .config-pills { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .pill {
      display: inline-block; font-size: 0.72rem; font-weight: 600;
      padding: 3px 8px; border-radius: 6px; white-space: nowrap;
    }
    .pill-target { background: #eef2ff; color: #4338ca; }
    .pill-none   { background: #f1f5f9; color: #64748b; }
    .pill-rate   { background: #ecfdf5; color: #065f46; }
    .pill-period { background: #fef3c7; color: #92400e; }

    /* Tier summary chips */
    .tier-summary { display: flex; flex-wrap: wrap; gap: 5px; }
    .tier-chip {
      font-size: 0.7rem; font-weight: 600; padding: 2px 7px; border-radius: 5px;
      background: #f0f9ff; color: #0369a1; white-space: nowrap;
      border: 1px solid #bae6fd;
    }

    /* Citation */
    .citation-details { position: relative; }
    .citation-btn {
      font-size: 0.78rem; font-weight: 600; color: var(--accent, #2b6cb0);
      cursor: pointer; list-style: none; white-space: nowrap;
      padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border, #e2e8f0);
      display: inline-block; background: var(--bg-base, #f7f8fa);
      transition: background 0.15s;
    }
    .citation-btn::-webkit-details-marker { display: none; }
    .citation-btn:hover { background: #eff6ff; border-color: #bfdbfe; }
    .citation-popup {
      position: absolute; right: 0; top: calc(100% + 6px); z-index: 10;
      width: 340px; background: #fff;
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 10px; padding: 14px 16px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    }
    .citation-text {
      margin: 0; font-size: 0.78rem; font-style: italic;
      color: var(--text-secondary, #4b5563); line-height: 1.6;
      border-left: 3px solid var(--accent, #2b6cb0);
      padding-left: 10px;
    }
    .no-citation { color: var(--text-muted, #d1d5db); font-size: 0.85rem; }
  `]
})
export class RebateRulesComponent implements OnInit {
  private data = inject(DataService);

  rules = signal<RuleDisplay[]>([]);
  loading = signal(true);
  validatedCount = signal(0);
  pendingCount = signal(0);
  selectedSupplier = signal('All');

  uniqueSuppliers = computed(() => {
    const names = this.rules().map(r => r.supplier_name);
    return [...new Set(names)].sort();
  });

  filteredRules = computed(() => {
    if (this.selectedSupplier() === 'All') return this.rules();
    return this.rules().filter(r => r.supplier_name === this.selectedSupplier());
  });

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

  formatShort(n: number): string {
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000)     return '$' + (n / 1_000).toFixed(0) + 'k';
    return n.toLocaleString('en-US');
  }

  formatNum(n: number): string {
    return n.toLocaleString('en-US');
  }
}
