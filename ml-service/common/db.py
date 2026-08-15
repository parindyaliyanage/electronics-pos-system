import psycopg2

from .config import DATABASE_URL


def get_connection():
    """Reads sales/installment data directly from Postgres — no API call needed."""
    return psycopg2.connect(DATABASE_URL)
