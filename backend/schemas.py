from pydantic import BaseModel, Field, model_validator
from typing import Any, List, Optional
from datetime import datetime
import json

# User Schemas
class UserBase(BaseModel):
    username: str

class UserCreateAdmin(BaseModel):
    full_name: str
    email: str
    username: str
    password: str
    role: str = "user"  # 'admin' or 'user'

class UserCreate(UserBase):
    password: str
    role: str = "user"

class UserLogin(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    role: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    class Config:
        from_attributes = True

# Rebate Rule Tier structure (individual tier object)
class RebateTier(BaseModel):
    min_value: Optional[float] = Field(None, alias="min")
    max_value: Optional[float] = Field(None, alias="max")
    rate: float  # e.g., 0.02 for 2%

    class Config:
        populate_by_name = True

# Rebate Rule Schemas
class RebateRuleBase(BaseModel):
    name: str
    rule_type: str  # 'volume' or 'revenue'
    tiers: List[RebateTier] = []
    period: Optional[str] = "Yearly"     # 'Yearly', 'Q1', 'Q2', 'Q3', 'Q4'
    year: Optional[int] = 2025
    target: Optional[float] = None       # flat target threshold
    rate: Optional[float] = None         # flat rebate rate
    raw_text_citation: Optional[str] = None
    is_validated: bool = False

class RebateRuleCreate(RebateRuleBase):
    supplier_id: int

class RebateRuleUpdate(BaseModel):
    name: Optional[str] = None
    rule_type: Optional[str] = None
    tiers: Optional[List[RebateTier]] = None
    raw_text_citation: Optional[str] = None
    is_validated: Optional[bool] = None

class RebateRuleResponse(RebateRuleBase):
    id: int
    supplier_id: int
    updated_at: datetime
    supplier_name: Optional[str] = None
    
    @model_validator(mode="before")
    @classmethod
    def parse_tiers_json(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "tiers" not in data or data["tiers"] is None:
                tiers_json = data.get("tiers_json")
                if tiers_json:
                    try:
                        data["tiers"] = json.loads(tiers_json)
                    except Exception:
                        data["tiers"] = []
                else:
                    data["tiers"] = []
            return data
            
        # It's an ORM object
        try:
            # Set supplier_name from the relationship
            supplier = getattr(data, "supplier", None)
            if supplier:
                setattr(data, "supplier_name", supplier.name)
                
            tiers = getattr(data, "tiers", None)
            if not tiers:
                tiers_json = getattr(data, "tiers_json", None)
                parsed_tiers = []
                if tiers_json:
                    try:
                        parsed_tiers = json.loads(tiers_json)
                    except Exception:
                        pass
                # Map keys min/max to support alias config
                mapped_tiers = []
                for tier in parsed_tiers:
                    mapped_tiers.append({
                        "min": tier.get("min", tier.get("min_value", 0.0)),
                        "max": tier.get("max", tier.get("max_value")),
                        "rate": tier.get("rate", 0.0)
                    })
                setattr(data, "tiers", mapped_tiers)
        except Exception:
            pass
        return data

    class Config:
        from_attributes = True

# Supplier Schemas
class SupplierBase(BaseModel):
    name: str
    code: str

class SupplierCreate(SupplierBase):
    pass

class SupplierResponse(SupplierBase):
    id: int
    rules: List[RebateRuleResponse] = []
    class Config:
        from_attributes = True

# Sales Record Schemas
class SalesRecordResponse(BaseModel):
    id: int
    supplier_id: int
    item_id: str
    item_name: Optional[str] = None
    date: str
    quantity: float
    revenue: float
    upload_batch_id: str
    class Config:
        from_attributes = True

# Calculation Result Schemas
class CalculationResultResponse(BaseModel):
    id: int
    supplier_id: int
    rule_id: int
    calculation_date: datetime
    total_sales_value: float
    total_sales_volume: float
    calculated_rebate: float
    provisioned_rebate: float = 0.0
    achievement_percentage: float
    target_status: str = "Not Met"
    rule: Optional[RebateRuleResponse] = None
    class Config:
        from_attributes = True

# Dashboard KPI Schema
class DashboardKpis(BaseModel):
    total_provisions: float
    active_suppliers_count: int
    rules_validated_count: int
    rules_pending_count: int
    top_supplier_rebates: List[dict]  # list of {name, rebate}
