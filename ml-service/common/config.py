import os

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://smartretail:smartretail@localhost:5432/smartretail",
)
