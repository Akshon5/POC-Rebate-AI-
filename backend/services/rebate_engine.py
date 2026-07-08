import json
from sqlalchemy.orm import Session
from models import RebateRule, SalesRecord, CalculationResult, Supplier

def calculate_rebates_for_supplier(db: Session, supplier_id: int):
    """
    Executes rebate calculations for a specific supplier by combining
    active sales records and validated rebate rules.
    """
    # 1. Fetch supplier
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        return []

    # 2. Fetch sales aggregates for this supplier
    sales = db.query(SalesRecord).filter(SalesRecord.supplier_id == supplier_id).all()
    if not sales:
        # No sales records yet
        total_revenue = 0.0
        total_volume = 0.0
    else:
        total_revenue = sum(item.revenue for item in sales)
        total_volume = sum(item.quantity for item in sales)

    # 3. Fetch validated rules
    rules = db.query(RebateRule).filter(
        RebateRule.supplier_id == supplier_id,
        RebateRule.is_validated == True
    ).all()

    results = []

    for rule in rules:
        try:
            tiers = json.loads(rule.tiers_json)
        except Exception as e:
            print(f"Error parsing tiers JSON for rule {rule.id}: {e}")
            continue

        # Sort tiers by min value just in case
        tiers = sorted(tiers, key=lambda x: x.get("min") if x.get("min") is not None else 0)

        # Determine comparison metric based on rule type
        metric_value = total_volume if rule.rule_type == "volume" else total_revenue

        # Find active tier and next tier for achievement progress
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

        # Calculate rebate (applying the active rate to the total metric value or revenue)
        # Note: Standard business practice is rebate = total revenue * active_rate
        calculated_rebate = total_revenue * active_rate

        # Calculate achievement percentage (progress to next tier)
        achievement_percentage = 100.0
        if active_tier_index != -1 and active_tier_index < len(tiers) - 1:
            current_tier = tiers[active_tier_index]
            next_tier = tiers[active_tier_index + 1]
            
            # Progress calculation: current position relative to next tier boundary
            t_min = current_tier.get("min", 0.0)
            next_threshold = next_tier.get("min", 0.0)
            
            denom = next_threshold - t_min
            if denom > 0:
                progress = (metric_value - t_min) / denom * 100.0
                achievement_percentage = min(max(progress, 0.0), 100.0)
            else:
                achievement_percentage = 100.0
        elif len(tiers) > 0 and active_tier_index == -1:
            # Below the very first tier
            first_threshold = tiers[0].get("min", 0.0)
            if first_threshold > 0:
                achievement_percentage = min((metric_value / first_threshold) * 100.0, 100.0)
            else:
                achievement_percentage = 0.0

        # 4. Check if result already exists for this rule and update it, else create new
        existing_result = db.query(CalculationResult).filter(
            CalculationResult.supplier_id == supplier_id,
            CalculationResult.rule_id == rule.id
        ).first()

        if existing_result:
            existing_result.total_sales_value = total_revenue
            existing_result.total_sales_volume = total_volume
            existing_result.calculated_rebate = calculated_rebate
            existing_result.achievement_percentage = achievement_percentage
            result = existing_result
        else:
            result = CalculationResult(
                supplier_id=supplier_id,
                rule_id=rule.id,
                total_sales_value=total_revenue,
                total_sales_volume=total_volume,
                calculated_rebate=calculated_rebate,
                achievement_percentage=achievement_percentage
            )
            db.add(result)
        
        results.append(result)

    db.commit()
    return results
