import json
from datetime import date, datetime
from sqlalchemy.orm import Session
from models import RebateRule, SalesRecord, CalculationResult, Supplier

# Maps period labels to calendar month ranges
PERIOD_MONTH_RANGES = {
    "Yearly": (1, 12),
    "Q1": (1, 3),
    "Q2": (4, 6),
    "Q3": (7, 9),
    "Q4": (10, 12),
}

def _filter_sales_by_period(sales: list, period: str, year: int) -> list:
    """Filter a list of SalesRecord objects to those within the given period and year."""
    if not period or period not in PERIOD_MONTH_RANGES:
        return sales

    start_month, end_month = PERIOD_MONTH_RANGES[period]

    filtered = []
    for record in sales:
        try:
            # date column stored as YYYY-MM-DD string
            record_date = datetime.strptime(record.date, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue
        if (record_date.year == year and
                start_month <= record_date.month <= end_month):
            filtered.append(record)
    return filtered


def calculate_rebates_for_supplier(db: Session, supplier_id: int):
    """
    Executes rebate calculations for a specific supplier by combining
    active sales records and validated rebate rules.
    Supports both flat-target period rules (Yearly/Q1-Q4) and multi-tiered rules.
    """
    # 1. Fetch supplier
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        return []

    # 2. Fetch all sales for this supplier
    all_sales = db.query(SalesRecord).filter(SalesRecord.supplier_id == supplier_id).all()

    # 3. Fetch validated rules
    rules = db.query(RebateRule).filter(
        RebateRule.supplier_id == supplier_id,
        RebateRule.is_validated == True
    ).all()

    results = []

    for rule in rules:
        # --- Determine the calculation period and year ---
        period = rule.period or "Yearly"
        year = rule.year or datetime.utcnow().year

        # Filter sales to the relevant period
        period_sales = _filter_sales_by_period(all_sales, period, year)

        period_revenue = sum(item.revenue for item in period_sales)
        period_volume = sum(item.quantity for item in period_sales)

        # --- Flat Target Rule (has target + rate, empty tiers) ---
        if rule.target is not None and rule.rate is not None:
            target = rule.target
            flat_rate = rule.rate
            provisioned_rebate = round(target * flat_rate, 2)

            if period_revenue >= target:
                target_status = "Met"
                calculated_rebate = round(period_revenue * flat_rate, 2)
                achievement_percentage = 100.0
            else:
                target_status = "Not Met"
                calculated_rebate = 0.0
                achievement_percentage = round((period_revenue / target) * 100.0, 2) if target > 0 else 0.0

        # --- Multi-Tiered Rule (has tiers, no flat target) ---
        else:
            provisioned_rebate = 0.0
            target_status = "Not Met"

            try:
                tiers = json.loads(rule.tiers_json)
            except Exception as e:
                print(f"Error parsing tiers JSON for rule {rule.id}: {e}")
                continue

            tiers = sorted(tiers, key=lambda x: x.get("min") if x.get("min") is not None else 0)

            metric_value = period_volume if rule.rule_type == "volume" else period_revenue

            active_rate = 0.0
            active_tier_index = -1

            for i, tier in enumerate(tiers):
                t_min = tier.get("min") if tier.get("min") is not None else 0.0
                t_max = tier.get("max")

                if t_max is None:
                    if metric_value >= t_min:
                        active_rate = tier.get("rate", 0.0)
                        active_tier_index = i
                        break
                else:
                    if t_min <= metric_value <= t_max:
                        active_rate = tier.get("rate", 0.0)
                        active_tier_index = i
                        break

            calculated_rebate = round(period_revenue * active_rate, 2)
            target_status = "Met" if active_rate > 0 else "Not Met"

            # Achievement percentage toward next tier
            achievement_percentage = 100.0
            if active_tier_index != -1 and active_tier_index < len(tiers) - 1:
                current_tier = tiers[active_tier_index]
                next_tier = tiers[active_tier_index + 1]
                t_min = current_tier.get("min", 0.0) or 0.0
                next_threshold = next_tier.get("min", 0.0) or 0.0
                denom = next_threshold - t_min
                if denom > 0:
                    progress = (metric_value - t_min) / denom * 100.0
                    achievement_percentage = min(max(progress, 0.0), 100.0)
            elif tiers and active_tier_index == -1:
                first_threshold = tiers[0].get("min", 0.0) or 0.0
                if first_threshold > 0:
                    achievement_percentage = min((metric_value / first_threshold) * 100.0, 100.0)
                else:
                    achievement_percentage = 0.0

        # 4. Upsert the CalculationResult
        existing_result = db.query(CalculationResult).filter(
            CalculationResult.supplier_id == supplier_id,
            CalculationResult.rule_id == rule.id
        ).first()

        if existing_result:
            existing_result.total_sales_value = period_revenue
            existing_result.total_sales_volume = period_volume
            existing_result.calculated_rebate = calculated_rebate
            existing_result.provisioned_rebate = provisioned_rebate
            existing_result.achievement_percentage = achievement_percentage
            existing_result.target_status = target_status
            result = existing_result
        else:
            result = CalculationResult(
                supplier_id=supplier_id,
                rule_id=rule.id,
                total_sales_value=period_revenue,
                total_sales_volume=period_volume,
                calculated_rebate=calculated_rebate,
                provisioned_rebate=provisioned_rebate,
                achievement_percentage=achievement_percentage,
                target_status=target_status
            )
            db.add(result)

        results.append(result)

    db.commit()
    return results
