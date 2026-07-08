from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
import os

# Reads DATABASE_URL from environment variable.
# - Locally defaults to SQLite.
# - On Render/Railway, set DATABASE_URL to your PostgreSQL connection string
#   e.g. postgresql://user:password@host:5432/dbname
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sales_condition_poc.db")

# SQLAlchemy requires postgresql:// not postgres:// (Render uses the old format)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

is_sqlite = DATABASE_URL.startswith("sqlite")

# connect_args only needed for SQLite (multi-threading safe mode)
connect_args = {"check_same_thread": False} if is_sqlite else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)

# Enforce foreign key constraints — SQLite only
if is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
