"""background research: run events, source library, cancellation and heartbeat

Revision ID: 0007
Revises: 0006
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_runs", sa.Column("cancel_requested", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("agent_runs", sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "agent_run_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("event", sa.String(20), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("run_id", "seq", name="uq_agent_run_events_run_seq"),
    )
    op.create_index("ix_agent_run_events_run_id", "agent_run_events", ["run_id"])
    op.create_table(
        "research_sources",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("n", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("url", sa.String(2000), nullable=True),
        sa.Column("domain", sa.String(255), nullable=True),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("document_id", sa.String(36), nullable=True),
        sa.Column("knowledge_base_id", sa.String(36), nullable=True),
        sa.Column("chunk_id", sa.String(36), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cited", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("run_id", "n", name="uq_research_sources_run_n"),
    )
    op.create_index("ix_research_sources_run_id", "research_sources", ["run_id"])
    op.create_index("ix_research_sources_user_id_created_at", "research_sources", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_table("research_sources")
    op.drop_table("agent_run_events")
    op.drop_column("agent_runs", "heartbeat_at")
    op.drop_column("agent_runs", "cancel_requested")
