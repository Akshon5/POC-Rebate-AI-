from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)  # Simple password for POC demo
    role = Column(String, nullable=False, default="user")  # 'admin' or 'user'

class Supplier(Base):
    __tablename__ = "suppliers"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    code = Column(String, unique=True, index=True, nullable=False)  # e.g., DHL
    
    rules = relationship("RebateRule", back_populates="supplier", cascade="all, delete-orphan")
    sales = relationship("SalesRecord", back_populates="supplier", cascade="all, delete-orphan")
    calculations = relationship("CalculationResult", back_populates="supplier", cascade="all, delete-orphan")

class RebateRule(Base):
    __tablename__ = "rebate_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)  # e.g., Volume Tier 2025
    rule_type = Column(String, nullable=False)  # 'volume' or 'revenue'
    
    # JSON-formatted string: [{"min": 0, "max": 10000, "rate": 0.01}, {"min": 10001, "max": 50000, "rate": 0.02}]
    tiers_json = Column(Text, nullable=False)
    
    raw_text_citation = Column(Text, nullable=True)  # Quote/citation from PDF contract
    is_validated = Column(Boolean, default=False)  # For human-in-the-loop review
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    supplier = relationship("Supplier", back_populates="rules")
    calculations = relationship("CalculationResult", back_populates="rule", cascade="all, delete-orphan")

class SalesRecord(Base):
    __tablename__ = "sales_records"
    
    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    item_id = Column(String, nullable=False)
    item_name = Column(String, nullable=True)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    quantity = Column(Float, nullable=False)
    revenue = Column(Float, nullable=False)
    upload_batch_id = Column(String, nullable=False)
    
    supplier = relationship("Supplier", back_populates="sales")

class CalculationResult(Base):
    __tablename__ = "calculation_results"
    
    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    rule_id = Column(Integer, ForeignKey("rebate_rules.id", ondelete="CASCADE"), nullable=False)
    calculation_date = Column(DateTime, default=datetime.utcnow)
    total_sales_value = Column(Float, default=0.0)
    total_sales_volume = Column(Float, default=0.0)
    calculated_rebate = Column(Float, default=0.0)
    achievement_percentage = Column(Float, default=0.0)  # e.g., how far along the active tier
    
    supplier = relationship("Supplier", back_populates="calculations")
    rule = relationship("RebateRule", back_populates="calculations")
