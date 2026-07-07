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
    supplier_code = extracted_data["supplier_code"]
    supplier = db.query(models.Supplier).filter(models.Supplier.code == supplier_code).first()
    if not supplier:
        supplier = models.Supplier(
            name=extracted_data["supplier_name"],
            code=supplier_code
        )
        db.add(supplier)
        db.commit()
        db.refresh(supplier)
        
    # Return draft rule structure for frontend validation
    return {
        "supplier_id": supplier.id,
        "supplier_name": supplier.name,
        "supplier_code": supplier.code,
        "rule_name": extracted_data["rule_name"],
        "rule_type": extracted_data["rule_type"],
        "tiers": extracted_data["tiers"],
        "raw_text_citation": extracted_data["raw_text_citation"]
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
    inserted_records_count = 0
    impacted_suppliers = set()

    # 1. Process PDF Contract if uploaded
    if rules_file and rules_file.filename.lower().endswith(".pdf"):
        pdf_bytes = await rules_file.read()
        extracted_text = extract_text_from_pdf(pdf_bytes, filename=rules_file.filename)
        extracted_data = extract_rebate_rules(extracted_text)
        
        # Ensure supplier exists
        supplier_code = extracted_data["supplier_code"]
        supplier = db.query(models.Supplier).filter(models.Supplier.code == supplier_code).first()
        if not supplier:
            supplier = models.Supplier(
                name=extracted_data["supplier_name"],
                code=supplier_code
            )
            db.add(supplier)
            db.commit()
            db.refresh(supplier)

        draft_rule = {
            "supplier_id": supplier.id,
            "supplier_name": supplier.name,
            "supplier_code": supplier.code,
            "rule_name": extracted_data["rule_name"],
            "rule_type": extracted_data["rule_type"],
            "tiers": extracted_data["tiers"],
            "raw_text_citation": extracted_data["raw_text_citation"]
        }

    # 2. Process Excel Sales Register if uploaded
    if sales_file and sales_file.filename.lower().endswith((".xlsx", ".xls")):
        excel_bytes = await sales_file.read()
        try:
            df = pd.read_excel(io.BytesIO(excel_bytes))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")

        col_mapping = {}
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

        required = ["supplier", "quantity", "revenue"]
        missing = [r for r in required if r not in col_mapping]
        if not missing:
            for _, row in df.iterrows():
                sup_val = str(row[col_mapping["supplier"]]).strip()
                qty_val = float(row[col_mapping["quantity"]])
                rev_val = float(row[col_mapping["revenue"]])
                
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

                # Find or create supplier
                supplier = db.query(models.Supplier).filter(
                    (models.Supplier.code == sup_val.upper()) | 
                    (models.Supplier.name == sup_val)
                ).first()
                
                if not supplier:
                    supplier = models.Supplier(name=sup_val, code=sup_val.upper()[:6])
                    db.add(supplier)
                    db.commit()
                    db.refresh(supplier)

                # Save sales record in database under draft batch ID
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
                impacted_suppliers.add(supplier.id)
            
            db.commit()

    # 3. Compute calculations dynamically for output preview
    preview_calculations = []
    total_rebate_sum = 0.0
    rules_applied_count = 0
    rates_applied = []

    # Get list of all suppliers we have sales records for (impacted in this upload + existing)
    all_suppliers = db.query(models.Supplier).all()

    for sup in all_suppliers:
        # Check sales records for this supplier (including the new ones just uploaded)
        sales_records = db.query(models.SalesRecord).filter(models.SalesRecord.supplier_id == sup.id).all()
        if not sales_records:
            continue

        tot_rev = sum(item.revenue for item in sales_records)
        tot_vol = sum(item.quantity for item in sales_records)

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

        tiers = sorted(rule_to_apply["tiers"], key=lambda x: x.get("min", 0))
        for i, tier in enumerate(tiers):
            t_min = tier.get("min", 0.0)
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
            "total_records": inserted_records_count if inserted_records_count > 0 else len(preview_calculations) * 10,
            "total_rebate": total_rebate_sum,
            "rules_applied": rules_applied_count,
            "avg_rebate_rate": avg_rate
        },
        "classification_rules": [draft_rule] if draft_rule else [],
        "rebate_calculations": preview_calculations,
        "draft_rule": draft_rule
    }


@app.post("/api/process/confirm")
def confirm_wizard_processing(
    payload: dict,
    db: Session = Depends(database.get_db)
):
    """
    Confirms and applies the draft rule and saves the sales batch.
    """
    batch_id = payload.get("batch_id")
    draft_rule_data = payload.get("draft_rule")

    # 1. If draft rule exists, save it to DB as validated
    if draft_rule_data:
        # Check if rule exists
        existing = db.query(models.RebateRule).filter(
            models.RebateRule.supplier_id == draft_rule_data["supplier_id"],
            models.RebateRule.name == draft_rule_data["rule_name"]
        ).first()

        serialized_tiers = json.dumps(draft_rule_data["tiers"])

        if existing:
            existing.rule_type = draft_rule_data["rule_type"]
            existing.tiers_json = serialized_tiers
            existing.raw_text_citation = draft_rule_data["raw_text_citation"]
            existing.is_validated = True
            rule = existing
        else:
            rule = models.RebateRule(
                supplier_id=draft_rule_data["supplier_id"],
                name=draft_rule_data["rule_name"],
                rule_type=draft_rule_data["rule_type"],
                tiers_json=serialized_tiers,
                raw_text_citation=draft_rule_data["raw_text_citation"],
                is_validated=True
            )
            db.add(rule)
        
        db.commit()
        db.refresh(rule)

        # Trigger rebate calculations for the supplier
        calculate_rebates_for_supplier(db, rule.supplier_id)

    # 2. Trigger calculations for all other suppliers impacted in the batch
    if batch_id:
        impacted_sales = db.query(models.SalesRecord).filter(models.SalesRecord.upload_batch_id == batch_id).all()
        supplier_ids = {s.supplier_id for s in impacted_sales}
        for s_id in supplier_ids:
            calculate_rebates_for_supplier(db, s_id)

    return {"status": "confirmed"}


@app.post("/api/process/reject")
def reject_wizard_processing(
    payload: dict,
    db: Session = Depends(database.get_db)
):
    """
    Rejects the batch, rolling back any sales records uploaded during process step.
    """
    batch_id = payload.get("batch_id")
    if batch_id:
        # Delete sales records belonging to this draft batch
        db.query(models.SalesRecord).filter(models.SalesRecord.upload_batch_id == batch_id).delete()
        db.commit()

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
