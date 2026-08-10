"""
Database configuration - SQLite with SQLAlchemy.
Authors: Muhammed Jalahej, Yazen Emino
"""

import logging
import os
from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)

# /dbdata is the Railway volume mount point prepared by the Dockerfile (see its
# "mkdir -p /dbdata" comment). Without an explicit DB_DIR/DATABASE_URL override, the
# previous fallback resolved to /data — a path nothing ever mounts a volume at — so
# every redeploy silently started from an empty container filesystem and wiped users.
_LOCAL_DEV_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
DB_DIR = os.getenv("DB_DIR") or ("/dbdata" if os.path.isdir("/dbdata") else _LOCAL_DEV_DIR)
os.makedirs(DB_DIR, exist_ok=True)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(DB_DIR, 'morelife.db')}")
logger.info("[DB] Using DB_DIR=%s (DATABASE_URL=%s)", DB_DIR, DATABASE_URL)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable foreign keys, WAL journal, and relaxed fsync for better SQLite performance."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")        # concurrent reads during writes
    cursor.execute("PRAGMA synchronous=NORMAL")      # safe with WAL; halves fsync overhead
    cursor.execute("PRAGMA cache_size=-8000")         # 8 MB page cache per connection
    cursor.execute("PRAGMA temp_store=MEMORY")        # temp tables in RAM
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency that yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
