import os
import sys
import pandas as pd
import io
import json

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient
from main import app
import database, models

# 1. Excel File containing EXACTLY the 5 clean rows
data_clean = {
    "Supplier": ["DHL", "DHL", "DHL", "DHL", "DHL"],
    "Item ID": ["Freight-Standard", "Freight-Standard", "Freight-Standard", "Freight-Standard", "Freight-Standard"],
    "Date": ["2025-01-15", "2025-04-10", "2025-07-22", "2025-09-01", "2025-09-05"],
    "Quantity": [3000, 8000, 25000, 5000, 1],
    "Revenue": [45000, 120000, 375000, 75000, 15]
}
df_clean = pd.DataFrame(data_clean)
excel_clean = io.BytesIO()
df_clean.to_excel(excel_clean, index=False)
excel_clean.seek(0)

# 2. Excel File containing the 5 rows PLUS a total row at the bottom
data_with_total = {
    "Supplier": ["DHL", "DHL", "DHL", "DHL", "DHL", None],  # Empty supplier cell gets parsed as None/NaN
    "Item ID": ["Freight-Standard", "Freight-Standard", "Freight-Standard", "Freight-Standard", "Freight-Standard", "Total"],
    "Date": ["2025-01-15", "2025-04-10", "2025-07-22", "2025-09-01", "2025-09-05", "2026-07-06"],
    "Quantity": [3000, 8000, 25000, 5000, 1, 41001],
    "Revenue": [45000, 120000, 375000, 75000, 15, 615015]
}
df_with_total = pd.DataFrame(data_with_total)
excel_with_total = io.BytesIO()
df_with_total.to_excel(excel_with_total, index=False)
excel_with_total.seek(0)

pdf_path = "/Users/akshon/rebate/POC-Rebate-AI-/data/Agreement DHL 2025 (1).pdf"
with open(pdf_path, "rb") as f:
    pdf_bytes = f.read()

client = TestClient(app)

def run_test(excel_buffer, label):
    # Re-seed clean database state (empty rules & sales, seeded suppliers)
    db = database.SessionLocal()
    try:
        db.query(models.SalesRecord).delete()
        db.query(models.RebateRule).delete()
        db.query(models.Supplier).delete()
        
        dhl = models.Supplier(id=1, name="DHL Malaysia", code="DHL")
        junho = models.Supplier(id=2, name="Jun Ho Corp", code="JUNHO")
        db.add_all([dhl, junho])
        db.commit()
    finally:
        db.close()

    print(f"\n{'=' * 60}")
    print(f"RUNNING PROCESS FOR: {label}")
    print(f"{'=' * 60}")

    response = client.post(
        "/api/process",
        files={
            "rules_file": ("Agreement DHL 2025 (1).pdf", pdf_bytes, "application/pdf"),
            "sales_file": ("sales_register.xlsx", excel_buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        }
    )
    
    print("\nAPI Response Summary:")
    print(json.dumps(response.json()["summary"], indent=2))
    print("\nAPI Response Calculations List:")
    print(json.dumps(response.json()["rebate_calculations"], indent=2))

# Run for both clean data and data with total row (both should now produce the correct DHL rebate due to our fixes)
run_test(excel_clean, "Clean 5 Rows (No Total Row)")
run_test(excel_with_total, "5 Rows + Total Row (Fixed via Parser Filtering)")
