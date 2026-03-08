import sqlite3, json
import os
db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "monitor.db")
db = sqlite3.connect(db_path)
db.row_factory = sqlite3.Row
c = db.execute("SELECT * FROM tasks WHERE keyword='여자 방광염 병원'")
print(json.dumps([dict(r) for r in c.fetchall()], ensure_ascii=False, indent=2))
