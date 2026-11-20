-- Leave requests made in the assistant are collected step by step (app/agents/leave_request.py):
-- Atlas reads what it can from the message (type, dates, reason — typos allowed), asks for what's
-- missing, shows a summary, and only sends it to HR after a "yes". HR then approves or rejects it
-- on the HR Dashboard as before. One row per request being put together in a chat.
CREATE TABLE IF NOT EXISTS leave_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_id UUID,
    status TEXT NOT NULL DEFAULT 'awaiting_type' CHECK (status IN (
        'awaiting_type', 'awaiting_dates', 'awaiting_reason', 'awaiting_confirm',
        'submitted', 'cancelled'
    )),
    leave_type TEXT CHECK (leave_type IS NULL OR leave_type IN ('annual', 'sick', 'casual', 'parental')),
    start_date DATE,
    end_date DATE,
    -- Days asked for without a start day yet ("2 days leave"): used once the start is known.
    duration_days INT,
    reason TEXT,
    leave_request_id UUID REFERENCES leave_requests(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leave_drafts_run ON leave_drafts(run_id);
