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
    supplier_code: Optional[str] = Field(None, description="Short uppercase identifier, e.g., 'DHL', 'JUNHO', or null if not found.")
    supplier_name: Optional[str] = Field(None, description="Full legal name of the supplier, or null if not found.")
    rule_name: Optional[str] = Field(None, description="Descriptive name for this rebate rule.")
    rule_type: Optional[str] = Field(None, description="Must be 'volume' (units/quantity) or 'revenue' (monetary spending/purchases).")
    tiers: List[Tier] = Field(default_factory=list, description="List of rebate tiers.")
    raw_text_citation: Optional[str] = Field(None, description="Verbatim quote or very close paraphrase of the specific contract sentence(s) defining the rebate rule.")

_SYSTEM_PROMPT = """You are a contract analyst specialised in supplier rebate agreements.

Your task: read the supplied contract text and extract the rebate rule into a structured JSON object.

Rules you MUST follow:
1. Every field value must come exclusively from what is explicitly stated in the contract text.
   - If a field cannot be determined, return null for that field.
   - Do NOT invent, guess, or fill in plausible-looking numbers.
2. "rule_type" must be "volume" when the tier thresholds are expressed in units/quantities,
   and "revenue" when they are expressed in monetary amounts. Return null if ambiguous.
3. "tiers" must preserve the exact numeric boundaries and rates from the contract.
   Represent rates as decimals (e.g., 2% → 0.02). An open-ended tier has max: null.
4. "raw_text_citation" must be a verbatim quote or a very close paraphrase of the
   specific sentence(s) in the contract that define the rebate structure.
   It must NOT be generic boilerplate.
5. Work correctly for contracts written in English or Vietnamese — do not make
   language-specific assumptions about structure.
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
        "Extract the rebate rule from the following contract text.\n\n"
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
                response_schema=RebateRule,
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