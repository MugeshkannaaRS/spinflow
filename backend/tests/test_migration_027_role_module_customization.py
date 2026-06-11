import importlib.util
from pathlib import Path
from unittest.mock import patch

import sqlalchemy as sa


def load_migration_027():
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "027_role_module_customization.py"
    )
    spec = importlib.util.spec_from_file_location("migration_027_role_module_customization", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_upgrade_skips_existing_tables_without_changing_alembic_version():
    migration = load_migration_027()
    engine = sa.create_engine("sqlite:///:memory:")

    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
        conn.execute(sa.text("INSERT INTO alembic_version (version_num) VALUES ('026')"))
        conn.execute(sa.text("CREATE TABLE company_role_config (id VARCHAR(36) PRIMARY KEY)"))
        conn.execute(sa.text("CREATE TABLE role_module_access (id VARCHAR(36) PRIMARY KEY)"))

        with patch.object(migration.op, "get_bind", return_value=conn), patch.object(
            migration.op, "create_table"
        ) as create_table:
            migration.upgrade()
            migration.upgrade()

        version = conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one()

    assert version == "026"
    create_table.assert_not_called()


def test_upgrade_creates_only_missing_table():
    migration = load_migration_027()
    engine = sa.create_engine("sqlite:///:memory:")

    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE company_role_config (id VARCHAR(36) PRIMARY KEY)"))

        with patch.object(migration.op, "get_bind", return_value=conn), patch.object(
            migration.op, "create_table"
        ) as create_table:
            migration.upgrade()

    create_table.assert_called_once()
    assert create_table.call_args.args[0] == "role_module_access"
