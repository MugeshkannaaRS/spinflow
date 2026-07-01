"""Generate baseline SQL — uses SQLAlchemy's DDL compiler for PostgreSQL.
Output: executable SQL statements.
Usage: cd backend && python -m scripts.generate_baseline
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.base import Base
from app.models import *  # noqa: F401, F403
from sqlalchemy import create_mock_engine
from sqlalchemy.dialects.postgresql import dialect as PGDialect

statements = []

def record_sql(sql, *args, **kwargs):
    compiled = str(sql.compile(dialect=PGDialect(), compile_kwargs={"literal_binds": True}))
    if compiled.strip():
        statements.append(compiled.rstrip()) 

engine = create_mock_engine("postgresql://", executor=record_sql)

# Create all tables
Base.metadata.create_all(engine)

# Collect all unique table names in creation order
table_names = [t.name for t in Base.metadata.sorted_tables]

# Print as raw SQL migration
print('"""initial_schema — full baseline (auto-generated)')
print('')
print('Revision ID: 001')
print('Revises:')
print('Create Date: 2026-06-03')
print('"""')
print('')
print('from typing import Sequence, Union')
print('from alembic import op')
print('')
print('')
print('revision: str = "001"')
print('down_revision: Union[str, None] = None')
print('branch_labels: Union[str, Sequence[str], None] = None')
print('depends_on: Union[str, Sequence[str], None] = None')
print('')
print('')
print('def upgrade() -> None:')

for s in statements:
    escaped = s.replace("\\\\", "\\\\\\\\")
    print(f'''    op.execute(\"\"\"{s}\"\"\")''')

print('')
print('')
print('def downgrade() -> None:')
for name in reversed(table_names):
    print(f'    op.execute("""DROP TABLE IF EXISTS {name} CASCADE""")')
