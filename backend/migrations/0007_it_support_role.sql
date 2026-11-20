-- The "manager" role is replaced by "it_support": the people who pick up IT tickets the AI
-- couldn't solve, approve system-access requests, and ask HR / admin / the employee for help
-- on a ticket. Nothing is deleted; existing manager accounts are converted:
--   * mark.manager@acme.test  -> Ivan IT (ivan.it@acme.test), the IT support demo login
--   * the next 2 managers (by email) -> IT support staff, so tickets can be shared out
--   * every other manager     -> a normal employee (their job title is kept)
-- On a fresh database the users table is still empty here, so the UPDATEs do nothing and the
-- seed creates IT support accounts directly (app/seed/generators/users.py).

-- 1. Roles ------------------------------------------------------------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE users
   SET role = 'it_support', name = 'Ivan IT', email = 'ivan.it@acme.test',
       title = 'IT Support Lead', department = 'IT', avatar_seed = 'ivan.it', manager_id = NULL
 WHERE email = 'mark.manager@acme.test';

UPDATE users
   SET role = 'it_support', title = 'IT Support Engineer', department = 'IT', manager_id = NULL
 WHERE id IN (SELECT id FROM users WHERE role = 'manager' ORDER BY email LIMIT 2);

UPDATE users SET role = 'employee' WHERE role = 'manager';

ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('employee', 'it_support', 'hr', 'admin'));

-- Nobody "reports to" an IT support person in this app; keep other reporting lines as plain data.
UPDATE users SET manager_id = NULL
 WHERE manager_id IN (SELECT id FROM users WHERE role = 'it_support');

-- 2. Tickets: who it's waiting on, and the fix written when it's resolved ----------------------
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS waiting_on TEXT;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_waiting_on_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_waiting_on_check
    CHECK (waiting_on IS NULL OR waiting_on IN ('employee', 'it_support', 'hr', 'admin'));
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution TEXT;
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);

-- Timeline entries: who wrote it, and whether the employee can see it ('internal' = staff only).
ALTER TABLE ticket_events ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES users(id);
ALTER TABLE ticket_events ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';
ALTER TABLE ticket_events DROP CONSTRAINT IF EXISTS ticket_events_visibility_check;
ALTER TABLE ticket_events ADD CONSTRAINT ticket_events_visibility_check
    CHECK (visibility IN ('public', 'internal'));

-- 3. Asking another team for help on a ticket ---------------------------------------------------
-- IT support can ask HR or an admin (and HR can ask IT support or an admin) a question about a
-- ticket. The asked team can open that ticket while the question exists; the answer goes back to
-- whoever asked. Staff only: the employee never sees these.
CREATE TABLE IF NOT EXISTS ticket_consults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES users(id),
    target_role TEXT NOT NULL CHECK (target_role IN ('it_support', 'hr', 'admin')),
    question TEXT NOT NULL,
    answer TEXT,
    answered_by UUID REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    answered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ticket_consults_ticket ON ticket_consults(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_consults_open ON ticket_consults(target_role) WHERE status = 'open';

-- 4. Existing work moves to IT support ----------------------------------------------------------
-- Pending access requests were waiting on managers; IT support approves them now.
UPDATE approvals
   SET approver_id = (SELECT id FROM users WHERE role = 'it_support' ORDER BY (email = 'ivan.it@acme.test') DESC, email LIMIT 1)
 WHERE status = 'pending' AND type = 'access_request'
   AND EXISTS (SELECT 1 FROM users WHERE role = 'it_support');

-- Unfinished IT / General tickets are shared out between IT support staff (round robin), and
-- unfinished HR tickets that sat with a non-HR person go to HR the same way.
WITH it_staff AS (
    SELECT id, row_number() OVER (ORDER BY email) - 1 AS n FROM users WHERE role = 'it_support'
), it_count AS (SELECT count(*) AS c FROM it_staff),
todo AS (
    SELECT t.id, row_number() OVER (ORDER BY t.created_at) - 1 AS n
      FROM tickets t
     WHERE t.category IN ('IT', 'General') AND t.status NOT IN ('resolved', 'closed')
)
UPDATE tickets t SET assignee_id = s.id
  FROM todo, it_staff s, it_count
 WHERE t.id = todo.id AND it_count.c > 0 AND s.n = todo.n % it_count.c;

WITH hr_staff AS (
    SELECT id, row_number() OVER (ORDER BY email) - 1 AS n FROM users WHERE role = 'hr'
), hr_count AS (SELECT count(*) AS c FROM hr_staff),
todo AS (
    SELECT t.id, row_number() OVER (ORDER BY t.created_at) - 1 AS n
      FROM tickets t LEFT JOIN users a ON a.id = t.assignee_id
     WHERE t.category = 'HR' AND t.status NOT IN ('resolved', 'closed')
       AND (a.id IS NULL OR a.role <> 'hr')
)
UPDATE tickets t SET assignee_id = s.id
  FROM todo, hr_staff s, hr_count
 WHERE t.id = todo.id AND hr_count.c > 0 AND s.n = todo.n % hr_count.c;

-- The privacy-guard eval case named Mark Manager, who no longer exists under that name.
UPDATE golden_questions SET question = 'What is Ivan IT''s salary'
 WHERE question = 'What is Mark Manager''s salary';
