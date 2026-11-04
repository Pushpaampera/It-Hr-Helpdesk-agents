-- Adds the "awaiting_user_confirmation" run status for the chatbot's new confirm-before-ticket
-- gates (confirm_resolution / offer_ticket in app/agents/graph.py), alongside the existing
-- awaiting_approval status used by the manager-approval pause.
ALTER TABLE agent_runs DROP CONSTRAINT agent_runs_status_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_status_check
    CHECK (status IN ('running', 'resolved', 'escalated', 'awaiting_approval', 'awaiting_user_confirmation', 'failed'));
