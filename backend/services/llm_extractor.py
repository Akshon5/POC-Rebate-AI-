import os
import json
from typing import Any, Dict, List, Optional

from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

class Tier(BaseModel):
    min: Optional[float] = Field(None, description="Lower bound of the tier (inclusive). Use null if no lower limit.")
    max: Optional[float] = Field(None, description="Upper bound of the tier (inclusive). Use null if no upper limit (open-ended).")
    rate: Optional[float] = Field(None, description="Rebate rate as a decimal (e.g., 0.015 for 1.5%).")

class RebateRule(BaseModel):
    rule_name: Optional[str] = Field(None, description="Descriptive name, e.g. '2% on Q1 purchases' or 'Volume Tier Scheme'.")
    rule_type: Optional[str] = Field(None, description="Must be 'volume' (units/quantity) or 'revenue' (monetary spending/purchases).")
    period: Optional[str] = Field("Yearly", description="The period this rule applies to. Must be exactly one of: 'Yearly', 'Q1', 'Q2', 'Q3', 'Q4'.")
    year: Optional[int] = Field(None, description="The calendar year this rule applies to, e.g. 2025.")
    target: Optional[float] = Field(None, description="For flat-target rules: the minimum sales threshold to qualify for the rebate (e.g. 550000.0). Leave null for multi-tiered rules.")
    rate: Optional[float] = Field(None, description="For flat-target rules: the rebate rate as a decimal (e.g. 0.02 for 2%). Leave null for multi-tiered rules.")
    tiers: List[Tier] = Field(default_factory=list, description="For progressive multi-tiered rules only. Leave empty if the rule has a flat target and rate.")
    raw_text_citation: Optional[str] = Field(None, description="Verbatim quote or very close paraphrase of the specific contract sentence(s) defining this rule.")

class RebateContractExtraction(BaseModel):
    supplier_code: Optional[str] = Field(
        None,
        description=(
            "Short uppercase abbreviation of supplier_name for the rebate recipient "
            "(e.g. 'Beta Trading Pte Ltd' → 'BETATRD'). Return null if supplier_name is null."
        ),
    )
    supplier_name: Optional[str] = Field(
        None,
        description=(
            "Legal name of the rebate RECIPIENT — the party whose purchases, volume, or "
            "revenue are measured to calculate the rebate. This must be the buyer/customer "
            "that appears in sales registers, NOT the manufacturer, seller, vendor, or "
            "supplier who grants the rebate. Return null if the recipient is not named."
        ),
    )
    rules: List[RebateRule] = Field(default_factory=list, description="All rebate rules found in the contract (may include Yearly, Q1, Q2, Q3, Q4, and tiered rules).")

