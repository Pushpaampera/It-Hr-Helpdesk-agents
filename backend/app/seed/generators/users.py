"""Generates the 48 seed users: 1 admin, 3 HR, 6 managers, the rest employees across
Engineering, Sales, Finance, Support, Operations. Managers are linked via manager_id.

The 4 demo accounts (emma.employee / mark.manager / hannah.hr / alex.admin) are always
included first so their emails match docs/00_PROJECT_OVERVIEW.md exactly.
"""
import random

FIRST_NAMES = [
    "Liam", "Olivia", "Noah", "Emma", "Oliver", "Ava", "Elijah", "Sophia", "James", "Isabella",
    "Benjamin", "Mia", "Lucas", "Charlotte", "Henry", "Amelia", "Alexander", "Harper", "Mason",
    "Evelyn", "Michael", "Abigail", "Ethan", "Emily", "Daniel", "Elizabeth", "Jacob", "Sofia",
    "Logan", "Avery", "Jackson", "Ella", "Levi", "Scarlett", "Sebastian", "Grace", "Mateo",
    "Chloe", "Jack", "Victoria", "Owen", "Riley", "Theodore", "Aria", "Aiden", "Lily", "Samuel",
    "Zoey",
]
LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez",
    "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor",
    "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez",
    "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright",
    "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams", "Nelson", "Baker", "Hall",
    "Rivera", "Campbell", "Mitchell", "Carter",
]

DEPARTMENTS = ["Engineering", "Sales", "Finance", "Support", "Operations"]


def generate_users(seed: int = 42) -> list[dict]:
    rng = random.Random(seed)
    users: list[dict] = []

    users.append({
        "name": "Emma Employee", "email": "emma.employee@acme.test", "role": "employee",
        "department": "Engineering", "title": "Software Engineer", "manager_email": "mark.manager@acme.test",
    })
    users.append({
        "name": "Mark Manager", "email": "mark.manager@acme.test", "role": "manager",
        "department": "Engineering", "title": "Engineering Manager", "manager_email": None,
    })
    users.append({
        "name": "Hannah HR", "email": "hannah.hr@acme.test", "role": "hr",
        "department": "Operations", "title": "HR Business Partner", "manager_email": None,
    })
    users.append({
        "name": "Alex Admin", "email": "alex.admin@acme.test", "role": "admin",
        "department": "Operations", "title": "IT Platform Administrator", "manager_email": None,
    })

    # 2 more HR (total 3)
    hr_titles = ["HR Generalist", "HR Operations Lead"]
    for i, title in enumerate(hr_titles):
        fn, ln = rng.choice(FIRST_NAMES), rng.choice(LAST_NAMES)
        users.append({
            "name": f"{fn} {ln}", "email": f"{fn.lower()}.{ln.lower()}.hr{i}@acme.test",
            "role": "hr", "department": "Operations", "title": title, "manager_email": None,
        })

    # 5 more managers (total 6), one per department (Engineering already has Mark)
    manager_depts = ["Sales", "Finance", "Support", "Operations", "Engineering"]
    manager_emails_by_dept: dict[str, str] = {"Engineering": "mark.manager@acme.test"}
    for i, dept in enumerate(manager_depts):
        fn, ln = rng.choice(FIRST_NAMES), rng.choice(LAST_NAMES)
        email = f"{fn.lower()}.{ln.lower()}.mgr{i}@acme.test"
        users.append({
            "name": f"{fn} {ln}", "email": email, "role": "manager",
            "department": dept, "title": f"{dept} Manager", "manager_email": None,
        })
        manager_emails_by_dept.setdefault(dept, email)

    # Remaining employees up to 48 total (currently 4 + 2 + 5 = 11, need 37 more)
    used_emails = {u["email"] for u in users}
    target_total = 48
    remaining = target_total - len(users)
    titles_by_dept = {
        "Engineering": ["Software Engineer", "QA Engineer", "DevOps Engineer", "Engineering Intern"],
        "Sales": ["Account Executive", "Sales Development Rep", "Sales Manager"],
        "Finance": ["Financial Analyst", "Accounts Payable Specialist", "Finance Associate"],
        "Support": ["Support Engineer", "Customer Success Associate", "Support Lead"],
        "Operations": ["Operations Associate", "Facilities Coordinator", "Office Manager"],
    }
    for i in range(remaining):
        dept = DEPARTMENTS[i % len(DEPARTMENTS)]
        fn, ln = rng.choice(FIRST_NAMES), rng.choice(LAST_NAMES)
        email = f"{fn.lower()}.{ln.lower()}{i}@acme.test"
        while email in used_emails:
            fn, ln = rng.choice(FIRST_NAMES), rng.choice(LAST_NAMES)
            email = f"{fn.lower()}.{ln.lower()}{i}@acme.test"
        used_emails.add(email)
        title = rng.choice(titles_by_dept[dept])
        users.append({
            "name": f"{fn} {ln}", "email": email, "role": "employee",
            "department": dept, "title": title, "manager_email": manager_emails_by_dept.get(dept),
        })

    return users
