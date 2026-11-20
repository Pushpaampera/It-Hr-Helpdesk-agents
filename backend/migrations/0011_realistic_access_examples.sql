-- Employees don't ask for Finance System access; the access-request evaluation question now uses
-- a tool an employee really requests (seed/generators/golden.py has the same change).
UPDATE golden_questions
   SET question = 'I need access to Jira',
       expected_answer = 'Requests access, pauses for an admin''s approval'
 WHERE question = 'I need access to the Finance system';

UPDATE golden_questions
   SET expected_answer = 'Requests access, pauses for an admin''s approval'
 WHERE expected_answer IN ('Requests access, pauses for IT support approval', 'Requests access, pauses for manager approval');
