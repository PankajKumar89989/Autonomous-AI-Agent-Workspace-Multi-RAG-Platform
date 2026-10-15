"""custom agents

Revision ID: 0008
Revises: 0007
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("instructions", sa.Text(), nullable=False, server_default=""),
        sa.Column("model", sa.String(60), nullable=True),
        sa.Column("temperature", sa.Float(), nullable=False, server_default="0.2"),
        sa.Column("knowledge_base_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("tools", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("research_mode", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("max_steps", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("response_style", sa.String(10), nullable=False, server_default="balanced"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "name", name="uq_agents_user_name"),
    )
    op.create_index("ix_agents_user_id", "agents", ["user_id"])
    op.add_column("conversations", sa.Column("agent_id", sa.Uuid(), sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True))
    op.add_column("agent_runs", sa.Column("agent_id", sa.Uuid(), sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True))
    op.add_column("agent_runs", sa.Column("agent_name", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_runs", "agent_name")
    op.drop_column("agent_runs", "agent_id")
    op.drop_column("conversations", "agent_id")
    op.drop_table("agents")
