-- Confidential HR cases: complaints, colleague conflicts, harassment, discrimination, personal
-- and wellbeing matters. Visible ONLY to the employee who raised the case and to users with the
-- `hr` role — never to managers or admins (enforced in app/routers/hr_cases.py). Case content is
-- deliberately never copied into audit_log, agent_runs, agent_events or chat messages, because
-- admins and managers can read those; the case's own message thread is its history.

CREATE TABLE IF NOT EXISTS hr_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number TEXT NOT NULL UNIQUE,
    reporter_id UUID NOT NULL REFERENCES users(id),
    -- When true, HR sees "Anonymous employee" instead of the reporter's name/email.
    anonymous BOOLEAN NOT NULL DEFAULT false,
    category TEXT NOT NULL CHECK (category IN (
        'harassment', 'discrimination', 'colleague_conflict', 'manager_concern',
        'misconduct', 'personal_wellbeing', 'safety', 'other'
    )),
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    people_involved TEXT,
    incident_date DATE,
    urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal', 'urgent')),
    preferred_contact TEXT NOT NULL DEFAULT 'portal' CHECK (preferred_contact IN ('portal', 'email', 'phone', 'in_person')),
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
        'received', 'in_review', 'waiting_on_employee', 'resolved', 'closed'
    )),
    assigned_hr_id UUID REFERENCES users(id),
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
CREATE SEQUENCE IF NOT EXISTS hr_case_number_seq START 1;
CREATE INDEX IF NOT EXISTS idx_hr_cases_reporter ON hr_cases(reporter_id);
CREATE INDEX IF NOT EXISTS idx_hr_cases_status ON hr_cases(status);

-- The private conversation between the employee and HR on one case, plus 'system' entries for
-- status changes (the case's own audit trail).
CREATE TABLE IF NOT EXISTS hr_case_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES hr_cases(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id),
    author_role TEXT NOT NULL CHECK (author_role IN ('employee', 'hr', 'system')),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_case_messages_case ON hr_case_messages(case_id);
