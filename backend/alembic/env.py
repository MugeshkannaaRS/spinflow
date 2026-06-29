import asyncio
from logging.config import fileConfig

from sqlalchemy import pool, create_engine
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

from app.core.config import settings
from app.db.base import Base
from app.models import *  # noqa: F401, F403

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _get_sync_url() -> str:
    """
    Convert asyncpg URL to psycopg2 URL for sync migrations.
    Supabase pooler port 5432 = transaction mode; use port 6543 (session mode)
    so Alembic advisory locks work.
    """
    url = settings.DATABASE_URL
    # asyncpg → psycopg2
    url = url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    # strip query params (ssl=require etc.) — psycopg2 uses sslmode kwarg
    url = url.split("?")[0]
    # switch to session-mode pooler port
    url = url.replace(
        "pooler.supabase.com:5432", "pooler.supabase.com:6543"
    )
    return url


def run_migrations_offline() -> None:
    url = _get_sync_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Use synchronous psycopg2 engine for migrations — avoids pgbouncer
    prepared-statement conflicts that asyncpg triggers."""
    sync_url = _get_sync_url()
    connectable = create_engine(
        sync_url,
        poolclass=pool.NullPool,
        connect_args={"sslmode": "require"},
    )
    with connectable.connect() as connection:
        do_run_migrations(connection)
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
