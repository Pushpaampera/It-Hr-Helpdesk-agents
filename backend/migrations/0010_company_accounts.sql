-- Password help for the person's COMPANY accounts, not just the HelpDesk sign-in.
--
-- Accounts (app/mock_apis/company_accounts.py):
--   windows    Windows / VPN login: the company sign-in, which is also the HelpDesk sign-in, so
--              its password lives in users.password_hash (migration 0009's columns).
--   email      Email (Outlook)
--   payroll    Payroll portal
--   hr_portal  HR portal
-- The last three live here. Rows are created on first use with an unknown random password (the
-- person "already has" an account), so there is nothing to seed.

-- Where the reset code goes when the forgotten password is the work EMAIL one (a code sent to
-- that locked mailbox couldn't be read).
ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_email TEXT;

CREATE TABLE IF NOT EXISTS company_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    system TEXT NOT NULL CHECK (system IN ('email', 'payroll', 'hr_portal')),
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    must_change_password BOOLEAN NOT NULL DEFAULT false,
    temp_password_expires_at TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, system)
);

-- Which account a reset is for, and where its code was sent ('work' or 'personal' email).
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS system TEXT NOT NULL DEFAULT 'windows';
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS code_sent_to TEXT;
ALTER TABLE password_resets DROP CONSTRAINT IF EXISTS password_resets_system_check;
ALTER TABLE password_resets ADD CONSTRAINT password_resets_system_check
    CHECK (system IN ('windows', 'email', 'payroll', 'hr_portal'));

-- New step: "which password did you forget?" when the message doesn't say.
ALTER TABLE password_resets DROP CONSTRAINT IF EXISTS password_resets_status_check;
ALTER TABLE password_resets ADD CONSTRAINT password_resets_status_check CHECK (status IN (
    'awaiting_system', 'awaiting_consent', 'awaiting_code', 'completed', 'declined', 'cancelled',
    'email_failed', 'no_recovery_email', 'blocked', 'unblocked'
));
