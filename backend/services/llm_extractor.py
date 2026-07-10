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

Your task: read the supplied contract text and extract ALL active rebate rules (including yearly, quarterly, and multi-tiered schemes) into a structured JSON object.

Rules you MUST follow:
1. Every field value must come exclusively from what is explicitly stated in the contract text.
   - If a field cannot be determined, return null for that field.
   - Do NOT invent, guess, or fill in plausible-looking numbers.
2. Split DIFFERENT schemes into SEPARATE rule objects. For example, if a contract defines both:
   - A Yearly target (e.g. "> $2.2M gets 2%") → create one rule with period="Yearly"
   - Quarterly targets (e.g. "> $550k per Q1 gets 2%") → create FOUR separate rules with period="Q1", "Q2", "Q3", "Q4"
3. For FLAT TARGET rules (a single threshold + a single rate), set:
   - "target" = the threshold (e.g. 550000.0)
   - "rate" = the rebate rate (e.g. 0.02)
   - Leave "tiers" as an empty list.
4. For PROGRESSIVE TIERED rules (e.g. 0–5k = 1%, 5k–10k = 2.5%, 10k+ = 3%), set:
   - "tiers" = the list of tier objects with min/max/rate
   - Leave "target" and "rate" as null.
5. "rule_type" must be "volume" when tier thresholds are expressed in units/quantities,
   and "revenue" when they are expressed in monetary amounts.
6. "raw_text_citation" must be a verbatim quote of the specific sentence(s) that define each rule.
   It must NOT be generic boilerplate.
7. Work correctly for contracts written in English or Vietnamese.
8. supplier_name and supplier_code identify the REBATE RECIPIENT — the party whose purchases,
   volume, or revenue are measured to calculate the rebate. This entity must match the
   buyer/customer name in sales register data. Apply by contract type:
   a) DISTRIBUTION AGREEMENT (Manufacturer/Seller grants rebate on Distributor/Buyer purchases):
      → supplier_name = the Distributor or Buyer. NEVER the Manufacturer or Seller.
      Example: "Acme Manufacturing Ltd" (Manufacturer) + "Beta Trading Pte Ltd" (Distributor)
      with rebate on Distributor purchases → supplier_name = "Beta Trading Pte Ltd".
   b) VENDOR/SUPPLIER REBATE AGREEMENT (Supplier/Vendor grants rebate to a Client/Customer):
      → supplier_name = the Client, Customer, Contracting Client, or Purchasing party.
      NEVER the Supplier or Vendor who pays the rebate.
      Example: "LogiCo Services Ltd" (Supplier) rebates "Purchasing Client" on volume
      → supplier_name = "Purchasing Client" (or null if the client is not named).
   c) BILINGUAL Vietnamese/English (Bên A / Bên B or Nhà cung cấp):
      → supplier_name = Bên A, Purchasing Client, or Buyer — the party whose cumulative
      purchases/revenue are measured. Nhà cung cấp / Bên B / Supplier is usually NOT
      the rebate recipient.
      Example: "XYZ Corp" (Nhà cung cấp/Supplier) + "ABC Purchasing Ltd" (Bên A)
      with rebate on Bên A revenue → supplier_name = "ABC Purchasing Ltd".
   If the rebate recipient is not named anywhere in the contract, return null for both
   supplier_name and supplier_code. Do NOT substitute the granting party's name.
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
        response = client.models.generate_content(
            model="gemini-2.5-flash",
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

    return result