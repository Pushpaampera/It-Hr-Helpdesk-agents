-- IT support only works IT tickets. Narrowing 0007:
--   * one IT support person (Ivan IT), so every IT ticket and its notifications reach that login;
--     the two other managers 0007 turned into IT support become normal employees again, with their
--     old department and job title back
--   * system-access requests are approved by an admin, not IT support
--   * on a ticket, IT support (and HR) can only ask an admin for help; nothing goes to HR
--   * pending access requests whose chat conversation is long gone are removed, and only a few
--     pending ones are kept as demo data (decided history is kept for the analytics)
-- IT tickets themselves are rebuilt as a small demo set by `poetry run reset-it-demo`
-- (app/seed/generators/it_demo.py), which `poetry run seed` also runs.

-- 1. Back to one IT support person --------------------------------------------------------------
UPDATE users
   SET role = 'employee', department = d.dept, title = d.dept || ' Manager'
  FROM (VALUES ('0', 'Sales'), ('1', 'Finance'), ('2', 'Support'), ('3', 'Operations'), ('4', 'Engineering')) AS d(n, dept)
 WHERE users.role = 'it_support' AND users.email <> 'ivan.it@acme.test'
   AND users.email LIKE '%.mgr' || d.n || '@acme.test';
-- Anyone else left in IT support besides Ivan (e.g. a fresh seed from 0007's generator).
UPDATE users SET role = 'employee' WHERE role = 'it_support' AND email <> 'ivan.it@acme.test';

-- 2. Access requests: admins decide them ----------------------------------------------------------
UPDATE approvals
   SET approver_id = (SELECT id FROM users WHERE role = 'admin' AND is_active ORDER BY email LIMIT 1)
 WHERE status = 'pending'
   AND EXISTS (SELECT 1 FROM users WHERE role = 'admin');

-- Pending requests raised from a chat that no longer exists can never resume; remove them.
DELETE FROM access_requests WHERE approval_id IN (SELECT id FROM approvals WHERE status = 'pending' AND run_id IS NOT NULL);
DELETE FROM approvals WHERE status = 'pending' AND run_id IS NOT NULL;
-- Keep the 4 newest pending demo requests.
WITH extra AS (
    SELECT id FROM approvals WHERE status = 'pending' ORDER BY created_at DESC OFFSET 4
)
DELETE FROM access_requests WHERE approval_id IN (SELECT id FROM extra);
WITH extra AS (
    SELECT id FROM approvals WHERE status = 'pending' ORDER BY created_at DESC OFFSET 4
)
DELETE FROM approvals WHERE id IN (SELECT id FROM extra);

-- IT support no longer handles approvals: clear those notifications from their bell.
DELETE FROM notifications
 WHERE kind = 'approval_pending' AND user_id IN (SELECT id FROM users WHERE role = 'it_support');

-- 3. Asking for help on a ticket: an admin only ---------------------------------------------------
DELETE FROM ticket_consults WHERE target_role <> 'admin';
ALTER TABLE ticket_consults DROP CONSTRAINT IF EXISTS ticket_consults_target_role_check;
ALTER TABLE ticket_consults ADD CONSTRAINT ticket_consults_target_role_check CHECK (target_role = 'admin');
UPDATE tickets SET waiting_on = NULL, status = 'in_progress' WHERE waiting_on IN ('hr', 'it_support');
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_waiting_on_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_waiting_on_check
    CHECK (waiting_on IS NULL OR waiting_on IN ('employee', 'admin'));