_SYSTEM_PROMPT = """You are a contract analyst specialised in supplier rebate agreements.

Your task: read the supplied contract text and extract ONLY the rebate rules (including yearly, quarterly, tiered, and fund/MDF schemes) into a structured JSON object.

═══════════════════════════════════════════════════════════════════
SECTION 0 — SCOPE: WHAT TO INCLUDE vs EXCLUDE (Read first)
═══════════════════════════════════════════════════════════════════
INCLUDE only rules where the BUYER earns money BACK (a rebate / credit / incentive payment) from the SELLER, calculated as a percentage of total purchases above a threshold, or as a tiered rate on cumulative spend/volume.

TYPICAL INCLUDE examples:
  - "2% rebate on total annual purchases above S$2,200,000"
  - "Quarterly rebate: if Q1 purchases exceed S$550,000, earn 2% on all Q1 purchases"
  - "Marketing incentive: up to X% of actual sales, paid by invoice"
  - "MDF fund: not to exceed 1% of net purchases"
  - Tiered volume schemes where the RATE earned by the buyer increases at higher thresholds

EXCLUDE the following — these are NOT rebate rules:
  ✗ Trade / purchase discounts already applied to the invoice price (e.g. "46% off list price", "46+20 discount for pack 2 items")
  ✗ Special pricing programs (e.g. "BELANKOS — 46/20/20", "MALLIA SENSES — 46/20/15")
  ✗ Minimum order value (MOV) requirements that unlock a pricing tier, not a rebate payback
  ✗ Freight / logistics allowances
  ✗ General payment terms or credit terms
  ✗ Any clause that describes a price at which goods are sold, rather than money returned to the buyer after purchase

If you are unsure whether a clause is a rebate or a pricing discount, prefer EXCLUDE.

═══════════════════════════════════════════════════════════════════
SECTION 1 — COMPLETENESS (Most critical rule)
═══════════════════════════════════════════════════════════════════
A. Extract EVERY named rebate scheme or row found in the contract, even if they share the same period.
   - A contract table with 3 labelled rows (e.g. "1. Yearly Target", "2. Offer target", "3. MDF") must produce AT LEAST 3 rule objects.
   - Do NOT merge different named schemes into one rule.
B. Split DIFFERENT PERIODS of the SAME scheme into separate rules. For example:
   - A Yearly target → period="Yearly"
   - Quarterly targets (Q1, Q2, Q3, Q4) → FOUR separate rules each with period="Q1", "Q2", "Q3", "Q4"

═══════════════════════════════════════════════════════════════════
SECTION 2 — NUMBER FORMAT (Critical for Asian contracts)
═══════════════════════════════════════════════════════════════════
A. VIETNAMESE / EUROPEAN NUMBER FORMAT: The dot "." is used as a THOUSANDS SEPARATOR, not a decimal point.
   - "1.300" means ONE THOUSAND THREE HUNDRED (1300), NOT one-point-three.
   - "1.600" means ONE THOUSAND SIX HUNDRED (1600), NOT one-point-six.
   - "550.000" means FIVE HUNDRED FIFTY THOUSAND (550000), NOT 550.0.
   - The comma "," is the decimal separator in Vietnamese format: "1,5%" means 1.5%.
   - Always convert to standard float: "1.300" → 1300.0, "550.000" → 550000.0
B. SCALE WORDS: When a monetary amount is followed by a scale word, multiply accordingly:
   - "tỷ" (Vietnamese) = billion = × 1,000,000,000
   - "triệu" (Vietnamese) = million = × 1,000,000
   - "nghìn" or "ngàn" (Vietnamese) = thousand = × 1,000
   - "M" or "MM" = million
   - "K" = thousand
   Example: "1.3 tỷ" = 1,300,000,000; "550 triệu" = 550,000,000

═══════════════════════════════════════════════════════════════════
SECTION 3 — RULE TYPES
═══════════════════════════════════════════════════════════════════
A. FLAT TARGET RULES (single threshold + single rate):
   - Set: "target" = the threshold value (as a plain float)
   - Set: "rate" = the rebate rate as a decimal (e.g. 0.02 for 2%)
   - Leave: "tiers" = []

B. TIERED / LEVEL RULES (multiple thresholds → multiple rates):
   These appear in table columns like "target level 1", "target level 2", or "tier 1 / tier 2".
   - Set: "tiers" = list of tier objects
   - Set: "target" = null, "rate" = null
   - For each tier: {"min": <lower threshold>, "max": <upper threshold or null if open-ended>, "rate": <decimal rate>}
   - The first tier's min should be the first threshold value (e.g. target level 1).
   - The last tier's max should be null (open-ended, meaning "above this level").
   - Example: "Level 1: 1300 → 1.5%, Level 2: 1600 → 2%"
     → tiers = [{"min": 1300.0, "max": 1600.0, "rate": 0.015}, {"min": 1600.0, "max": null, "rate": 0.02}]

C. FUND / MDF RULES (Marketing Development Fund, sample support, etc.):
   - These are valid rebate rules even if payment is "by invoice" or "in-kind".
   - Extract as a revenue rule with the stated maximum rate.
   - If the rule says "not exceed X% of actual sales", treat that X% as the rate.
   - Set "rule_type" = "revenue" unless it's volume-based.

═══════════════════════════════════════════════════════════════════
SECTION 4 — DATA INTEGRITY
═══════════════════════════════════════════════════════════════════
1. Every field value must come exclusively from what is explicitly stated in the contract text.
   - Do NOT invent, guess, or fill in plausible-looking numbers.
   - If a field cannot be determined from the text, return null.
2. "rule_type" must be "volume" when thresholds are in units/quantities, "revenue" when in monetary amounts.
3. "raw_text_citation" must be a verbatim quote of the specific sentence(s) or table row that defines each rule. NOT generic boilerplate.
4. Work correctly for contracts written in English, Vietnamese, or bilingual.

═══════════════════════════════════════════════════════════════════
SECTION 5 — IDENTIFYING THE REBATE RECIPIENT (supplier_name)
═══════════════════════════════════════════════════════════════════
supplier_name and supplier_code identify the REBATE RECIPIENT — the party whose purchases, volume, or revenue are measured to calculate the rebate.

  a) DISTRIBUTION AGREEMENT (Manufacturer/Seller grants rebate on Distributor/Buyer purchases):
     → supplier_name = the Distributor or Buyer. NEVER the Manufacturer or Seller.

  b) VENDOR/SUPPLIER REBATE AGREEMENT:
     → supplier_name = the Client, Customer, or Purchasing party. NEVER the Supplier/Vendor paying the rebate.

  c) BILINGUAL Vietnamese/English (Bên A / Bên B or Nhà cung cấp):
     → supplier_name = Bên A, Purchasing Client, or Buyer — the party whose cumulative
     purchases/revenue are measured. Nhà cung cấp / Bên B / Supplier is usually NOT
     the rebate recipient.

  If the rebate recipient is not named, return null for both supplier_name and supplier_code.
  supplier_code: derive a short uppercase abbreviation from supplier_name only
  (e.g. "Beta Trading Pte Ltd" → "BETATRD"). Null if supplier_name is null.
"""

