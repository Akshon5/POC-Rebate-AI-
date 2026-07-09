import os
import json
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

import database, models, schemas
from services.ocr import extract_text_from_pdf
from services.llm_extractor import extract_rebate_rules
from services.rebate_engine import calculate_rebates_for_supplier

# Initialize FastAPI app
app = FastAPI(
    title="Sales Condition POC API",
    description="Backend services for contract rule extraction and rebate calculations",
    version="1.0.0"
)

# Enable CORS for Angular frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Serve Angular frontend static files ──────────────────────────────────────
_FRONTEND_DIR = os.path.normpath(os.path.join(
    os.path.dirname(__file__),
    "..", "frontend", "dist", "frontend", "browser"
))

if os.path.isdir(_FRONTEND_DIR):
    print(f"Serving frontend from: {_FRONTEND_DIR}")
else:
    print(f"WARNING: Frontend build not found at {_FRONTEND_DIR} — run 'npm run build' in frontend/")

# Create database tables
models.Base.metadata.create_all(bind=database.engine)

# Auto-seed database with default users and suppliers
@app.on_event("startup")
def seed_data():
    # --- SQLite migration: add new columns if they don't exist yet ---
    with database.engine.connect() as conn:
        for col in ["full_name", "email"]:
            try:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} TEXT"))
                conn.commit()
                print(f"Migration: added column '{col}' to users table.")
            except Exception:
                pass  # Column already exists

    db = database.SessionLocal()
    try:
        # Check if users already exist
        if not db.query(models.User).first():
            admin_user = models.User(
                username="admin", password="password123", role="admin",
                full_name="System Admin", email="admin@company.com"
            )
            regular_user = models.User(
                username="user", password="password123", role="user",
                full_name="Demo User", email="user@company.com"
            )
            db.add_all([admin_user, regular_user])

        # Check if suppliers exist
        if not db.query(models.Supplier).first():
            dhl = models.Supplier(name="DHL Malaysia", code="DHL")
            junho = models.Supplier(name="Jun Ho Corp", code="JUNHO")
            db.add_all([dhl, junho])

        db.commit()
    except Exception as e:
        print(f"Error seeding database: {e}")
    finally:
        db.close()


# --- AUTH ENDPOINTS ---

