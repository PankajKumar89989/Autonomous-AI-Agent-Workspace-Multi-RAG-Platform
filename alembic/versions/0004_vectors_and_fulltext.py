"""local vectors, embedding model, full-text index

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "local_vectors",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("namespace", sa.String(100), nullable=False),
        sa.Column("embedding", postgresql.ARRAY(sa.Float()), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_local_vectors_namespace", "local_vectors", ["namespace"])
    op.add_column("documents", sa.Column("embedding_model", sa.String(100), nullable=True))
    op.create_index(
        "ix_document_chunks_content_fts",
        "document_chunks",
        [sa.text("to_tsvector('english', content)")],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_index("ix_document_chunks_content_fts", table_name="document_chunks")
    op.drop_column("documents", "embedding_model")
    op.drop_table("local_vectors")
