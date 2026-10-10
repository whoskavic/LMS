"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-10 15:13:39.383506

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_table(
        "categories",
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_categories")),
        sa.UniqueConstraint("name", name=op.f("uq_categories_name")),
        sa.UniqueConstraint("slug", name=op.f("uq_categories_slug")),
    )
    op.create_table(
        "users",
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("id_number", sa.String(length=20), nullable=True),
        sa.Column("department", sa.String(length=60), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("role IN ('admin', 'instructor', 'student')", name=op.f("ck_users_role")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_index(
        "uq_users_id_number",
        "users",
        ["id_number"],
        unique=True,
        postgresql_where=sa.text("id_number IS NOT NULL"),
    )
    op.create_table(
        "courses",
        sa.Column("instructor_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("slug", sa.String(length=220), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("thumbnail_url", sa.String(length=500), nullable=True),
        sa.Column("price", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("status", sa.String(length=20), server_default=sa.text("'draft'"), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("code", sa.String(length=12), nullable=True),
        sa.Column("semester", sa.String(length=40), nullable=True),
        sa.Column("duration_weeks", sa.Integer(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("max_students", sa.Integer(), nullable=True),
        sa.Column("color", sa.String(length=9), nullable=True),
        sa.Column("enrollment_open", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("issues_certificate", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('draft', 'pending', 'active', 'rejected', 'archived')", name=op.f("ck_courses_status")
        ),
        sa.CheckConstraint("price >= 0", name=op.f("ck_courses_price_non_negative")),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_courses_category_id_categories"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["instructor_id"], ["users.id"], name=op.f("fk_courses_instructor_id_users"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_courses")),
        sa.UniqueConstraint("slug", name=op.f("uq_courses_slug")),
    )
    op.create_index("ix_courses_category_id", "courses", ["category_id"], unique=False)
    op.create_index(
        "ix_courses_description_trgm",
        "courses",
        ["description"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"description": "gin_trgm_ops"},
    )
    op.create_index("ix_courses_instructor_id", "courses", ["instructor_id"], unique=False)
    op.create_index("ix_courses_status", "courses", ["status"], unique=False)
    op.create_index(
        "ix_courses_title_trgm",
        "courses",
        ["title"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"title": "gin_trgm_ops"},
    )
    op.create_index("uq_courses_code", "courses", ["code"], unique=True, postgresql_where=sa.text("code IS NOT NULL"))
    op.create_table(
        "course_status_logs",
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("from_status", sa.String(length=20), nullable=True),
        sa.Column("to_status", sa.String(length=20), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["users.id"], name=op.f("fk_course_status_logs_actor_id_users"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            name=op.f("fk_course_status_logs_course_id_courses"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_course_status_logs")),
    )
    op.create_index(
        "ix_course_status_logs_course_id_created_at",
        "course_status_logs",
        ["course_id", "created_at"],
        unique=False,
    )
    op.create_table(
        "enrollments",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default=sa.text("'active'"), nullable=False),
        sa.Column("progress_pct", sa.Numeric(precision=5, scale=2), server_default=sa.text("0"), nullable=False),
        sa.Column("final_score", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("grade_letter", sa.String(length=2), nullable=True),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("status IN ('active', 'completed')", name=op.f("ck_enrollments_status")),
        sa.CheckConstraint("final_score >= 0 AND final_score <= 100", name=op.f("ck_enrollments_final_score_range")),
        sa.CheckConstraint("progress_pct >= 0 AND progress_pct <= 100", name=op.f("ck_enrollments_progress_pct_range")),
        sa.ForeignKeyConstraint(
            ["course_id"], ["courses.id"], name=op.f("fk_enrollments_course_id_courses"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_enrollments_user_id_users"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_enrollments")),
        sa.UniqueConstraint("user_id", "course_id", name=op.f("uq_enrollments_user_id_course_id")),
    )
    op.create_table(
        "modules",
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("video_url", sa.String(length=500), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("minutes", sa.Integer(), nullable=True),
        sa.Column(
            "tasks",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("type IN ('lecture', 'practice')", name=op.f("ck_modules_type")),
        sa.ForeignKeyConstraint(
            ["course_id"], ["courses.id"], name=op.f("fk_modules_course_id_courses"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_modules")),
    )
    op.create_index("ix_modules_course_id_position", "modules", ["course_id", "position"], unique=False)
    op.create_table(
        "certificates",
        sa.Column("enrollment_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["enrollment_id"],
            ["enrollments.id"],
            name=op.f("fk_certificates_enrollment_id_enrollments"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_certificates")),
        sa.UniqueConstraint("code", name=op.f("uq_certificates_code")),
        sa.UniqueConstraint("enrollment_id", name=op.f("uq_certificates_enrollment_id")),
    )
    op.create_table(
        "module_progress",
        sa.Column("enrollment_id", sa.Uuid(), nullable=False),
        sa.Column("module_id", sa.Uuid(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["enrollment_id"],
            ["enrollments.id"],
            name=op.f("fk_module_progress_enrollment_id_enrollments"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["module_id"],
            ["modules.id"],
            name=op.f("fk_module_progress_module_id_modules"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_module_progress")),
        sa.UniqueConstraint("enrollment_id", "module_id", name=op.f("uq_module_progress_enrollment_id_module_id")),
    )
    op.create_table(
        "quizzes",
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("module_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("passing_score", sa.Integer(), server_default=sa.text("70"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("duration_minutes > 0", name=op.f("ck_quizzes_duration_positive")),
        sa.CheckConstraint("max_attempts >= 1", name=op.f("ck_quizzes_max_attempts_min")),
        sa.CheckConstraint("passing_score >= 0 AND passing_score <= 100", name=op.f("ck_quizzes_passing_score_range")),
        sa.ForeignKeyConstraint(
            ["course_id"], ["courses.id"], name=op.f("fk_quizzes_course_id_courses"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name=op.f("fk_quizzes_module_id_modules"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_quizzes")),
    )
    op.create_index(op.f("ix_quizzes_course_id"), "quizzes", ["course_id"], unique=False)
    op.create_table(
        "questions",
        sa.Column("quiz_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("points", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("points >= 1", name=op.f("ck_questions_points_min")),
        sa.ForeignKeyConstraint(
            ["quiz_id"], ["quizzes.id"], name=op.f("fk_questions_quiz_id_quizzes"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_questions")),
    )
    op.create_index("ix_questions_quiz_id_position", "questions", ["quiz_id", "position"], unique=False)
    op.create_table(
        "quiz_attempts",
        sa.Column("enrollment_id", sa.Uuid(), nullable=False),
        sa.Column("quiz_id", sa.Uuid(), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("score", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("status IN ('in_progress', 'submitted', 'expired')", name=op.f("ck_quiz_attempts_status")),
        sa.ForeignKeyConstraint(
            ["enrollment_id"],
            ["enrollments.id"],
            name=op.f("fk_quiz_attempts_enrollment_id_enrollments"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["quiz_id"], ["quizzes.id"], name=op.f("fk_quiz_attempts_quiz_id_quizzes"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_quiz_attempts")),
        sa.UniqueConstraint(
            "enrollment_id",
            "quiz_id",
            "attempt_number",
            name=op.f("uq_quiz_attempts_enrollment_id_quiz_id_attempt_number"),
        ),
    )
    op.create_index(
        "uq_quiz_attempts_one_in_progress",
        "quiz_attempts",
        ["enrollment_id", "quiz_id"],
        unique=True,
        postgresql_where=sa.text("status = 'in_progress'"),
    )
    op.create_table(
        "question_options",
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["questions.id"],
            name=op.f("fk_question_options_question_id_questions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_question_options")),
    )
    op.create_index(
        "ix_question_options_question_id_position",
        "question_options",
        ["question_id", "position"],
        unique=False,
    )
    op.create_index(
        "uq_question_options_one_correct",
        "question_options",
        ["question_id"],
        unique=True,
        postgresql_where=sa.text("is_correct = true"),
    )
    op.create_table(
        "attempt_answers",
        sa.Column("attempt_id", sa.Uuid(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("selected_option_id", sa.Uuid(), nullable=True),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["attempt_id"],
            ["quiz_attempts.id"],
            name=op.f("fk_attempt_answers_attempt_id_quiz_attempts"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["questions.id"],
            name=op.f("fk_attempt_answers_question_id_questions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["selected_option_id"],
            ["question_options.id"],
            name=op.f("fk_attempt_answers_selected_option_id_question_options"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_attempt_answers")),
        sa.UniqueConstraint("attempt_id", "question_id", name=op.f("uq_attempt_answers_attempt_id_question_id")),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("attempt_answers")
    op.drop_index(
        "uq_question_options_one_correct",
        table_name="question_options",
        postgresql_where=sa.text("is_correct = true"),
    )
    op.drop_index("ix_question_options_question_id_position", table_name="question_options")
    op.drop_table("question_options")
    op.drop_index(
        "uq_quiz_attempts_one_in_progress",
        table_name="quiz_attempts",
        postgresql_where=sa.text("status = 'in_progress'"),
    )
    op.drop_table("quiz_attempts")
    op.drop_index("ix_questions_quiz_id_position", table_name="questions")
    op.drop_table("questions")
    op.drop_index(op.f("ix_quizzes_course_id"), table_name="quizzes")
    op.drop_table("quizzes")
    op.drop_table("module_progress")
    op.drop_table("certificates")
    op.drop_index("ix_modules_course_id_position", table_name="modules")
    op.drop_table("modules")
    op.drop_table("enrollments")
    op.drop_index("ix_course_status_logs_course_id_created_at", table_name="course_status_logs")
    op.drop_table("course_status_logs")
    op.drop_index("uq_courses_code", table_name="courses", postgresql_where=sa.text("code IS NOT NULL"))
    op.drop_index(
        "ix_courses_title_trgm",
        table_name="courses",
        postgresql_using="gin",
        postgresql_ops={"title": "gin_trgm_ops"},
    )
    op.drop_index("ix_courses_status", table_name="courses")
    op.drop_index("ix_courses_instructor_id", table_name="courses")
    op.drop_index(
        "ix_courses_description_trgm",
        table_name="courses",
        postgresql_using="gin",
        postgresql_ops={"description": "gin_trgm_ops"},
    )
    op.drop_index("ix_courses_category_id", table_name="courses")
    op.drop_table("courses")
    op.drop_index("uq_users_id_number", table_name="users", postgresql_where=sa.text("id_number IS NOT NULL"))
    op.drop_table("users")
    op.drop_table("categories")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