@app.post("/api/auth/login", response_model=schemas.UserResponse)
def login(payload: schemas.UserLogin, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(
        models.User.username == payload.username,
        models.User.password == payload.password
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
    return user



# --- USER MANAGEMENT ENDPOINTS ---

@app.get("/api/users", response_model=List[schemas.UserResponse])
def get_users(db: Session = Depends(database.get_db)):
    """List all users. Admin-only access should be enforced on the frontend."""
    return db.query(models.User).all()

@app.post("/api/users", response_model=schemas.UserResponse, status_code=201)
def create_user(payload: schemas.UserCreateAdmin, db: Session = Depends(database.get_db)):
    """Admin creates a new user with full_name, email, username, password, role."""
    existing = db.query(models.User).filter(models.User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    new_user = models.User(
        full_name=payload.full_name,
        email=payload.email,
        username=payload.username,
        password=payload.password,
        role=payload.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(database.get_db)):
    """Admin deletes a user by ID."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return None


# --- SUPPLIER ENDPOINTS ---

@app.get("/api/suppliers", response_model=List[schemas.SupplierResponse])
def get_suppliers(db: Session = Depends(database.get_db)):
    return db.query(models.Supplier).all()

@app.post("/api/suppliers", response_model=schemas.SupplierResponse)
def create_supplier(payload: schemas.SupplierCreate, db: Session = Depends(database.get_db)):
    # Check if supplier already exists
    existing = db.query(models.Supplier).filter(
        (models.Supplier.code == payload.code.upper()) | 
        (models.Supplier.name == payload.name)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Supplier with this name or code already exists")
    
    supplier = models.Supplier(name=payload.name, code=payload.code.upper())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


# --- CONTRACT & AI RULE EXTRACTION ENDPOINTS ---

@app.post("/api/contracts/upload")
async def upload_contract(
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db)
):
    """
    Uploads a supplier PDF agreement, extracts text using OCR, 
    runs LLM extraction logic, and returns structured draft rules.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    contents = await file.read()
    
    # 1. Extract text from PDF
    extracted_text = extract_text_from_pdf(contents, filename=file.filename)
    
    # 2. Run LLM rule extraction simulation
    extracted_data = extract_rebate_rules(extracted_text)
    
    # 3. Check if supplier exists in DB, if not create a new one
    supplier_code = extracted_data.get("supplier_code") or "UNKNOWN"
    supplier_name = extracted_data.get("supplier_name") or "Unknown Supplier"
    supplier = db.query(models.Supplier).filter(models.Supplier.code == supplier_code).first()
    if not supplier:
        supplier = models.Supplier(name=supplier_name, code=supplier_code)
        db.add(supplier)
        db.commit()
        db.refresh(supplier)

    # Return first rule as draft for backward compatibility with rule-validator UI
    rules_list = extracted_data.get("rules", [])
    first_rule = rules_list[0] if rules_list else {}
    return {
        "supplier_id": supplier.id,
        "supplier_name": supplier.name,
        "supplier_code": supplier.code,
        "rule_name": first_rule.get("rule_name"),
        "rule_type": first_rule.get("rule_type"),
        "tiers": first_rule.get("tiers", []),
        "period": first_rule.get("period", "Yearly"),
        "year": first_rule.get("year"),
        "target": first_rule.get("target"),
        "rate": first_rule.get("rate"),
        "raw_text_citation": first_rule.get("raw_text_citation"),
        "all_rules": rules_list  # expose all extracted rules for inspection
    }


# --- REBATEIQ INTEGRATED WIZARD ENDPOINTS ---

@app.post("/api/process")
async def process_wizard_documents(
    rules_file: Optional[UploadFile] = File(None),
    sales_file: Optional[UploadFile] = File(None),
    db: Session = Depends(database.get_db)
):
    """
    Unified processing endpoint for RebateIQ Upload & Review workflow.
    Processes optional PDF contract rules and optional Excel sales data.
    Returns preview summary, rules applied, and generated rebate calculations.
    """
    import pandas as pd
    import io

    draft_rule = None
    upload_batch_id = str(uuid.uuid4())
    # pending_sales_rows: in-memory list of parsed rows — NOT written to DB here.
    # Returned to frontend and sent back on /confirm to avoid duplicate writes on re-preview.
    pending_sales_rows = []

    # 1. Process PDF Contract if uploaded
    if rules_file and rules_file.filename.lower().endswith(".pdf"):
        pdf_bytes = await rules_file.read()
        extracted_text = extract_text_from_pdf(pdf_bytes, filename=rules_file.filename)
        extracted_data = extract_rebate_rules(extracted_text)
        
        # Ensure supplier exists by code OR by name
        supplier_code = extracted_data.get("supplier_code") or "UNKNOWN"
        supplier_name = extracted_data.get("supplier_name") or "Unknown Supplier"
        
        # Check by code first, then by name (case-insensitive)
        supplier = db.query(models.Supplier).filter(
            (models.Supplier.code == supplier_code) | 
            (models.Supplier.name.ilike(supplier_name))
        ).first()
        
        if not supplier:
            supplier = models.Supplier(name=supplier_name, code=supplier_code)
            db.add(supplier)
            db.commit()
            db.refresh(supplier)

        rules_list = extracted_data.get("rules", [])
        first_rule = rules_list[0] if rules_list else {}
        draft_rule = {
            "supplier_id": supplier.id,
            "supplier_name": supplier.name,
            "supplier_code": supplier.code,
            "rule_name": first_rule.get("rule_name"),
            "rule_type": first_rule.get("rule_type"),
            "tiers": first_rule.get("tiers", []),
            "period": first_rule.get("period", "Yearly"),
            "year": first_rule.get("year"),
            "target": first_rule.get("target"),
            "rate": first_rule.get("rate"),
            "raw_text_citation": first_rule.get("raw_text_citation"),
            "all_rules": rules_list  # all periods sent to frontend, sent back on /confirm
        }

    # 2. Parse Excel Sales Register into memory — do NOT write to DB yet.
    if sales_file and sales_file.filename.lower().endswith((".xlsx", ".xls")):
        excel_bytes = await sales_file.read()
        try:
            df = pd.read_excel(io.BytesIO(excel_bytes))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")

        col_mapping = {}
        sup_priority = 0  # 0=unset, 1=plain name, 2=description, 3=code+description (best)
        for col_name in df.columns:
            c_low = col_name.lower().strip()
            is_customer = "customer" in c_low or "buyer" in c_low or "supplier" in c_low or "vendor" in c_low
            if is_customer:
                if "code" in c_low and "description" in c_low and sup_priority < 3:
                    col_mapping["supplier"] = col_name; sup_priority = 3
                elif "description" in c_low and sup_priority < 2:
                    col_mapping["supplier"] = col_name; sup_priority = 2
                elif sup_priority < 1:
                    col_mapping["supplier"] = col_name; sup_priority = 1
            elif ("item" in c_low or "sku" in c_low or "product" in c_low) and "item" not in col_mapping:
                col_mapping["item"] = col_name
            elif "date" in c_low and "date" not in col_mapping:
                col_mapping["date"] = col_name
            elif ("qty" in c_low or "quantity" in c_low or "billingqty" in c_low) and "quantity" not in col_mapping:
                col_mapping["quantity"] = col_name
            elif ("amt" in c_low or "amount" in c_low or "revenue" in c_low or ("sales" in c_low and "order" not in c_low)) and "revenue" not in col_mapping:
                col_mapping["revenue"] = col_name

        required = ["supplier", "revenue"]
        missing = [r for r in required if r not in col_mapping]
        if not missing:
            for _, row in df.iterrows():
                sup_val = str(row[col_mapping["supplier"]]).strip()
                import math
                raw_qty = row[col_mapping["quantity"]] if "quantity" in col_mapping else 1.0
                try:
                    qty_val = float(raw_qty) if raw_qty is not None and not (isinstance(raw_qty, float) and math.isnan(raw_qty)) else 1.0
                except (TypeError, ValueError):
                    qty_val = 1.0
                try:
                    rev_val = float(row[col_mapping["revenue"]])
                except (TypeError, ValueError):
                    rev_val = 0.0
                
                # Check for NaN values from Pandas
                if not sup_val or sup_val.lower() == "nan":
                    continue
                if pd.isna(rev_val):
                    rev_val = 0.0
                
                date_str = str(datetime.now().date())
                if "date" in col_mapping:
                    try:
                        date_val = row[col_mapping["date"]]
                        if isinstance(date_val, datetime):
                            date_str = str(date_val.date())
                        else:
                            date_str = str(pd.to_datetime(date_val).date())
                    except:
                        pass
                        
                item_id = "GENERIC"
                item_name = "Generic Item"
                if "item" in col_mapping:
                    item_id = str(row[col_mapping["item"]]).strip()
                    item_name = item_id

                # Clean numeric prefix (e.g. "1000000001-Singapore Electrical Cust" -> "Singapore Electrical Cust")
                clean_sup = sup_val
                if "-" in sup_val:
                    parts = [p.strip() for p in sup_val.split("-")]
                    if parts[0].isdigit() and len(parts) > 1:
                        clean_sup = parts[1]

                # Find or create supplier in DB
                supplier = db.query(models.Supplier).filter(
                    (models.Supplier.code == clean_sup.upper()) | 
                    (models.Supplier.name == clean_sup) |
                    (models.Supplier.name.ilike(f"%{clean_sup}%"))
                ).first()
                
                if not supplier:
                    # Generate a unique code — try 6-char prefix, increment if collision
                    base_code = clean_sup.upper().replace(' ', '')[:6]
                    code = base_code
                    counter = 1
                    while db.query(models.Supplier).filter(models.Supplier.code == code).first():
                        code = base_code[:5] + str(counter)
                        counter += 1
                    try:
                        supplier = models.Supplier(name=clean_sup, code=code)
                        db.add(supplier)
                        db.commit()
                        db.refresh(supplier)
                    except Exception:
                        db.rollback()
                        supplier = db.query(models.Supplier).filter(
                            models.Supplier.name == clean_sup
                        ).first()

                # Stage row in memory only — written to DB on /confirm
                pending_sales_rows.append({
                    "supplier_id": supplier.id,
                    "item_id": item_id,
                    "item_name": item_name,
                    "date": date_str,
                    "quantity": qty_val,
                    "revenue": rev_val,
                })

    # 3. Compute preview calculations in-memory (no DB reads of pending rows)
    preview_calculations = []
    total_rebate_sum = 0.0
    rules_applied_count = 0
    rates_applied = []

    # Build an in-memory aggregation: supplier_id -> {revenue, quantity}
    # from pending_sales_rows (new upload) + existing committed DB records.
    from collections import defaultdict
    agg: dict = defaultdict(lambda: {"revenue": 0.0, "quantity": 0.0})

    # Existing committed sales in DB
    for rec in db.query(models.SalesRecord).all():
        agg[rec.supplier_id]["revenue"] += rec.revenue
        agg[rec.supplier_id]["quantity"] += rec.quantity

    # Newly parsed rows (not yet in DB)
    for row in pending_sales_rows:
        agg[row["supplier_id"]]["revenue"] += row["revenue"]
        agg[row["supplier_id"]]["quantity"] += row["quantity"]

    all_suppliers = db.query(models.Supplier).all()

    for sup in all_suppliers:
        if sup.id not in agg:
            continue

        tot_rev = agg[sup.id]["revenue"]
        tot_vol = agg[sup.id]["quantity"]

        # Check rule to apply:
        # If there's a draft rule for this supplier, use it. Otherwise, look for a validated rule.
        rule_to_apply = None
        is_draft = False

        if draft_rule and draft_rule["supplier_id"] == sup.id:
            rule_to_apply = draft_rule
            is_draft = True
        else:
            db_rule = db.query(models.RebateRule).filter(
                models.RebateRule.supplier_id == sup.id,
                models.RebateRule.is_validated == True
            ).first()
            if db_rule:
                try:
                    rule_to_apply = {
                        "rule_name": db_rule.name,
                        "rule_type": db_rule.rule_type,
                        "tiers": json.loads(db_rule.tiers_json)
                    }
                except:
                    pass

        if not rule_to_apply:
            # Create a basic default 1.5% rule if no rule exists yet
            rule_to_apply = {
                "rule_name": f"{sup.name} Standard Agreement",
                "rule_type": "revenue",
                "tiers": [{"min": 0, "max": None, "rate": 0.015}]
            }

        # Apply calculation logic
        metric_val = tot_vol if rule_to_apply["rule_type"] == "volume" else tot_rev
        active_rate = 0.0
        active_tier_name = "Base"

        tiers = sorted(rule_to_apply["tiers"], key=lambda x: x.get("min") if x.get("min") is not None else 0)
        for i, tier in enumerate(tiers):
            t_min = tier.get("min") if tier.get("min") is not None else 0.0
            t_max = tier.get("max")
            
            # Determine Tier name based on index/value
            tier_lbl = "Bronze" if i == 0 else ("Silver" if i == 1 else ("Gold" if i == 2 else "Platinum"))
            
            if t_max is None:
                if metric_val >= t_min:
                    active_rate = tier.get("rate", 0.0)
                    active_tier_name = tier_lbl
                    break
            else:
                if t_min <= metric_val <= t_max:
                    active_rate = tier.get("rate", 0.0)
                    active_tier_name = tier_lbl
                    break

        rebate = tot_rev * active_rate
        total_rebate_sum += rebate
        rules_applied_count += 1
        rates_applied.append(active_rate)

        # Mock category and region for visual presentation matching RebateIQ
        category = "Logistics" if "dhl" in sup.name.lower() else ("Software" if "jun" in sup.name.lower() or "tech" in sup.name.lower() else "Electronics")
        region = "APAC" if "dhl" in sup.name.lower() else ("EMEA" if "jun" in sup.name.lower() else "NA")

        preview_calculations.append({
            "account": sup.name,
            "category": category,
            "region": region,
            "net_sales": tot_rev,
            "tier": active_tier_name,
            "rate": active_rate,
            "rebate": rebate,
            "is_draft": is_draft
        })

    avg_rate = (sum(rates_applied) / len(rates_applied) * 100.0) if rates_applied else 0.0

    return {
        "success": True,
        "batch_id": upload_batch_id,
        "summary": {
            "total_records": len(pending_sales_rows),  # real parsed row count
            "total_rebate": total_rebate_sum,
            "rules_applied": rules_applied_count,
            "avg_rebate_rate": avg_rate
        },
        "classification_rules": [draft_rule] if draft_rule else [],
        "rebate_calculations": preview_calculations,
        "draft_rule": draft_rule,
        "pending_sales_rows": pending_sales_rows  # frontend sends this back on /confirm
    }


@app.post("/api/process/confirm")
def confirm_wizard_processing(
    payload: dict,
    db: Session = Depends(database.get_db)
):
    """
    Confirms the wizard: writes sales rows to DB and saves the validated rule.
    Sales rows come from pending_sales_rows (parsed in /api/process, never written there).
    """
    batch_id = payload.get("batch_id")
    draft_rule_data = payload.get("draft_rule")
    pending_sales_rows = payload.get("pending_sales_rows", [])

    # 1. Write the pending sales rows to DB now (first and only write)
    for row in pending_sales_rows:
        sales_rec = models.SalesRecord(
            supplier_id=row["supplier_id"],
            item_id=row["item_id"],
            item_name=row["item_name"],
            date=row["date"],
            quantity=row["quantity"],
            revenue=row["revenue"],
            upload_batch_id=batch_id
        )
        db.add(sales_rec)
    if pending_sales_rows:
        db.commit()

    # 2. If draft rule exists, save ALL extracted rules to DB as validated
    if draft_rule_data:
        supplier_id = draft_rule_data["supplier_id"]
        all_rules = draft_rule_data.get("all_rules") or [draft_rule_data]  # fallback to single rule

        for rule_data in all_rules:
            rule_name = rule_data.get("rule_name") or draft_rule_data.get("rule_name") or "Unnamed Rule"
            rule_type = rule_data.get("rule_type") or "revenue"
            serialized_tiers = json.dumps(rule_data.get("tiers") or [])
            period = rule_data.get("period", "Yearly")
            year = rule_data.get("year", 2025)
            target = rule_data.get("target")
            rate = rule_data.get("rate")
            citation = rule_data.get("raw_text_citation")

            existing = db.query(models.RebateRule).filter(
                models.RebateRule.supplier_id == supplier_id,
                models.RebateRule.name == rule_name
            ).first()

            if existing:
                existing.rule_type = rule_type
                existing.tiers_json = serialized_tiers
                existing.raw_text_citation = citation
                existing.period = period
                existing.year = year
                existing.target = target
                existing.rate = rate
                existing.is_validated = True
            else:
                new_rule = models.RebateRule(
                    supplier_id=supplier_id,
                    name=rule_name,
                    rule_type=rule_type,
                    tiers_json=serialized_tiers,
                    raw_text_citation=citation,
                    period=period,
                    year=year,
                    target=target,
                    rate=rate,
                    is_validated=True
                )
                db.add(new_rule)

        db.commit()
        calculate_rebates_for_supplier(db, supplier_id)

    # 3. Trigger calculations for all suppliers with rows in this batch
    impacted_supplier_ids = {row["supplier_id"] for row in pending_sales_rows}
    for s_id in impacted_supplier_ids:
        calculate_rebates_for_supplier(db, s_id)

    return {"status": "confirmed"}


@app.post("/api/process/reject")
def reject_wizard_processing(
    payload: dict,
    db: Session = Depends(database.get_db)
):
    """
    Rejects the wizard batch. Sales rows were never written to DB in /api/process,
    so no rollback is needed. This endpoint is now a no-op kept for API compatibility.
    """
    # Nothing to undo — pending_sales_rows only existed in memory on the preview step.
    return {"status": "rejected"}


# --- RULE VALIDATION ENDPOINTS (HUMAN-IN-THE-LOOP) ---

@app.get("/api/rules", response_model=List[schemas.RebateRuleResponse])
def get_rules(validated_only: bool = False, db: Session = Depends(database.get_db)):
    query = db.query(models.RebateRule)
    if validated_only:
        query = query.filter(models.RebateRule.is_validated == True)
    return query.all()

@app.post("/api/rules/save", response_model=schemas.RebateRuleResponse)
def save_validated_rule(payload: schemas.RebateRuleCreate, db: Session = Depends(database.get_db)):
    # Delete existing rule of the same name/type for this supplier to prevent duplicates
    existing = db.query(models.RebateRule).filter(
        models.RebateRule.supplier_id == payload.supplier_id,
        models.RebateRule.name == payload.name
    ).first()
    
    # Serialize tiers list to JSON text for SQLite
    serialized_tiers = json.dumps([tier.model_dump(by_alias=True) for tier in payload.tiers])
    
    if existing:
        existing.rule_type = payload.rule_type
        existing.tiers_json = serialized_tiers
        existing.raw_text_citation = payload.raw_text_citation
        existing.is_validated = payload.is_validated
        rule = existing
    else:
        rule = models.RebateRule(
            supplier_id=payload.supplier_id,
            name=payload.name,
            rule_type=payload.rule_type,
            tiers_json=serialized_tiers,
            raw_text_citation=payload.raw_text_citation,
            is_validated=payload.is_validated
        )
        db.add(rule)
        
    db.commit()
    db.refresh(rule)
    
    # If the rule is validated, trigger calculation recalculation for this supplier
    if rule.is_validated:
        calculate_rebates_for_supplier(db, rule.supplier_id)
        
    return rule


@app.post("/api/process/confirm")
def confirm_process(payload: dict, db: Session = Depends(database.get_db)):
    """
    Called when the admin clicks 'Confirm' on Upload & Review step 3.
    Saves the draft rule (from PDF extraction) as a validated rule.
    """
    draft = payload.get("draft_rule")
    if not draft:
        # No draft rule — just return success (sales-only upload)
        return {"success": True, "message": "Sales data confirmed, no rule to save."}

    # Validate the supplier exists
    supplier = db.query(models.Supplier).filter(models.Supplier.id == draft.get("supplier_id")).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    # Serialize tiers
    tiers = draft.get("tiers", [])
    serialized_tiers = json.dumps(tiers)

    # Upsert rule
    existing = db.query(models.RebateRule).filter(
        models.RebateRule.supplier_id == supplier.id,
        models.RebateRule.name == draft.get("rule_name")
    ).first()

    if existing:
        existing.rule_type = draft.get("rule_type", existing.rule_type)
        existing.tiers_json = serialized_tiers
        existing.raw_text_citation = draft.get("raw_text_citation", existing.raw_text_citation)
        existing.is_validated = True
        rule = existing
    else:
        rule = models.RebateRule(
            supplier_id=supplier.id,
            name=draft.get("rule_name", "Extracted Rule"),
            rule_type=draft.get("rule_type", "revenue"),
            tiers_json=serialized_tiers,
            raw_text_citation=draft.get("raw_text_citation", ""),
            is_validated=True
        )
        db.add(rule)

    db.commit()
    db.refresh(rule)
    calculate_rebates_for_supplier(db, rule.supplier_id)
    return {"success": True, "message": f"Rule '{rule.name}' saved and calculations updated."}


# --- SALES UPLOAD & PARSING ENDPOINTS ---

@app.post("/api/sales/upload")
async def upload_sales_register(
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db)
):
    """
    Uploads an Excel sales register sheet, parses items, dates, and amounts,
    writes them to database, and runs the rebate calculations.
    """
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported.")
        
    contents = await file.read()
    
    # We will write a fast parser using pandas
    import pandas as pd
    import io
    
    try:
        df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")
        
    # Check headers and map dynamically
    # Look for Supplier, Date, Quantity/Volume, Revenue/Sales/Amount
    cols = [c.lower().strip() for c in df.columns]
    
    col_mapping = {}
    
    # Mappings
    for col_name in df.columns:
        c_low = col_name.lower().strip()
        if "supplier" in c_low or "vendor" in c_low:
            col_mapping["supplier"] = col_name
        elif "item" in c_low or "sku" in c_low:
            col_mapping["item"] = col_name
        elif "date" in c_low:
            col_mapping["date"] = col_name
        elif "qty" in c_low or "quantity" in c_low or "volume" in c_low:
            col_mapping["quantity"] = col_name
        elif "revenue" in c_low or "sales" in c_low or "amount" in c_low or "value" in c_low:
            col_mapping["revenue"] = col_name

    # Validate essential columns
    required = ["supplier", "quantity", "revenue"]
    missing = [r for r in required if r not in col_mapping]
    if missing:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid Excel format. Missing columns related to: {', '.join(missing)}. "
                   f"Expected columns: Supplier (code), Date, Quantity, Revenue."
        )

    upload_batch_id = str(uuid.uuid4())
    inserted_records_count = 0
    suppliers_to_recalculate = set()

    # Iterate rows
    for _, row in df.iterrows():
        sup_val = str(row[col_mapping["supplier"]]).strip()
        qty_val = float(row[col_mapping["quantity"]])
        rev_val = float(row[col_mapping["revenue"]])
        
        # Date defaults to today if not provided or invalid
        date_str = str(datetime.now().date())
        if "date" in col_mapping:
            try:
                date_val = row[col_mapping["date"]]
                if isinstance(date_val, datetime):
                    date_str = str(date_val.date())
                else:
                    date_str = str(pd.to_datetime(date_val).date())
            except:
                pass
                
        # Item defaults
        item_id = "GENERIC"
        item_name = "Generic Item"
        if "item" in col_mapping:
            item_id = str(row[col_mapping["item"]]).strip()
            item_name = item_id

        # Find or create supplier
        supplier = db.query(models.Supplier).filter(
            (models.Supplier.code == sup_val.upper()) | 
            (models.Supplier.name == sup_val)
        ).first()
        
        if not supplier:
            # Create dynamic supplier
            supplier = models.Supplier(name=sup_val, code=sup_val.upper()[:6])
            db.add(supplier)
            db.commit()
            db.refresh(supplier)

        # Write sales record
        sales_rec = models.SalesRecord(
            supplier_id=supplier.id,
            item_id=item_id,
            item_name=item_name,
            date=date_str,
            quantity=qty_val,
            revenue=rev_val,
            upload_batch_id=upload_batch_id
        )
        db.add(sales_rec)
        inserted_records_count += 1
        suppliers_to_recalculate.add(supplier.id)

    db.commit()

    # Trigger rebate calculations for all impacted suppliers
    calculations_triggered = 0
    for s_id in suppliers_to_recalculate:
        results = calculate_rebates_for_supplier(db, s_id)
        calculations_triggered += len(results)

    return {
        "status": "success",
        "records_imported": inserted_records_count,
        "batch_id": upload_batch_id,
        "suppliers_updated": len(suppliers_to_recalculate),
        "calculations_executed": calculations_triggered
    }


# --- DASHBOARD & ANALYTICS ENDPOINTS ---

@app.get("/api/dashboard/kpis", response_model=schemas.DashboardKpis)
def get_dashboard_kpis(db: Session = Depends(database.get_db)):
    # 1. Total Provisions Earned
    results = db.query(models.CalculationResult).all()
    total_provisions = sum(res.calculated_rebate for res in results)
    
    # 2. Counts
    active_suppliers_count = db.query(models.Supplier).count()
    rules_validated_count = db.query(models.RebateRule).filter(models.RebateRule.is_validated == True).count()
    rules_pending_count = db.query(models.RebateRule).filter(models.RebateRule.is_validated == False).count()
    
    # 3. Top supplier rebates breakdown
    # Aggregate rebate by supplier name
    supplier_rebates = {}
    for res in results:
        sup_name = res.supplier.name
        supplier_rebates[sup_name] = supplier_rebates.get(sup_name, 0.0) + res.calculated_rebate
        
    top_supplier_rebates = [
        {"name": name, "rebate": round(rebate, 2)} 
        for name, rebate in supplier_rebates.items()
    ]
    # Sort descending
    top_supplier_rebates = sorted(top_supplier_rebates, key=lambda x: x["rebate"], reverse=True)[:5]

    return schemas.DashboardKpis(
        total_provisions=total_provisions,
        active_suppliers_count=active_suppliers_count,
        rules_validated_count=rules_validated_count,
        rules_pending_count=rules_pending_count,
        top_supplier_rebates=top_supplier_rebates
    )

@app.get("/api/dashboard/calculations", response_model=List[schemas.CalculationResultResponse])
def get_dashboard_calculations(db: Session = Depends(database.get_db)):
    calculations = db.query(models.CalculationResult).all()
    # Unpack JSON tiers back to schema-compatible model objects
    for calc in calculations:
        if calc.rule:
            try:
                # Add dynamic .tiers attribute to the model instance for pydantic serialization
                calc.rule.tiers = json.loads(calc.rule.tiers_json)
            except:
                calc.rule.tiers = []
    return calculations


# ── SPA catch-all: serve index.html for all non-API routes ──────────────────
@app.get("/{full_path:path}")
async def serve_angular(full_path: str):
    """
    Catch-all route: serves the Angular index.html for any path that isn't
    an API route, so Angular's client-side router takes over.
    """
    index_file = os.path.join(_FRONTEND_DIR, "index.html")
    # Try to serve the exact file first (JS/CSS chunks, favicon, etc.)
    requested_file = os.path.join(_FRONTEND_DIR, full_path)
    if full_path and os.path.isfile(requested_file):
        return FileResponse(requested_file)
    # Fall back to index.html for all Angular routes
    if os.path.isfile(index_file):
        return FileResponse(index_file)
    return {"error": "Frontend not built yet. Run npm run build in the frontend folder."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
