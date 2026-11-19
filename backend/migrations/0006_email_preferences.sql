-- Each person chooses when notifications are also emailed. The bell (in-app) always gets them.
--   'important' (default): only things they're waiting on or that are urgent (decisions on their
--                          own requests, HR replies to their case, urgent new HR cases)
--   'all':                 every notification is also emailed
--   'off':                 never email, in-app only
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_notifications TEXT NOT NULL DEFAULT 'important';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_notifications_check;
ALTER TABLE users ADD CONSTRAINT users_email_notifications_check
    CHECK (email_notifications IN ('important', 'all', 'off'));

-- 'skipped': not emailed because of the person's email preference.
COMMENT ON COLUMN notifications.email_status IS
    'sent | failed | not_configured (no SMTP) | not_requested (in-app only) | skipped (email preference)';
