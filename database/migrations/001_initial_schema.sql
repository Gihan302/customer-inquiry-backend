-- =====================================================================
-- 001_initial_schema.sql
-- Customer Inquiry Management System - initial schema
--
-- Relationship: one user (staff member) creates many inquiries.
--               users.id  1 ──< N  inquiries.created_by
--
-- Safe to run more than once (idempotent): every object is created only
-- if it does not already exist. Runs inside a single transaction, so a
-- failure leaves the database unchanged.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- ENUM types
-- PostgreSQL has no "CREATE TYPE IF NOT EXISTS", so we catch the
-- duplicate_object error instead.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    CREATE TYPE inquiry_status AS ENUM ('New', 'In Progress', 'Resolved');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE inquiry_visibility AS ENUM ('Public', 'Private');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- ---------------------------------------------------------------------
-- users: staff member accounts (no public registration)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL    PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT users_email_unique     UNIQUE (email),
    -- Emails are stored lower-case so "A@x.com" and "a@x.com" cannot both exist.
    CONSTRAINT users_email_lowercase  CHECK (email = LOWER(email)),
    CONSTRAINT users_name_not_blank   CHECK (LENGTH(BTRIM(name)) > 0),
    CONSTRAINT users_email_not_blank  CHECK (LENGTH(BTRIM(email)) > 0)
);

-- ---------------------------------------------------------------------
-- inquiries: customer inquiry records
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inquiries (
    id            BIGSERIAL          PRIMARY KEY,
    customer_name VARCHAR(150)       NOT NULL,
    contact_info  VARCHAR(150)       NOT NULL,
    subject       VARCHAR(200)       NOT NULL,
    description   TEXT               NOT NULL,
    status        inquiry_status     NOT NULL DEFAULT 'New',
    visibility    inquiry_visibility NOT NULL DEFAULT 'Public',
    -- ON DELETE RESTRICT: a staff account that owns inquiries cannot be
    -- deleted by accident, so no inquiry is ever left without an owner.
    created_by    BIGINT             NOT NULL
                  REFERENCES users (id) ON DELETE RESTRICT,
    created_at    TIMESTAMPTZ        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT inquiries_customer_name_not_blank CHECK (LENGTH(BTRIM(customer_name)) > 0),
    CONSTRAINT inquiries_contact_info_not_blank  CHECK (LENGTH(BTRIM(contact_info)) > 0),
    CONSTRAINT inquiries_subject_not_blank       CHECK (LENGTH(BTRIM(subject)) > 0),
    CONSTRAINT inquiries_description_not_blank   CHECK (LENGTH(BTRIM(description)) > 0),
    CONSTRAINT inquiries_updated_after_created   CHECK (updated_at >= created_at)
);

-- ---------------------------------------------------------------------
-- Indexes
-- The dashboard query is:
--   WHERE (visibility = 'Public' OR created_by = $userId)
--   ORDER BY created_at DESC
-- PostgreSQL can answer each side of the OR from its own index and
-- combine them (bitmap OR), so we index both, including created_at
-- to support newest-first ordering.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_inquiries_visibility_created_at
    ON inquiries (visibility, created_at DESC);

-- Also serves as the index for the created_by foreign key
-- (PostgreSQL does not index foreign key columns automatically).
CREATE INDEX IF NOT EXISTS idx_inquiries_created_by_created_at
    ON inquiries (created_by, created_at DESC);

-- Filtering by status (e.g. ?status=New).
CREATE INDEX IF NOT EXISTS idx_inquiries_status_created_at
    ON inquiries (status, created_at DESC);

-- Plain newest-first listing.
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at
    ON inquiries (created_at DESC);

COMMIT;
