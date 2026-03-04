"""User registration and authentication backed by PostgreSQL."""

from __future__ import annotations

from psycopg2 import errors
from psycopg2.extensions import connection
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _normalize_password(password: str) -> str:
    """
    bcrypt supports only 72 bytes.
    Truncate safely to avoid runtime errors.
    """
    return password.encode("utf-8")[:72].decode("utf-8", errors="ignore")


def register_user(conn: connection, username: str, password: str, role: str) -> dict:
    """Create a new user with hashed password."""
    password = _normalize_password(password)
    password_hash = pwd_context.hash(password)

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO users (username, password_hash, role)
                VALUES (%s, %s, %s)
                RETURNING id, username, role, created_at
                """,
                (username.strip(), password_hash, role.strip()),
            )
            row = cursor.fetchone()
        conn.commit()
    except errors.UniqueViolation as exc:
        conn.rollback()
        raise ValueError("Username already exists") from exc

    return {
        "id": row[0],
        "username": row[1],
        "role": row[2],
        "created_at": row[3].isoformat() if row[3] else None,
    }


def authenticate_user(conn: connection, username: str, password: str) -> dict | None:
    """Validate credentials and return user info on success."""
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, username, password_hash, role, created_at
            FROM users
            WHERE username = %s
            LIMIT 1
            """,
            (username.strip(),),
        )
        row = cursor.fetchone()

    if row is None:
        return None

    password = _normalize_password(password)

    if not pwd_context.verify(password, row[2]):
        return None

    return {
        "id": row[0],
        "username": row[1],
        "role": row[3],
        "created_at": row[4].isoformat() if row[4] else None,
    }