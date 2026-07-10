"""
currency_service.py — Static exchange rate table for POC.

All rates convert FROM the given currency TO USD.
For production, replace with a live FX API (e.g. Open Exchange Rates, ECB).

Last updated: 2025-07 (approximate mid-market rates)
"""

# currency_code -> rate to multiply by to get USD equivalent
EXCHANGE_RATES_TO_USD: dict[str, float] = {
    "USD": 1.0,
    # Asia-Pacific
    "SGD": 0.740,    # Singapore Dollar
    "VND": 0.0000394,# Vietnamese Dong
    "MYR": 0.225,    # Malaysian Ringgit
    "THB": 0.028,    # Thai Baht
    "PHP": 0.0174,   # Philippine Peso
    "IDR": 0.0000615,# Indonesian Rupiah
    "HKD": 0.128,    # Hong Kong Dollar
    "KRW": 0.00073,  # South Korean Won
    "TWD": 0.031,    # Taiwan Dollar
    "CNY": 0.138,    # Chinese Yuan
    "JPY": 0.0067,   # Japanese Yen
    "INR": 0.012,    # Indian Rupee
    "AUD": 0.650,    # Australian Dollar
    "NZD": 0.601,    # New Zealand Dollar
    # Europe
    "EUR": 1.090,    # Euro
    "GBP": 1.270,    # British Pound
    "CHF": 1.120,    # Swiss Franc
    "SEK": 0.097,    # Swedish Krona
    "NOK": 0.095,    # Norwegian Krone
    "DKK": 0.146,    # Danish Krone
    # Americas
    "CAD": 0.730,    # Canadian Dollar
    "BRL": 0.195,    # Brazilian Real
    "MXN": 0.058,    # Mexican Peso
    # Middle East & Africa
    "AED": 0.272,    # UAE Dirham
    "SAR": 0.267,    # Saudi Riyal
    "ZAR": 0.054,    # South African Rand
}


def get_rate_to_usd(currency_code: str) -> float:
    """Return the exchange rate to convert 1 unit of `currency_code` to USD.
    
    Falls back to 1.0 (i.e., treat as USD) if the currency is unknown,
    so calculations never silently fail — they just won't convert.
    """
    if not currency_code:
        return 1.0
    return EXCHANGE_RATES_TO_USD.get(currency_code.upper().strip(), 1.0)


def to_usd(amount: float, currency_code: str) -> float:
    """Convert an amount in the given currency to its USD equivalent."""
    if amount is None:
        return 0.0
    return round(amount * get_rate_to_usd(currency_code), 6)


def is_known_currency(currency_code: str) -> bool:
    """Return True if we have an exchange rate for this currency."""
    if not currency_code:
        return False
    return currency_code.upper().strip() in EXCHANGE_RATES_TO_USD
