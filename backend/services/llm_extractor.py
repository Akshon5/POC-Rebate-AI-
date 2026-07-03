import json
import re
from typing import Dict, Any, List

def extract_rebate_rules(text: str) -> Dict[str, Any]:
    """
    Simulates an LLM (Azure OpenAI) parsing raw contract text.
    It parses either real or mocked text and returns structured rule data.
    """
    # Initialize defaults
    supplier_code = "UNKNOWN"
    supplier_name = "Unknown Supplier"
    rule_name = "Volume/Revenue Rebate Agreement"
    rule_type = "revenue"
    tiers = []
    citation = "Section details not found."

    text_lower = text.lower()

    # Case 1: DHL Contract
    if "dhl" in text_lower:
        supplier_code = "DHL"
        supplier_name = "DHL Malaysia"
        rule_name = "DHL volume-based shipment rebates 2025"
        rule_type = "volume"
        tiers = [
            {"min": 0, "max": 5000, "rate": 0.010},
            {"min": 5001, "max": 20000, "rate": 0.025},
            {"min": 20001, "max": None, "rate": 0.045}
        ]
        citation = "Section 4: Rebate Structure. The rebates shall be calculated annually as a percentage of total shipment volume (quantity of units) as follows: From 0 to 5,000 units shipped: 1.0% rebate rate; 5,001 to 20,000 units: 2.5%; 20,001 units and above: 4.5%."

    # Case 2: Jun Ho Contract
    elif "jun" in text_lower or "ho" in text_lower:
        supplier_code = "JUNHO"
        supplier_name = "Jun Ho Corp"
        rule_name = "Jun Ho revenue-based purchase rebates 2025"
        rule_type = "revenue"
        tiers = [
            {"min": 0, "max": 50000, "rate": 0.000},
            {"min": 50000, "max": 200000, "rate": 0.030},
            {"min": 200000, "max": None, "rate": 0.055}
        ]
        citation = "Điều 6: Mức chiết khấu đạt được (Section 6: Rebate Tiers achieved). Tỷ lệ chiết khấu sẽ được tính dựa trên tổng giá trị mua hàng (doanh thu tính bằng USD) trong năm tài khóa: Dưới $50,000 USD: 0%; Từ $50,000 USD đến $200,000 USD: 3.0%; Trên $200,000 USD: 5.5%."

    # Case 3: Generic Fallback Parser (Basic regex matching for unknown PDFs)
    else:
        # Try to find a supplier name
        supplier_match = re.search(r'(?:agreement with|between|supplier:)\s*([A-Za-z0-9 ]{3,30})', text, re.IGNORECASE)
        if supplier_match:
            supplier_name = supplier_match.group(1).strip()
            supplier_code = re.sub(r'[^A-Z0-9]', '', supplier_name.upper())[:6]
        
        # Check if volume or revenue based
        if "volume" in text_lower or "unit" in text_lower or "quantity" in text_lower:
            rule_type = "volume"
            rule_name = f"{supplier_name} Volume-Based Rebate"
        else:
            rule_type = "revenue"
            rule_name = f"{supplier_name} Revenue-Based Rebate"

        # Look for percentages
        pct_matches = re.findall(r'(\d+(?:\.\d+)?)\s*%', text)
        rates = [float(p) / 100.0 for p in pct_matches] if pct_matches else [0.01, 0.02, 0.03]
        
        # Build simple incremental tiers
        if len(rates) == 1:
            tiers = [{"min": 0, "max": None, "rate": rates[0]}]
        elif len(rates) == 2:
            tiers = [
                {"min": 0, "max": 10000, "rate": rates[0]},
                {"min": 10001, "max": None, "rate": rates[1]}
            ]
        else:
            tiers = [
                {"min": 0, "max": 10000, "rate": rates[0] if len(rates) > 0 else 0.01},
                {"min": 10001, "max": 50000, "rate": rates[1] if len(rates) > 1 else 0.02},
                {"min": 50001, "max": None, "rate": rates[2] if len(rates) > 2 else 0.03}
            ]
        
        # Search for a paragraph containing "rebate" to use as citation
        sentences = re.split(r'\. |\n', text)
        rebate_sentences = [s for s in sentences if "rebate" in s.lower() or "chiết khấu" in s.lower()]
        citation = " ... ".join(rebate_sentences[:2]) if rebate_sentences else text[:300]

    return {
        "supplier_code": supplier_code,
        "supplier_name": supplier_name,
        "rule_name": rule_name,
        "rule_type": rule_type,
        "tiers": tiers,
        "raw_text_citation": citation
    }
