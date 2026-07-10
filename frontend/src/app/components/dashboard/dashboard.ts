import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dashboard-wrapper animate-fade-in">
      
      <!-- Page Header -->
      <div class="page-header">
        <div class="page-title">
          <h2>Executive Dashboard</h2>
          <p>Real-time supplier rebate achievements and provision calculations</p>
        </div>
        <button (click)="loadDashboardData()" class="btn-secondary" [disabled]="refreshing()">
          <span>🔄</span> {{ refreshing() ? 'Updating...' : 'Refresh Data' }}
        </button>
      </div>

      <!-- KPI Grid -->
      <div class="kpi-grid">
        <!-- KPI Card 1 -->
        <div class="kpi-card glass-panel kpi-accent-blue">
          <div class="kpi-header">
            <span class="kpi-icon">📊</span>
            <span class="kpi-title">Total Estimated Rebate</span>
          </div>
          <div class="kpi-value">{{ totalEstimatedRebate() | currency:'USD':'symbol':'1.0-0' }}</div>
          <div class="kpi-meta">Provisioned target rebates</div>
        </div>

        <!-- KPI Card 2 -->
        <div class="kpi-card glass-panel kpi-accent-green">
          <div class="kpi-header">
            <span class="kpi-icon">💰</span>
            <span class="kpi-title">Total Actual Rebate</span>
          </div>
          <div class="kpi-value">{{ totalActualRebate() | currency:'USD':'symbol':'1.0-0' }}</div>
          <div class="kpi-meta">Earned rebate provisions</div>
        </div>

        <!-- KPI Card 3 -->
        <div class="kpi-card glass-panel kpi-accent-blue">
          <div class="kpi-header">
            <span class="kpi-icon">🏢</span>
            <span class="kpi-title">Active Suppliers</span>
          </div>
          <div class="kpi-value">{{ kpis().active_suppliers_count }}</div>
          <div class="kpi-meta">Contracted suppliers</div>
        </div>

        <!-- KPI Card 4 -->
        <div class="kpi-card glass-panel kpi-accent-purple">
          <div class="kpi-header">
            <span class="kpi-icon">✅</span>
            <span class="kpi-title">Validated Rules</span>
          </div>
          <div class="kpi-value">{{ kpis().rules_validated_count }}</div>
          <div class="kpi-meta">Approved by admin</div>
        </div>

        <!-- KPI Card 5 -->
        <div class="kpi-card glass-panel kpi-accent-orange">
          <div class="kpi-header">
            <span class="kpi-icon">⏳</span>
            <span class="kpi-title">Pending Rules</span>
          </div>
          <div class="kpi-value">{{ kpis().rules_pending_count }}</div>
          <div class="kpi-meta">Awaiting validation</div>
        </div>
      </div>

      <!-- Main Layout: Calculations Table & Auditing Panel -->
      <div class="main-grid" [class.audit-open]="selectedCalc()">
        <!-- Left Column: Rebate Calculations Table -->
        <div class="calculations-section glass-panel">
          <div class="section-header">
            <h3>Calculated Provisions</h3>
            <div class="search-box">
              <span class="search-icon">🔍</span>
              <input 
                type="text" 
                [(ngModel)]="searchQuery" 
                placeholder="Search supplier by name or code..."
                class="search-input"
              />
            </div>
          </div>

          <div class="table-container">
            @if (filteredCalculations().length === 0) {
              <div class="empty-state">
                <span class="empty-icon">📁</span>
                <p>No active calculations found matching search filter.</p>
                <p class="empty-sub">Upload contracts and sales logs to begin calculations.</p>
              </div>
            } @else {
              <table>
                <thead>
                  <tr>
                    <th>Buyer</th>
                    <th class="numeric">Target</th>
                    <th>Period</th>
                    <th class="numeric">Rebate %</th>
                    <th class="numeric">Total Provisioned Rebate</th>
                    <th class="numeric">Actual Sales</th>
                    <th class="numeric">Actual Rebate</th>
                    <th>Target Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (calc of filteredCalculations(); track calc.id) {
                    <tr [class.selected]="selectedCalc()?.id === calc.id">
                      <td>
                        <div class="supplier-info">
                          <span class="sup-name">{{ getSupplierName(calc.supplier_id) }}</span>
                        </div>
                      </td>
                      <td class="numeric">
                        @if (calc.rule?.target) {
                          {{ calc.rule.target | number:'1.0-0' }}
                        } @else {
                          -
                        }
                      </td>
                      <td>
                        {{ calc.rule?.period || 'Yearly' }} {{ calc.rule?.year ? "'" + (calc.rule.year.toString().slice(-2)) : '' }}
                      </td>
                      <td class="numeric">
                        @if (calc.rule?.rate !== null && calc.rule?.rate !== undefined) {
                          {{ calc.rule.rate * 100 | number:'1.0-1' }}%
                        } @else {
                          {{ getAppliedRate(calc) * 100 | number:'1.0-1' }}%
                        }
                      </td>
                      <td class="numeric highlight-blue">
                        {{ calc.provisioned_rebate | currency:'USD':'symbol':'1.0-0' }}
                      </td>
                      <td class="numeric">
                        {{ calc.total_sales_value | currency:'USD':'symbol':'1.0-0' }}
                      </td>
                      <td class="numeric highlight">
                        {{ calc.calculated_rebate | currency:'USD':'symbol':'1.0-0' }}
                      </td>
                      <td>
                        <span class="badge" [class.badge-revenue]="calc.target_status !== 'Met'" [class.badge-volume]="calc.target_status === 'Met'">
                          {{ calc.target_status }}
                        </span>
                      </td>
                      <td>
                        <button (click)="selectCalculation(calc)" class="btn-detail">
                          Audit Citation 🔍
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
        </div>

        <!-- Right Side: Details & Auditable Citations Panel -->
        @if (selectedCalc()) {
          <div class="audit-panel glass-panel animate-fade-in">
            <div class="audit-header">
              <h3>Audit Citation Trail</h3>
              <button (click)="selectedCalc.set(null)" class="btn-close">✕</button>
            </div>
            
            <div class="audit-body">
              <div class="audit-item">
                <label>Supplier</label>
                <div class="audit-val">{{ getSupplierName(selectedCalc()!.supplier_id) }} ({{ getSupplierCode(selectedCalc()!.supplier_id) }})</div>
              </div>

              <div class="audit-item">
                <label>Active Rule</label>
                <div class="audit-val highlight">{{ selectedCalc()!.rule?.name }}</div>
              </div>

              <div class="audit-item">
                <label>Tiers Configured</label>
                <div class="tiers-list">
                  @for (tier of selectedCalc()!.rule?.tiers; track $index) {
                    <div class="tier-row" [class.active-tier]="isCurrentTier(tier, selectedCalc()!)">
                      <span class="tier-bounds">
                        {{ tier.min | number }} 
                        @if (tier.max) { to {{ tier.max | number }} } 
                        @else { and above }
                        {{ selectedCalc()!.rule?.rule_type === 'volume' ? 'units' : 'USD' }}
                      </span>
                      <span class="tier-rate">{{ tier.rate * 100 | number:'1.1-2' }}% rebate</span>
                    </div>
                  }
                </div>
              </div>

              <div class="audit-item citation-box">
                <label>Auditable Contract Citation</label>
                <p class="citation-text">"{{ selectedCalc()!.rule?.raw_text_citation }}"</p>
                <span class="citation-stamp">Extract source: OCR Contract PDF</span>
              </div>

              <div class="audit-item calc-breakdown">
                <label>Calculation Logic</label>
                <div class="formula">
                  <span>Cumulative Sales Revenue:</span>
                  <strong>{{ selectedCalc()!.total_sales_value | currency:'USD':'symbol':'1.2-2' }}</strong>
                </div>
                <div class="formula">
                  <span>Rebate Rate Applied:</span>
                  <strong>{{ getAppliedRate(selectedCalc()!) * 100 | number:'1.1-2' }}%</strong>
                </div>
                <div class="formula total">
                  <span>Final Provision:</span>
                  <strong>{{ selectedCalc()!.calculated_rebate | currency:'USD':'symbol':'1.2-2' }}</strong>
                </div>
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .dashboard-wrapper {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* KPI Grid customization */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(1, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 4px;
    }
    @media (min-width: 768px) {
      .kpi-grid {
        grid-template-columns: repeat(5, minmax(0, 1fr));
      }
    }
    .highlight-blue {
      color: var(--accent);
    }

    .kpi-card {
      border-radius: var(--radius-lg);
      padding: 20px 20px 20px 22px;
      border: 1px solid var(--border);
      background-color: var(--bg-white);
      display: flex;
      flex-direction: column;
      gap: 10px;
      position: relative;
      overflow: hidden;
    }

    .kpi-card::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
    }

    .kpi-card:hover {
      background-color: #f7f8fa;
      border-color: var(--border-strong);
    }

    .kpi-accent-green::before  { background-color: var(--color-success); }
    .kpi-accent-blue::before   { background-color: var(--accent); }
    .kpi-accent-purple::before { background-color: #8b5cf6; }
    .kpi-accent-orange::before { background-color: var(--color-warning); }

    .kpi-accent-green:hover,
    .kpi-accent-blue:hover,
    .kpi-accent-purple:hover,
    .kpi-accent-orange:hover { box-shadow: none; }

    /* Main canvas grid split */
    .main-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 30px;
      align-items: start;
    }

    @media (min-width: 1200px) {
      .main-grid.audit-open {
        grid-template-columns: 1fr 400px;
      }
    }

    .calculations-section {
      min-width: 0;
      overflow: hidden;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .section-header h3 {
      font-size: 0.92rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .search-box {
      position: relative;
      display: flex;
      align-items: center;
      width: 280px;
    }

    .search-icon {
      position: absolute;
      left: 10px;
      color: var(--text-muted);
      font-size: 0.8rem;
    }

    .search-input {
      width: 100%;
      padding: 8px 10px 8px 30px;
      border-radius: var(--radius-md);
      background-color: var(--bg-base);
      border: 1px solid var(--border);
      color: var(--text-primary);
      font-size: 0.82rem;
      font-family: 'Inter', sans-serif;
      transition: var(--ease);
    }

    .search-input::placeholder { color: var(--text-muted); }

    .search-input:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--accent-subtle);
    }

    .table-container {
      overflow-x: auto;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-secondary);
    }

    .empty-icon {
      font-size: 2rem;
      margin-bottom: 12px;
      display: block;
    }

    .empty-sub {
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 5px;
    }

    /* Supplier badge configurations in table */
    .supplier-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .sup-code {
      font-size: 0.62rem;
      font-weight: 700;
      color: var(--text-secondary);
      background-color: #f7f8fa;
      border: 1px solid var(--border);
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      width: fit-content;
      letter-spacing: 0.4px;
    }

    .sup-name {
      font-size: 0.87rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .badge {
      display: inline-block;
      font-size: 0.68rem;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: var(--radius-sm);
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .badge-volume {
      background-color: #faf5ff;
      color: #805ad5;
      border: 1px solid rgba(139, 92, 246, 0.2);
    }

    .badge-revenue {
      background-color: var(--accent-subtle);
      color: var(--accent);
      border: 1px solid var(--accent-border);
    }

    table {
      width: 100%;
      min-width: max-content;
    }

    table th, table td {
      white-space: nowrap;
    }

    .numeric {
      text-align: right;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .numeric.highlight { color: var(--color-success); }

    /* Tier progress bars */
    .progress-container {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 130px;
    }

    .progress-bar-bg {
      flex-grow: 1;
      height: 5px;
      background-color: #f7f8fa;
      border-radius: 3px;
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .progress-bar-fill {
      height: 100%;
      background-color: var(--accent);
      border-radius: 3px;
    }

    .progress-text {
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-secondary);
      width: 38px;
      text-align: right;
    }

    .btn-detail {
      background-color: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 6px 12px;
      border-radius: var(--radius-md);
      cursor: pointer;
      font-size: 0.78rem;
      font-weight: 600;
      transition: var(--ease);
    }

    .btn-detail:hover {
      background-color: #f7f8fa;
      border-color: var(--border-strong);
      color: var(--text-primary);
    }

    tr.selected td { background-color: #f7f8fa; }

    /* Audit detail panel */
    .audit-panel {
      border-left: 2px solid var(--border-strong);
    }

    .audit-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 14px;
    }

    .audit-header h3 {
      font-size: 0.92rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .btn-close {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.78rem;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      transition: var(--ease);
    }

    .btn-close:hover {
      color: var(--text-primary);
      border-color: var(--border-strong);
    }

    .audit-body {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .audit-item {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .audit-item label {
      font-size: 0.65rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .audit-val {
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .audit-val.highlight {
      color: var(--accent);
      font-size: 0.92rem;
    }

    .tiers-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      background-color: var(--bg-base);
      padding: 10px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
    }

    .tier-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.78rem;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      border: 1px solid transparent;
    }

    .tier-row.active-tier {
      background-color: var(--color-success-subtle);
      border-color: rgba(34, 197, 94, 0.2);
      color: var(--color-success);
      font-weight: 600;
    }

    .citation-box {
      background-color: var(--color-warning-subtle);
      border: 1px solid rgba(245, 158, 11, 0.2);
      padding: 14px;
      border-radius: var(--radius-md);
    }

    .citation-text {
      font-size: 0.78rem;
      line-height: 1.55;
      color: #b7791f;
      font-style: italic;
    }

    .citation-stamp {
      font-size: 0.62rem;
      color: var(--text-muted);
      margin-top: 8px;
      display: block;
      text-align: right;
    }

    .calc-breakdown {
      border-top: 1px solid var(--border);
      padding-top: 16px;
      display: flex;
      flex-direction: column;
      gap: 9px;
    }

    .formula {
      display: flex;
      justify-content: space-between;
      font-size: 0.82rem;
    }

    .formula span { color: var(--text-secondary); }

    .formula.total {
      border-top: 1px solid var(--border);
      padding-top: 10px;
      font-size: 0.88rem;
    }

    .formula.total span {
      color: var(--text-primary);
      font-weight: 600;
    }

    .formula.total strong {
      color: var(--color-success);
      font-size: 1.05rem;
      font-weight: 700;
    }
  `]
})
export class DashboardComponent implements OnInit {
  private dataService = inject(DataService);

  refreshing = signal(false);
  searchQuery = '';
  
  // Local state signals
  kpis = signal({
    total_provisions: 0.0,
    active_suppliers_count: 0,
    rules_validated_count: 0,
    rules_pending_count: 0,
    top_supplier_rebates: []
  });
  calculations = signal<any[]>([]);

  readonly totalEstimatedRebate = computed(() => {
    return this.calculations().reduce((sum, calc) => sum + (calc.provisioned_rebate || 0.0), 0.0);
  });

  readonly totalActualRebate = computed(() => {
    return this.calculations().reduce((sum, calc) => sum + (calc.calculated_rebate || 0.0), 0.0);
  });
  suppliers = signal<any[]>([]);
  
  selectedCalc = signal<any | null>(null);

  ngOnInit(): void {
    // Load lists of suppliers first, then calculations
    this.dataService.getSuppliers().subscribe({
      next: (sups) => {
        this.suppliers.set(sups);
        this.loadDashboardData();
      },
      error: () => this.loadDashboardData()
    });
  }

  loadDashboardData(): void {
    this.refreshing.set(true);
    
    this.dataService.getDashboardKpis().subscribe({
      next: (kpiData) => this.kpis.set(kpiData),
      error: (e) => console.error("Error fetching KPIs", e)
    });

    this.dataService.getCalculations().subscribe({
      next: (calcData) => {
        this.calculations.set(calcData);
        this.refreshing.set(false);
      },
      error: (e) => {
        console.error("Error fetching calculations", e);
        this.refreshing.set(false);
      }
    });
  }

  // Filter calculations based on supplier name or code search query
  readonly filteredCalculations = computed(() => {
    const query = this.searchQuery.toLowerCase().trim();
    const calcs = this.calculations();
    if (!query) return calcs;

    return calcs.filter(calc => {
      const name = this.getSupplierName(calc.supplier_id).toLowerCase();
      const code = this.getSupplierCode(calc.supplier_id).toLowerCase();
      return name.includes(query) || code.includes(query);
    });
  });

  selectCalculation(calc: any): void {
    this.selectedCalc.set(calc);
  }

  getSupplierName(supplierId: number): string {
    const s = this.suppliers().find(x => x.id === supplierId);
    return s ? s.name : `Supplier #${supplierId}`;
  }

  getSupplierCode(supplierId: number): string {
    const s = this.suppliers().find(x => x.id === supplierId);
    return s ? s.code : 'SUP';
  }

  getAppliedRate(calc: any): number {
    if (!calc.rule || !calc.rule.tiers) return 0.0;
    
    const metric = calc.rule.rule_type === 'volume' ? calc.total_sales_volume : calc.total_sales_value;
    const sortedTiers = [...calc.rule.tiers].sort((a, b) => a.min - b.min);
    
    let appliedRate = 0.0;
    for (const tier of sortedTiers) {
      if (tier.max === null || tier.max === undefined) {
        if (metric >= tier.min) appliedRate = tier.rate;
      } else {
        if (metric >= tier.min && metric <= tier.max) appliedRate = tier.rate;
      }
    }
    return appliedRate;
  }

  isCurrentTier(tier: any, calc: any): boolean {
    const metric = calc.rule.rule_type === 'volume' ? calc.total_sales_volume : calc.total_sales_value;
    if (tier.max === null || tier.max === undefined) {
      return metric >= tier.min;
    }
    return metric >= tier.min && metric <= tier.max;
  }
}
