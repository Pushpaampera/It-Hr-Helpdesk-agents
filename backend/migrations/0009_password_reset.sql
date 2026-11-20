-- Self-service password reset in the assistant, verified by a code sent to the person's email.
--
--   1. Atlas explains the steps and asks before doing anything.
--   2. A 6-digit code goes to the person's registered email (never a phone). It's valid for
--      10 minutes; only a hash of it is stored.
--   3. Right code -> a temporary password, valid 15 minutes, that must be changed at the next
--      sign-in. 3 wrong codes -> the reset is blocked and Tess opens an IT ticket; self-service
--      stays blocked until IT support deals with that ticket.

-- 1. Temporary passwords -----------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password_expires_at TIMESTAMPTZ;

-- 2. One row per reset attempt in the chat ------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_id UUID,
    status TEXT NOT NULL DEFAULT 'awaiting_consent',
    code_hash TEXT,
    code_sent_at TIMESTAMPTZ,
    code_expires_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    resends INT NOT NULL DEFAULT 0,
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT password_resets_status_check CHECK (status IN (
        'awaiting_consent',  -- steps explained, waiting for "yes"
        'awaiting_code',     -- code emailed, waiting for it to be typed in
        'completed',         -- right code: temporary password issued
        'declined',          -- the person said no
        'cancelled',         -- stopped part-way (typed "cancel" or moved on to another question)
        'email_failed',      -- the code email couldn't be sent
        'blocked',           -- 3 wrong codes: self-service blocked, IT ticket opened
        'unblocked'          -- IT support dealt with the blocked reset
    ))
);
CREATE INDEX IF NOT EXISTS idx_password_resets_run ON password_resets(run_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id, created_at DESC);
