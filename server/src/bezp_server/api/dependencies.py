from collections.abc import Generator

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from bezp_server.services.sql_anomaly_store import SqlAnomalyStore


def get_db(request: Request) -> Generator[Session, None, None]:
    database = request.app.state.database
    yield from database.session()


def get_anomaly_store(db: Session = Depends(get_db)) -> SqlAnomalyStore:
    return SqlAnomalyStore(db)
