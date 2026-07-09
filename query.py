import sqlite3
import json
conn = sqlite3.connect('backend/sales_condition_poc.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()
cur.execute("SELECT name, target, rate, tiers_json FROM rebate_rules WHERE supplier_id = 6")
for row in cur:
    print(dict(row))
