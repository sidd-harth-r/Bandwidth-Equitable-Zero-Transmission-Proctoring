"""create anomaly events baseline

Revision ID: 20260508_0001
Revises: 
Create Date: 2026-05-08 00:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260508_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")
    op.create_table(
        "anomaly_events",
        sa.Column("event_id", sa.String(length=64), nullable=False),
        sa.Column("session_id", sa.String(length=128), nullable=False),
        sa.Column("student_id", sa.String(length=128), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("channel_scores", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("agreement_index", sa.Float(), nullable=False),
        sa.Column("weighted_score", sa.Float(), nullable=False),
        sa.Column("tier", sa.String(length=32), nullable=False),
        sa.Column("gear", sa.String(length=32), nullable=False),
        sa.Column("event_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.PrimaryKeyConstraint("event_id"),
    )
    op.create_index("ix_anomaly_events_session_id", "anomaly_events", ["session_id"], unique=False)
    op.create_index("ix_anomaly_events_student_id", "anomaly_events", ["student_id"], unique=False)
    op.create_index(
        "ix_anomaly_events_session_received",
        "anomaly_events",
        ["session_id", "received_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_anomaly_events_session_received", table_name="anomaly_events")
    op.drop_index("ix_anomaly_events_student_id", table_name="anomaly_events")
    op.drop_index("ix_anomaly_events_session_id", table_name="anomaly_events")
    op.drop_table("anomaly_events")
