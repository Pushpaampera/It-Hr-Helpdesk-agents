"""The seed users: the 6 demo people (see seed/generators/demo_data.py, which owns the list).
Password Demo@1234 for all."""
from app.seed.generators.demo_data import CAST


def generate_users(seed: int = 42) -> list[dict]:
    return [{**p, "manager_email": None} for p in CAST.values()]
