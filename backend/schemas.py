from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

# User Schemas
class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str
    role: str = "user"  # 'admin' or 'user'

class UserLogin(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    role: str
    class Config:
        from_attributes = True

# Rebate Rule Tier structure (individual tier object)
class RebateTier(BaseModel):
    min_value: float = Field(..., alias="min")
    max_value: Optional[float] = Field(None, alias="max")
    rate: float  # e.g., 0.02 for 2%

    class Config:
        populate_by_name = True

# Rebate Rule Schemas
class RebateRuleBase(BaseModel):
    name: str
    rule_type: str  # 'volume' or 'revenue'
    tiers: List[RebateTier]
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
    achievement_percentage: float
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
