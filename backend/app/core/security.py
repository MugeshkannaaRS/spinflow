from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from jose import jwt, JWTError
import bcrypt
from app.core.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
        "iss": settings.APP_NAME,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "refresh",
        "iss": settings.APP_NAME,
    }
    return jwt.encode(payload, settings.REFRESH_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str, use_refresh_secret: bool = False) -> Optional[dict]:
    secret = settings.REFRESH_SECRET_KEY if use_refresh_secret else settings.SECRET_KEY
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "iat", "iss"]},
            issuer=settings.APP_NAME,
        )
        return payload
    except JWTError:
        return None


def verify_and_refresh(refresh_token: str) -> Optional[Tuple[str, str, dict]]:
    payload = decode_token(refresh_token, use_refresh_secret=True)
    if payload is None or payload.get("type") != "refresh":
        return None
    user_id = payload.get("sub")
    role = payload.get("role")
    if not user_id or not role:
        return None
    new_access = create_access_token(user_id, role)
    new_refresh = create_refresh_token(user_id, role)
    return new_access, new_refresh, {"user_id": user_id, "role": role}
