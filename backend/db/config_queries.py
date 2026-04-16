"""Database queries for persistence configs."""

from __future__ import annotations

import json
from psycopg2.extensions import connection

CREATE_ADMIN_SETTINGS_TABLE = """
CREATE TABLE IF NOT EXISTS admin_settings (
    admin_id TEXT PRIMARY KEY,
    continuous_running BOOLEAN DEFAULT FALSE
);
"""

CREATE_CAMERA_CONFIGS_TABLE = """
CREATE TABLE IF NOT EXISTS camera_configs (
    camera_id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    config_json JSONB NOT NULL
);
"""

def create_config_tables(conn: connection) -> None:
    try:
        with conn.cursor() as cursor:
            cursor.execute(CREATE_ADMIN_SETTINGS_TABLE)
            cursor.execute(CREATE_CAMERA_CONFIGS_TABLE)
        conn.commit()
    except Exception as exc:
        from psycopg2 import errors
        if isinstance(exc, errors.InsufficientPrivilege):
            print("WARNING: insufficient privileges to create config tables.")
            return
        raise

def get_admin_settings(conn: connection, admin_id: str) -> dict | None:
    with conn.cursor() as cursor:
        cursor.execute("SELECT continuous_running FROM admin_settings WHERE admin_id = %s", (admin_id,))
        row = cursor.fetchone()
        if row:
            return {"admin_id": admin_id, "continuous_running": row[0]}
    return None

def upsert_admin_settings(conn: connection, admin_id: str, continuous_running: bool) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO admin_settings (admin_id, continuous_running)
            VALUES (%s, %s)
            ON CONFLICT (admin_id) DO UPDATE SET continuous_running = EXCLUDED.continuous_running
            """,
            (admin_id, continuous_running)
        )
    conn.commit()

def get_camera_configs(conn: connection, admin_id: str) -> list[dict]:
    with conn.cursor() as cursor:
        cursor.execute("SELECT camera_id, config_json FROM camera_configs WHERE admin_id = %s", (admin_id,))
        rows = cursor.fetchall()
        res = []
        for row in rows:
            cfg = row[1]
            if isinstance(cfg, str):
                cfg = json.loads(cfg)
            res.append({"camera_id": row[0], "config_json": cfg})
        return res

def upsert_camera_config(conn: connection, camera_id: str, admin_id: str, config_json: dict) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO camera_configs (camera_id, admin_id, config_json)
            VALUES (%s, %s, %s::jsonb)
            ON CONFLICT (camera_id) DO UPDATE SET 
                admin_id = EXCLUDED.admin_id,
                config_json = EXCLUDED.config_json
            """,
            (camera_id, admin_id, json.dumps(config_json))
        )
    conn.commit()

def delete_camera_config(conn: connection, camera_id: str) -> None:
    with conn.cursor() as cursor:
        cursor.execute("DELETE FROM camera_configs WHERE camera_id = %s", (camera_id,))
    conn.commit()
