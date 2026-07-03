import os
import pandas as pd

def generate_sample_data():
    # Make sure 'data' folder exists
    os.makedirs("../data", exist_ok=True)

    # 1. Create a transaction register that will trigger the active rebate rules
    # - DHL (Volume-based, tier 2): 8,400 units, $42,000 revenue
    # - JUNHO (Revenue-based, tier 2): 15,000 units, $150,000 revenue
    data = [
        {"Supplier Code": "DHL", "Item ID": "L-001", "Date": "2025-01-10", "Quantity": 2000, "Revenue": 10000},
        {"Supplier Code": "DHL", "Item ID": "L-002", "Date": "2025-03-15", "Quantity": 3400, "Revenue": 17000},
        {"Supplier Code": "DHL", "Item ID": "L-003", "Date": "2025-06-20", "Quantity": 3000, "Revenue": 15000},
        
        {"Supplier Code": "JUNHO", "Item ID": "J-101", "Date": "2025-02-05", "Quantity": 5000, "Revenue": 50000},
        {"Supplier Code": "JUNHO", "Item ID": "J-102", "Date": "2025-04-12", "Quantity": 6000, "Revenue": 60000},
        {"Supplier Code": "JUNHO", "Item ID": "J-103", "Date": "2025-07-18", "Quantity": 4000, "Revenue": 40000},
    ]

    df = pd.DataFrame(data)
    excel_path = "../data/Rebate Sample 2025 Sales Register.xlsx"
    df.to_excel(excel_path, index=False)
    print(f"Generated sample Excel: {excel_path}")

    # 2. Create placeholder mock PDF contract files in the data directory
    # Note: Our ocr.py uses the filename to determine which mock text to return if
    # the pdf is scanned or empty.
    pdf1_path = "../data/Agreement DHL 2025 (1).pdf"
    pdf2_path = "../data/SG_Jun Ho 2025 (1).pdf"

    with open(pdf1_path, "w") as f:
        f.write("%PDF-1.4 mock text for DHL Malaysia volume-based logistics agreement 2025")
    
    with open(pdf2_path, "w") as f:
        f.write("%PDF-1.4 mock text for Jun Ho Corp revenue-based commercial rebate 2025")

    print(f"Created PDF placeholders: {pdf1_path}, {pdf2_path}")

if __name__ == "__main__":
    generate_sample_data()
