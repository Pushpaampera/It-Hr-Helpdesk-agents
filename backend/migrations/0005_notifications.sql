-- In-app notifications (the bell in the top bar) plus the matching email's delivery status, so
-- the site shows what was sent even when SMTP isn't configured. Each row belongs to one user and
-- is only ever returned to that user (app/routers/notifications.py).
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    -- 'sent' | 'failed' | 'not_configured' (no SMTP settings) | 'not_requested' (in-app only)
    email_status TEXT NOT NULL DEFAULT 'not_requested',
    email_error TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- Leave requests now go to HR for a decision (no longer auto-approved), so keep who decided and why.
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES users(id);
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS decision_comment TEXT;
