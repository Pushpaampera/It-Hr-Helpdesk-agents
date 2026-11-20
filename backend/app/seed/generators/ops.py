"""Sample employee questions used by `poetry run simulate-feedback` (app/bandit/simulator.py) to
train the retrieval-strategy learner. The demo's people and history are hand-written in
seed/generators/demo_data.py instead of being generated randomly.
"""

IT_SAMPLE_QUERIES = [
    ("My laptop won't connect to the VPN, error 619", "619"),
    ("Getting VPN error 691 when I try to log in", "691"),
    ("VPN error 800, can't reach the gateway at all", "800"),
    ("My laptop battery drains so fast now", None),
    ("Laptop keeps overheating and the fan is so loud", None),
    ("Got a blue screen with a stop code this morning", None),
    ("Docking station won't show my external monitors", None),
    ("Wi-Fi keeps dropping every few minutes", None),
    ("Outlook isn't syncing new emails at all", None),
    ("I lost my phone with my MFA app on it", None),
    ("Locked out of my account after too many MFA tries", None),
    ("Printer keeps jamming on the same spot", None),
    ("Need a new software license approved", None),
    ("Forgot my password, can you reset it", None),
    ("Stuck in a login redirect loop with SSO", None),
    ("RDP connection refused to my office desktop", None),
    ("OneDrive isn't syncing my files", None),
    ("I think I clicked a phishing link", None),
    ("My laptop is super slow today, not sure why", None),
    ("Wi-Fi is really slow compared to usual", None),
]
HR_SAMPLE_QUERIES = [
    ("How many sick days do I have left", None),
    ("What is the parental leave policy", None),
    ("Apply for 3 days of casual leave next week", None),
    ("How does annual leave carry-forward work", None),
    ("When is the next pay date", None),
    ("My payslip looks wrong this month", None),
    ("How do I submit my tax declaration", None),
    ("What's covered under the wellness benefit", None),
    ("How do I book business travel", None),
    ("What's the work from home policy", None),
    ("When is my performance review", None),
    ("How do I add my spouse to health insurance", None),
    ("I need to change my bank account for salary", None),
    ("What happens if I miss the tax declaration deadline", None),
    ("Can I take half a day of casual leave", None),
]
OTHER_QUERIES = [
    "Can you help me with something",
    "I have a question",
    "Not sure who to ask about this",
]