def _get_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "GEMINI_API_KEY is not set. "
            "Add it to your .env file or export it in the shell before starting the server."
        )
    return genai.Client(api_key=api_key)

def _sanitize_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Post-process the LLM result to:
    1. Remove hollow rules (no tiers AND no flat target+rate — nothing to calculate)
    2. Warn if tiers have null min/max (extraction likely incomplete)
    3. Filter obvious trade-discount rules that slipped past the LLM prompt
    """
    import logging
    logger = logging.getLogger(__name__)

    # Keywords that indicate a trade-discount / pricing clause, NOT a rebate
    DISCOUNT_KEYWORDS = [
        "special price", "standard pack", "pack 2", "pack2",
        "mov ", "min order", "minimum order",
        "belankos", "mallia", "delivery in", "consecutive month",
        "freight", "46%", "46/20", "46+20",
    ]

    kept_rules = []
    for rule in result.get("rules", []):
        tiers = rule.get("tiers", [])
        name = (rule.get("rule_name") or "").lower()
        citation = (rule.get("raw_text_citation") or "").lower()

        # --- Filter 1: hollow rule ---
        if not tiers and rule.get("target") is None and rule.get("rate") is None:
            logger.warning(
                f"Rule '{rule.get('rule_name', '<unnamed>')}': no tiers and no flat target/rate — DROPPED."
            )
            continue

        # --- Filter 2: trade-discount heuristic ---
        is_discount = any(kw in name or kw in citation for kw in DISCOUNT_KEYWORDS)
        if is_discount:
            logger.warning(
                f"Rule '{rule.get('rule_name', '<unnamed>')}': looks like a trade discount (not a rebate) — DROPPED."
            )
            continue

        # --- Warn about bad tiers but keep the rule ---
        if tiers:
            null_bounds = [t for t in tiers if t.get("min") is None and t.get("max") is None]
            if null_bounds:
                logger.warning(
                    f"Rule '{rule.get('rule_name', '<unnamed>')}': {len(null_bounds)} tier(s) have null min AND max — "
                    "thresholds may not have been extracted correctly."
                )

        kept_rules.append(rule)

    result["rules"] = kept_rules
    logger.info(f"Sanitizer: kept {len(kept_rules)} rule(s) after filtering.")
    return result



def extract_rebate_rules(text: str) -> Dict[str, Any]:
    client = _get_client()

    user_message = (
        "Extract all rebate rules from the following contract text.\n\n"
        "CONTRACT TEXT:\n"
        "---\n"
        f"{text}\n"
        "---"
    )

    try:
        model_name = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")
        response = client.models.generate_content(
            model=model_name,
            contents=user_message,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=RebateContractExtraction,
                temperature=0.0,
            ),
        )
    except Exception as exc:
        raise RuntimeError(f"Gemini API call failed: {type(exc).__name__}: {exc}") from exc

    raw_text = response.text

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Gemini returned non-JSON output (parse error: {exc}). Raw response was:\n{raw_text[:500]}") from exc

    if not isinstance(result, dict):
        raise RuntimeError(f"Expected dict from Gemini, got {type(result)}")

    return _sanitize_result(result)