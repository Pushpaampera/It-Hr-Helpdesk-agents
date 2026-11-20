"""Seed content for the knowledge base: 60 IT runbook articles + 40 HR policy articles.

Each article is real, specific, checkable prose (not lorem ipsum) so the hybrid retriever has
something meaningful to rank. Bodies use '## Heading' markdown so app/rag/chunker.py can split
on sections.
"""


def it_articles() -> list[dict]:
    articles: list[dict] = []

    # ---- VPN (5) ----
    vpn_errors = [
        ("619", "The port used for the VPN connection is closed, usually because the connection "
                 "timed out or a firewall is blocking GRE/ESP traffic."),
        ("691", "Authentication failed — the username or password submitted to the VPN gateway "
                 "was rejected, or the account is locked."),
        ("800", "The VPN client could not establish a connection at all, typically because the "
                 "gateway is unreachable or the wrong server address was used."),
        ("868", "The remote VPN server's hostname could not be resolved, almost always a local "
                 "DNS problem on the laptop, not the VPN server itself."),
        ("789", "The L2TP connection attempt failed because the security layer could not be "
                 "negotiated — usually a pre-shared key mismatch after a password reset."),
    ]
    for code, meaning in vpn_errors:
        articles.append({
            "category": "VPN",
            "title": f"VPN Error {code}: causes and fix",
            "error_codes": [code, f"0x{int(code):04X}" if code.isdigit() else code],
            "source_name": "IT Runbook — Remote Access",
            "body": f"""## What error {code} means
{meaning}

## Quick fixes to try in order
1. Disconnect and reconnect the VPN client — transient network blips cause most {code} errors.
2. Confirm you're on a stable network (home Wi-Fi or wired). Public hotel/airport Wi-Fi often
   blocks the VPN ports needed and causes error {code}.
3. Restart the VPN client application completely (not just disconnect) — quit from the system
   tray, then relaunch.
4. If error {code} persists, restart your laptop. The VPN adapter can get stuck in a bad state
   after sleep/wake cycles.
5. Check that your password hasn't expired — an expired password can surface as a VPN
   connection error rather than a clear "password expired" message.

## When to escalate
If you've tried all the above and still see error {code} after a restart, this needs an IT
specialist — it may be a certificate issue on your account or a gateway-side problem affecting
multiple users.""",
        })

    # ---- Laptop (5) ----
    laptop_topics = [
        ("Laptop battery drains unusually fast", "battery", """## Common causes
A battery that drains in under 2 hours (from a full charge, under normal office use) is
usually caused by background sync processes, an outdated battery driver, or a battery that has
genuinely degraded after 2+ years of daily use.

## Steps to try
1. Check Settings > battery usage to see which app is consuming the most power — cloud sync
   tools and video conferencing apps are common culprits when left open.
2. Lower screen brightness and turn off keyboard backlighting when not needed.
3. Run Windows Update / macOS Software Update — battery management firmware updates ship this way.
4. If the battery is over 2 years old and health is reported below 80%, request a battery
   replacement through Atlas (the IT request tool) rather than continuing to work around it.""" ),
        ("Laptop overheating and fan running constantly", "overheating", """## Common causes
Dust buildup in the vents, running too many Chrome tabs/Electron apps at once, or a laptop used
on a soft surface (bed, lap, couch) that blocks the intake vents.

## Steps to try
1. Use the laptop on a hard, flat surface so the bottom vents aren't blocked.
2. Close unused browser tabs and apps — check Task Manager/Activity Monitor for the top CPU
   consumer.
3. Restart the laptop fully (not just sleep) at least once a week.
4. If overheating continues after these steps, the internal fan may need cleaning — this
   requires a hardware ticket, do not open the laptop yourself.""" ),
        ("Blue screen error with stop code on laptop", "bluescreen", """## What this means
A blue screen (Windows) with a stop code like `CRITICAL_PROCESS_DIED` or `IRQL_NOT_LESS_OR_EQUAL`
usually points to a driver conflict or a recent Windows Update that didn't finish cleanly.

## Steps to try
1. Note the exact stop code shown on the blue screen — IT will need it.
2. Let the laptop finish any pending restart/update fully before using it again.
3. Boot into Safe Mode (hold Shift while clicking Restart) and check if the laptop is stable
   there — if so, the issue is a driver or startup app, not hardware.
4. If the blue screen repeats more than twice in a day, stop using the laptop and open an IT
   ticket immediately — repeated blue screens can indicate failing memory or disk hardware.""" ),
        ("Docking station not detecting external monitors", "docking", """## Common causes
The docking station firmware is out of date, the USB-C cable isn't fully seated, or the laptop
was connected to the dock after waking from sleep (docks often need a fresh connection).

## Steps to try
1. Unplug the dock's USB-C cable from the laptop, wait 10 seconds, and reconnect.
2. Make sure external monitors are powered on and set to the correct input source.
3. Try a different USB-C port on the dock if available.
4. Restart the laptop with the dock already connected — some docks aren't detected mid-session.
5. If monitors still aren't detected after these steps, the dock itself may need replacing —
   open an IT ticket with the dock's asset tag (sticker on the underside).""" ),
        ("Laptop keyboard or trackpad not responding", "keyboard", """## Common causes
A stuck key, a driver crash, or (for external keyboards) a Bluetooth pairing drop.

## Steps to try
1. Restart the laptop — this resolves the majority of input driver crashes.
2. For a built-in trackpad: check Settings for an accidental "disable trackpad" toggle, which
   some people trigger by hotkey (Fn + trackpad icon key) without noticing.
3. For a Bluetooth keyboard/mouse: turn it off and on again, and re-pair if it doesn't reconnect
   automatically.
4. If specific physical keys are unresponsive (not a software issue), this is a hardware repair
   — open an IT ticket, do not attempt to pry keys off yourself.""" ),
    ]
    for title, slug, body in laptop_topics:
        articles.append({
            "category": "Laptop",
            "title": title,
            "error_codes": [],
            "source_name": "IT Runbook — Hardware",
            "body": body,
        })

    # ---- Wi-Fi (5) ----
    wifi_topics = [
        ("Can't connect to the office Wi-Fi", """## Steps to try
1. Confirm you're selecting the correct network name (SSID) — the office has two: the main
   corporate network and a slower guest network. Use the corporate one for work devices.
2. Forget the network on your laptop and reconnect, entering your credentials fresh.
3. Toggle Wi-Fi off and on from the laptop's settings.
4. If other people nearby are also failing to connect, this is likely a building-wide access
   point issue — check the IT status page before opening an individual ticket."""),
        ("Wi-Fi connects but drops every few minutes", """## Common causes
Too many devices on one access point, a laptop's power-saving setting turning the Wi-Fi
adapter off, or being at the edge of an access point's range (e.g. in a stairwell).

## Steps to try
1. Move closer to a known access point if you're in a low-signal area.
2. In power settings, disable "allow the computer to turn off this device to save power" for
   the Wi-Fi adapter.
3. Update the Wi-Fi driver via Windows Update / macOS Software Update.
4. If this happens consistently at the same desk, report the desk location — it may need a new
   access point nearby."""),
        ("Wi-Fi is very slow compared to usual", """## Steps to try
1. Run a speed test and note the result for your ticket.
2. Check how many devices you personally have connected (phone, laptop, tablet) — disconnect
   ones you're not using.
3. Avoid large downloads/video calls at the same time as a colleague on the same access point
   if possible.
4. If slowness is building-wide and affects multiple people, this is an infrastructure issue,
   not something your laptop settings can fix."""),
        ("Forgot office Wi-Fi password / credentials expired", """## What's happening
Office Wi-Fi uses your regular company login, which rotates when your password changes. If
you've recently reset your password, your laptop may still be trying the old one.

## Steps to try
1. Forget the saved Wi-Fi network on your laptop.
2. Reconnect and enter your current password.
3. If you're not sure your password is current, reset it via the password-reset flow before
   retrying Wi-Fi."""),
        ("Setting up guest Wi-Fi for a visitor", """## Steps
1. Ask the visitor's host (the employee they're meeting) to request a guest code through Atlas,
   the IT request tool.
2. Guest codes are valid for 24 hours and give internet-only access (no internal systems).
3. If a visitor needs longer-term access (e.g. a contractor for a week), that requires a formal
   access request with manager approval, not a guest code."""),
    ]
    for title, body in wifi_topics:
        articles.append({"category": "Wi-Fi", "title": title, "error_codes": [], "source_name": "IT Runbook — Network", "body": body})

    # ---- Email / Outlook (5) ----
    email_topics = [
        ("Outlook not syncing new emails", """## Steps to try
1. Check the status bar at the bottom of Outlook for a "disconnected" or "working offline"
   message — click to reconnect if offline mode is on.
2. Restart Outlook fully (quit, don't just minimize).
3. Check your internet connection with another app.
4. If only one folder isn't syncing, right-click it and choose "Sync this folder now".
5. If nothing syncs after a restart, your mailbox may be over quota — see the mailbox quota
   article."""),
        ("Outlook search isn't finding emails that exist", """## Common cause
Outlook's local search index can get out of date, especially after a large mailbox migration
or a laptop that was offline for a while.

## Steps to try
1. Rebuild the search index: Control Panel > Indexing Options > Advanced > Rebuild.
2. This can take several hours in the background — keep using Outlook normally while it runs.
3. If search is still broken after a full rebuild (check again the next day), open a ticket."""),
        ("Mailbox full / over quota warning", """## What this means
Each mailbox has a storage limit. Once you're over it, new mail may bounce back to the sender.

## Steps to try
1. Check File > Mailbox Settings for your current usage vs. limit.
2. Archive old large emails (especially ones with attachments) to a local .pst archive or
   delete ones you no longer need from Sent Items and Deleted Items.
3. Empty the Deleted Items folder — deleted mail still counts against quota until emptied.
4. If you've archived appropriately and are still near the limit due to genuine business need,
   request a quota increase through Atlas."""),
        ("Calendar meeting invites not showing up", """## Steps to try
1. Check your Calendar's "Other Calendars" / subscribed calendars — an invite may have landed
   in a calendar you're not currently viewing.
2. Confirm the organizer sent it to your correct, current email address.
3. Check your Junk/Clutter folder — some invite formats get miscategorized.
4. If invites from one specific person never arrive, ask them to resend; this can indicate a
   distribution list or alias issue worth reporting."""),
        ("Setting up an email signature across devices", """## Steps
1. In Outlook desktop: File > Options > Mail > Signatures, create and set as default for new
   messages and replies.
2. On mobile, signatures are set separately in the mobile app's Settings > Signature.
3. The company-standard signature template is available on the intranet Brand Hub page — use
   it rather than a custom one for consistency on external emails."""),
    ]
    for title, body in email_topics:
        articles.append({"category": "Email", "title": title, "error_codes": [], "source_name": "IT Runbook — Email", "body": body})

    # ---- MFA reset (5) ----
    mfa_topics = [
        ("Lost phone with the MFA authenticator app", """## Immediate steps
1. Report the lost device to IT immediately via Atlas (the "unlock account"/security tool) —
   don't wait, since a lost phone is also a security risk, not just an MFA inconvenience.
2. Use a backup MFA method if you set one up (backup codes, a secondary device) to log in while
   IT processes the reset.
3. IT will verify your identity (via your manager or a video call) before resetting MFA on a
   lost-device report — this takes a bit longer than a routine reset for your safety."""),
        ("Got a new phone, need to move MFA authenticator", """## Steps
1. Before wiping your old phone, open the authenticator app and note/export the account if the
   app supports backup/transfer (most do, via QR code or cloud backup).
2. If you still have the old phone and app installed, you can also just remove the old device
   and re-enroll the new one directly from the self-service security settings page.
3. If you no longer have access to the old device, request an MFA reset through the IT request
   tool — identity verification is required."""),
        ("MFA backup codes - where to find and use them", """## What they are
Backup codes are one-time-use codes generated when you first set up MFA, meant for exactly this
situation: no access to your authenticator device.

## Steps
1. Backup codes were shown once during MFA setup — if you saved them (recommended, to a
   password manager), use one now to log in.
2. After logging in with a backup code, go to Security Settings and generate a fresh set,
   since each code only works once.
3. If you never saved backup codes and have no device access, this requires an IT-assisted
   reset with identity verification."""),
        ("Locked out of account after too many MFA attempts", """## What's happening
After several failed MFA attempts, the account locks temporarily as a security measure.

## Steps
1. Wait 15 minutes — most lockouts clear automatically.
2. Make sure your authenticator app's clock is in sync (time drift causes codes to be rejected,
   which looks like "wrong code" even when you typed it correctly).
3. If still locked out after 15 minutes, Atlas can unlock the account directly — this is a
   fully automated self-service action, no approval needed."""),
        ("Setting up a hardware security key for MFA", """## Steps
1. Request a hardware key (YubiKey) through Atlas if your role requires one (Finance and Admin
   roles are issued one by default).
2. Register it at Security Settings > Add security key, and follow the browser prompt to tap
   the key.
3. Keep the authenticator app enrolled as a backup method in case the hardware key is
   misplaced."""),
    ]
    for title, body in mfa_topics:
        articles.append({"category": "MFA", "title": title, "error_codes": [], "source_name": "IT Runbook — Identity & Security", "body": body})

    # ---- Printer (5) ----
    printer_topics = [
        ("Printer not found / not appearing in the list", """## Steps to try
1. Confirm you're connected to the office Wi-Fi or wired network (printers aren't reachable
   from home/VPN).
2. Restart the print spooler service (Windows) or remove and re-add the printer (macOS:
   System Settings > Printers & Scanners).
3. Make sure the printer itself is powered on and shows a ready status on its own screen.
4. If a printer that used to work has disappeared for everyone on your floor, it's likely an
   infrastructure issue, not your laptop."""),
        ("Paper jam keeps reoccurring on the same printer", """## Steps
1. Open all the printer's access panels and check every roller, not just the obvious tray.
2. Don't force-pull jammed paper — pull slowly in the direction of normal paper travel to avoid
   tearing a piece off inside.
3. If jams recur more than twice in a week on the same printer, report it for a maintenance
   visit rather than continuing to clear jams manually — it likely needs new rollers."""),
        ("Installing a printer driver manually", """## Steps
1. Most office printers are already set up via auto-discovery — try adding by name/IP first
   before installing a driver manually.
2. If a specific driver is required (some label/receipt printers), download it only from the
   IT-approved software catalog in Atlas, never from a random website.
3. Restart after installing any printer driver."""),
        ("Setting up a personal wireless printer at a desk", """## Policy
Personal printers are discouraged on the corporate network for security reasons. If you have a
genuine business need (e.g. a label printer for shipping), request an exception through Atlas
with your manager's justification."""),
        ("Print quality is faded or streaky", """## Steps
1. Check the printer's own display for a low-toner/ink warning.
2. Run the built-in cleaning cycle from the printer's menu (not from your laptop).
3. If quality doesn't improve after a cleaning cycle, the toner/drum unit likely needs
   replacing — report it with the printer's asset tag."""),
    ]
    for title, body in printer_topics:
        articles.append({"category": "Printer", "title": title, "error_codes": [], "source_name": "IT Runbook — Peripherals", "body": body})

    # ---- Software install (5) ----
    software_topics = [
        ("Requesting a new software install", """## Steps
1. Check the IT-approved software catalog in Atlas first — many common tools can be
   self-installed instantly without approval.
2. For anything not in the catalog, submit a request with a business justification; your
   manager approves it before IT provisions a license."""),
        ("Software license expired / app stopped working", """## Steps
1. Check if this is a personal trial license vs. a company-managed one — personal trials aren't
   renewed by IT.
2. For company-managed software, license renewals are usually automatic; if the app suddenly
   stopped working, report it as it may indicate a billing or seat-count issue on IT's side."""),
        ("Install blocked by company policy", """## What's happening
Some software categories (torrent clients, unapproved remote-access tools, browser extensions
outside the approved list) are blocked by policy, not by a bug.

## Steps
If you have a genuine business need for a blocked tool, submit a request through Atlas
explaining the use case — a policy exception can be granted, but installing around the block is
against policy and will be flagged."""),
        ("Mac app won't open — \"unidentified developer\" warning", """## Steps
1. This happens for apps not notarized by Apple, which company policy requires for security.
2. Prefer installing the app from the IT-approved catalog, which is pre-vetted.
3. If you need an exception for a specific internal tool, open a ticket rather than bypassing
   Gatekeeper yourself."""),
        ("Uninstalling software you no longer need", """## Steps
1. Use the standard Add/Remove Programs (Windows) or drag-to-Trash (macOS) for most apps.
2. For IT-managed software, uninstalling locally doesn't release the license seat — also report
   it through Atlas so the license can be reassigned to someone else."""),
    ]
    for title, body in software_topics:
        articles.append({"category": "Software", "title": title, "error_codes": [], "source_name": "IT Runbook — Software", "body": body})

    # ---- Password policy (5) ----
    password_topics = [
        ("Resetting your password", """## Steps
1. Use the self-service reset link on the login page — this works any time, no ticket needed.
2. You'll verify identity via MFA, then set a new password.
3. If MFA is also unavailable, this requires an IT-assisted reset with manager verification."""),
        ("Password expiry policy", """## Policy
Passwords expire every 90 days. You'll see a warning banner starting 14 days before expiry.
Letting it fully expire doesn't lock your account, but you will be forced to reset at next
login."""),
        ("Password complexity requirements", """## Requirements
At least 12 characters, including a mix of uppercase, lowercase, a number, and a symbol. The
system also rejects your 5 most recently used passwords and any password found in known
breach databases."""),
        ("Why can't I use my personal password style/pattern?", """## Explanation
Passwords are checked against breach databases and common patterns (like a word plus a single
digit) are flagged even if they technically meet the complexity rule, because they're easy to
guess. Consider a passphrase of 4+ unrelated words instead — it's both easier to remember and
harder to crack."""),
        ("Shared account / generic login policy", """## Policy
Shared logins (e.g. a generic "support@" account used by multiple people) are not permitted for
security and audit reasons — every action must be traceable to one person. If your team thinks
it needs a shared account, discuss a proper service-account setup with IT instead."""),
    ]
    for title, body in password_topics:
        articles.append({"category": "Password Policy", "title": title, "error_codes": [], "source_name": "IT Runbook — Identity & Security", "body": body})

    # ---- SSO (5) ----
    sso_topics = [
        ("Stuck in a login redirect loop with SSO", """## Steps
1. Clear the browser's cookies for the login domain specifically (not a full cache wipe).
2. Try an incognito/private window — if it works there, a browser extension or stale cookie is
   the cause.
3. If the loop happens on every browser and device, this is likely a session/token issue on the
   identity provider side — open a ticket."""),
        ("SSO signs me into the wrong company tenant", """## Steps
1. This usually happens if you have a personal or another organization's account using the same
   email-like identifier cached in the browser.
2. Use "sign in with a different account" at the provider's prompt rather than the
   remembered one.
3. If the wrong tenant keeps being selected automatically, clear the identity provider's
   cookies specifically."""),
        ("SAML error when logging into a connected app", """## What this means
A SAML error means the identity provider and the app couldn't agree on your identity assertion
— often because the app's SSO configuration is outdated after a company domain change.

## Steps
Note the exact error text and open a ticket; this is not something end users can fix locally,
since it's a configuration link between two systems."""),
        ("Browser cache causing old SSO session to persist", """## Steps
1. Sign out explicitly from the app (not just close the tab).
2. Clear cookies for both the app's domain and the identity provider's domain.
3. Restart the browser before signing in again."""),
        ("Setting up SSO on the mobile app", """## Steps
1. Open the mobile app and choose "Sign in with company account" rather than entering an email
   and password directly.
2. You'll be redirected to the browser-based SSO flow and then back to the app automatically.
3. If redirected back to a blank screen, update the app to the latest version first."""),
    ]
    for title, body in sso_topics:
        articles.append({"category": "SSO", "title": title, "error_codes": [], "source_name": "IT Runbook — Identity & Security", "body": body})

    # ---- Remote desktop (5) ----
    rdp_topics = [
        ("RDP connection refused to office desktop", """## Steps
1. Confirm you're connected to the VPN first — RDP only works over VPN, never directly over the
   public internet.
2. Confirm the office desktop is actually powered on (ask someone in-office to check, or use
   Wake-on-LAN if enabled for your machine).
3. If VPN is connected and the desktop is on but RDP is still refused, the desktop may need a
   remote-access policy re-enabled — open a ticket with the desktop's asset tag."""),
        ("RDP session shows a black screen after connecting", """## Steps
1. Wait 15-20 seconds — a black screen right after connecting is often just the remote display
   initializing.
2. Try disconnecting and reconnecting once.
3. If black screen persists, it may be a graphics driver issue on the remote machine — someone
   in-office may need to restart it physically."""),
        ("RDP with multiple monitors isn't working correctly", """## Steps
1. In the RDP client's display settings, explicitly enable "use all my monitors for the remote
   session" before connecting.
2. Some RDP clients require this to be set before connecting, not adjustable mid-session.
3. If one monitor is a different resolution/orientation, try matching them temporarily to
   isolate whether that's the cause."""),
        ("RDP is very slow / laggy", """## Steps
1. Lower the RDP session's color depth and disable "desktop background"/visual effects in the
   client's experience settings.
2. Confirm your own internet connection is stable — RDP performance is very sensitive to your
   local upload bandwidth.
3. If slowness is new and nothing changed on your end, the remote desktop itself may be under
   load — report it."""),
        ("Using RDP and VPN together - order of operations", """## Steps
Always connect the VPN first, wait for it to fully establish, and only then open the RDP
client. Opening RDP before the VPN is fully connected is the most common cause of a failed
first attempt that then "mysteriously" works on the second try."""),
    ]
    for title, body in rdp_topics:
        articles.append({"category": "Remote Desktop", "title": title, "error_codes": [], "source_name": "IT Runbook — Remote Access", "body": body})

    # ---- Backup (5) ----
    backup_topics = [
        ("OneDrive / cloud sync not syncing files", """## Steps
1. Check the sync icon in the system tray/menu bar — a red exclamation mark means a sync error
   you can click into for detail.
2. Common fix: pause and resume syncing from that same icon's menu.
3. If specific files won't sync (not the whole app), check the filename for forbidden
   characters or an overly long path — both block individual file sync silently."""),
        ("How to recover a deleted or overwritten file", """## Steps
1. Check the cloud storage's own "recently deleted" or version history feature first — most
   recover in under a minute without a ticket.
2. For files edited and saved with unwanted changes, use "version history" to roll back to a
   previous save rather than recreating from scratch.
3. If the file is gone from both the Recycle Bin and version history, open a ticket promptly —
   deeper backups are retained for a limited window."""),
        ("\"Backup failed\" notification on laptop", """## Steps
1. Check available disk space on the laptop — backups commonly fail when the disk is nearly full.
2. Confirm the laptop was connected to Wi-Fi/power long enough for the scheduled backup window
   (usually overnight).
3. Trigger a manual backup from the backup app's menu to retest immediately rather than waiting
   for the next scheduled window."""),
        ("What's covered by the automatic laptop backup", """## Policy
Automatic backup covers your Documents, Desktop, and Pictures folders only. Anything saved
elsewhere (e.g. a custom folder on a secondary drive) is not included — move important files
into a covered folder, or request an exception for a specific additional path."""),
        ("Restoring a laptop from backup after a replacement", """## Steps
When you receive a replacement laptop, sign in and the backup/restore wizard runs
automatically on first setup, pulling your Documents/Desktop/Pictures back down. This can take
several hours depending on how much data you had — keep the laptop on power and connected to
Wi-Fi until it completes."""),
    ]
    for title, body in backup_topics:
        articles.append({"category": "Backup", "title": title, "error_codes": [], "source_name": "IT Runbook — Data Protection", "body": body})

    # ---- Security / phishing (5) ----
    security_topics = [
        ("How to report a phishing email", """## Steps
1. Don't click any links or open attachments in the suspicious email.
2. Use the "Report Phishing" button in the email client toolbar — this forwards it to the
   security team and removes it from your inbox automatically.
3. If the button isn't visible, forward the email as an attachment to the security reporting
   address found on the intranet Security page."""),
        ("I clicked a suspicious link — what now", """## Steps
1. Don't enter any credentials if a login page appeared after clicking — close the tab instead.
2. Report it immediately via the phishing report button, even if you're not sure it was
   malicious — false alarms are always welcome, delays are not.
3. If you did enter your password on a suspicious page, reset it immediately and report the
   incident — this is treated as a priority security response, not a routine ticket."""),
        ("Email looks like it's from a colleague but seems off", """## Signs of a spoofed sender
Urgent requests for gift cards or wire transfers, slightly misspelled domains (e.g. "@acme-hr.test"
instead of "@acme.test"), or a tone that doesn't match how that person normally writes.

## Steps
Verify through a separate channel (chat or phone, not by replying to the email) before acting
on any financial or credential request, and report the email regardless of the outcome."""),
        ("Laptop lost or stolen - what to do immediately", """## Steps
1. Report it to IT security immediately, any time of day — this isn't something to wait until
   Monday for.
2. IT will remotely lock and, if needed, wipe the device using mobile device management.
3. Also reset your password and review recent account activity once you're on another device,
   as a precaution."""),
        ("Ransomware warning signs to watch for", """## Signs
Files suddenly renamed with unusual extensions, a ransom note appearing as a text file or
desktop wallpaper change, or unusually slow disk activity with many files being rewritten at
once.

## Steps
Disconnect the laptop from Wi-Fi/network immediately (this limits spread) and report it to
security right away — do not attempt to pay any ransom note or follow its instructions."""),
    ]
    for title, body in security_topics:
        articles.append({"category": "Security", "title": title, "error_codes": [], "source_name": "IT Runbook — Security", "body": body})

    return articles


def hr_articles() -> list[dict]:
    articles: list[dict] = []

    def add(category: str, title: str, body: str):
        articles.append({"category": category, "title": title, "error_codes": [], "source_name": "HR Policy Handbook", "body": body})

    # Annual leave (3)
    add("Annual Leave", "Annual leave entitlement and accrual", """## Entitlement
Full-time employees accrue 24 days of annual leave per year, credited monthly (2 days/month).
Part-time employees accrue on a pro-rated basis matching their contracted hours.

## How to apply
Apply through the AI Assistant (for example "I want annual leave from 1 Dec to 3 Dec") at
least 5 working days before the first day of leave where possible. The assistant asks for
anything missing, shows a summary and sends it to HR once you say yes. HR approves or declines
it, and you get a notification and an email with the decision.""")
    add("Annual Leave", "Cancelling or changing approved annual leave", """## Steps
1. Tell the AI Assistant which leave request you want to cancel or change. If it can't do it
   for you, it raises a ticket so HR can update the request.
2. Cancellations more than 3 days before the start date are normally accepted straight away.
3. Changes within 3 days of the start date need HR's re-approval, since team coverage may
   already be arranged around your absence.""")
    add("Annual Leave", "Annual leave during probation period", """## Policy
Leave accrues from day one of employment, including during the probation period, but new
hires are asked to avoid taking leave in the first 4 weeks unless there's a pre-planned,
pre-approved reason, to allow time for onboarding.""")

    # Sick leave (3)
    add("Sick Leave", "Sick leave entitlement and reporting", """## Entitlement
12 days of paid sick leave per year. Sick leave does not need pre-approval — report your
absence to your manager by 9:30am on the day, then log it in the system when you're back.

## Self-certification vs. medical note
Up to 3 consecutive sick days can be self-certified (no note needed). 4 or more consecutive
days requires a doctor's note uploaded to the leave request.""")
    add("Sick Leave", "What counts as sick leave vs. a medical appointment", """## Guidance
A routine medical/dental appointment that doesn't require a full day should usually be logged
as a few hours of flexible time rather than a full sick day — check with your manager. Full-day
illness, recovery after a procedure, or mental health days are all appropriately logged as sick
leave.""")
    add("Sick Leave", "Extended sick leave and returning to work", """## Policy
For sick leave extending beyond 2 weeks, HR will reach out directly to discuss a return-to-work
plan and, if relevant, any temporary adjustments needed. This is handled confidentially between
you, HR, and your manager only on a need-to-know basis.""")

    # Casual leave (3)
    add("Casual Leave", "Casual leave entitlement and typical uses", """## Entitlement
7 days of casual leave per year, intended for short-notice personal matters (a family event, an
appliance delivery, a personal errand) that don't warrant using annual leave or sick leave.

## How to apply
Same process as annual leave — apply through the AI Assistant. Casual leave can
be requested with less notice than annual leave, same-day if needed.""")
    add("Casual Leave", "Casual leave vs. annual leave - which to use", """## Guidance
Use casual leave for short (often half-day or 1-day), lower-notice personal matters. Use
annual leave for planned vacations or longer absences. There's no penalty for choosing one over
the other, this is just guidance to help plan the right amount of time.""")
    add("Casual Leave", "Half-day casual leave", """## Policy
Casual leave can be taken in half-day increments. When applying, specify morning or afternoon;
your balance is deducted by 0.5 days accordingly.""")

    # Parental leave (4)
    add("Parental Leave", "Parental leave policy overview", """## Entitlement
Primary caregivers: 16 weeks of paid parental leave. Secondary caregivers: 4 weeks of paid
parental leave. Leave can start up to 2 weeks before the expected due date and must be used
within 12 months of the birth or adoption.

## How to apply
Notify HR and your manager at least 8 weeks before your planned start date where possible, so
cover can be arranged. HR will walk you through the formal application and pay continuation
details individually.""")
    add("Parental Leave", "Parental leave for adoption and fostering", """## Policy
The same entitlement (16 weeks primary / 4 weeks secondary caregiver) applies for adoption and
long-term fostering placements, calculated from the date the child joins your family rather
than a birth date.""")
    add("Parental Leave", "Returning to work after parental leave", """## Policy
You can request a phased return (reduced hours for the first 2-4 weeks back) when planning your
parental leave — this is accommodated whenever the role allows it. Your role and level are
protected during parental leave; discuss any changes to your team or responsibilities with your
manager before you return, not as a surprise on day one.""")
    add("Parental Leave", "Parental leave pay and how it's calculated", """## Policy
Parental leave is paid at your full regular salary for the entitled period (16 or 4 weeks per
the policy above). It appears on your payslip as a separate "Parental Leave Pay" line rather
than regular salary, for tax-reporting clarity, but the net effect to your take-home pay is the
same as a normal working period.""")

    # Carry-forward (3)
    add("Leave Carry-Forward", "How much annual leave can be carried forward", """## Policy
Up to 5 unused annual leave days can be carried forward into the next calendar year. Anything
beyond 5 days is forfeited at year-end, so plan remaining leave before December if your balance
is high.""")
    add("Leave Carry-Forward", "Deadline to use carried-forward leave", """## Policy
Carried-forward days must be used by March 31st of the new year, after which any that remain
unused are forfeited. Carried-forward days are deducted from your balance before current-year
days when you book leave, so you don't accidentally lose them.""")
    add("Leave Carry-Forward", "Does sick or casual leave carry forward too?", """## Policy
No — only annual leave carries forward, up to the 5-day cap. Sick leave and casual leave
balances reset at the start of each calendar year and do not roll over.""")

    # Payroll / payslip (4)
    add("Payroll", "Payroll cycle and pay dates", """## Policy
Salaries are paid monthly, on the last working day of each month. Payslips are available from
3 working days before pay date.

## Viewing your payslip
Ask the AI Assistant "show me my payslip". It shows your latest payslip right in the chat: gross
pay, each deduction and net pay. For an earlier month, ask for it by name, for example "my
payslip for October". You can only ever view your own payslip, and every view is logged.""")
    add("Payroll", "Understanding deductions on your payslip", """## Common deduction lines
Tax withholding, retirement/pension contribution, and health insurance premium (if you've opted
into the company plan) are the three most common deduction lines. Each is itemized separately
on your payslip with the exact amount for that pay period.""")
    add("Payroll", "What to do if your payslip looks wrong", """## Steps
1. Double-check against your contracted salary and any recent changes (raise, role change,
   leave without pay) that would explain a difference.
2. If it still looks wrong, raise it through the AI Assistant — this creates a ticket for the
   payroll team with your payslip context attached, since payroll corrections need a human to
   review and can't be auto-resolved.
3. Corrections are typically applied in the next pay cycle, with a backdated adjustment line
   shown separately for transparency.""")
    add("Payroll", "Changing your bank account for salary payment", """## Steps
Update your bank details through the HR system's "Payment Details" section, not by emailing
them to anyone directly (for security — payment detail changes are never processed from an
email request). Allow one full pay cycle for the change to take effect.""")

    # Tax declarations (3)
    add("Tax", "Annual tax declaration - what you need to submit", """## Policy
Each year, submit your tax declaration (investment proofs, applicable deductions) through the
HR portal by the deadline announced each January. Submitting on time avoids higher default
withholding being applied to your remaining paychecks that year.""")
    add("Tax", "What happens if I miss the tax declaration deadline", """## Policy
If you miss the deadline, default (higher) withholding is applied for the rest of the tax year.
You can still submit a late declaration, which will be reflected in the following year's
withholding, but the current year's over-withheld amount is only recoverable when you file
your personal tax return.""")
    add("Tax", "Getting your annual tax statement", """## Steps
Your annual tax statement (summarizing total pay and withholding for the year) is generated
automatically and available in the system by the end of January each year — no request needed,
though you can also ask the AI Assistant for a copy at any time after it's generated.""")

    # Benefits (3)
    add("Benefits", "Health insurance enrollment", """## Policy
Health insurance enrollment is open during the annual open-enrollment window (usually
November) or within 30 days of a qualifying life event (marriage, birth/adoption, loss of other
coverage). Outside those windows, enrollment changes aren't possible until the next
open-enrollment period.""")
    add("Benefits", "Wellness and gym membership benefit", """## Policy
Employees are eligible for a monthly wellness reimbursement (gym membership, fitness classes,
or qualifying wellness apps) up to a set monthly cap — submit receipts through the HR portal's
reimbursement section.""")
    add("Benefits", "Dependent coverage under company health insurance", """## Policy
Spouses/partners and children can be added as dependents during open enrollment or within 30
days of a qualifying event. Adding a dependent outside these windows requires documentation of
the qualifying event (e.g. marriage certificate, birth certificate).""")

    # Insurance (3)
    add("Insurance", "Life and disability insurance coverage", """## Policy
All full-time employees are automatically enrolled in base life and disability insurance at no
cost, equal to one year's salary. Supplemental coverage (higher amounts) can be purchased
during open enrollment at group rates.""")
    add("Insurance", "Filing an insurance claim", """## Steps
Claims are filed directly with the insurance provider, not through HR, but HR can provide your
policy/group number and help if a claim is stuck — raise it through the AI Assistant and it
will be routed to HR with the context you provide.""")
    add("Insurance", "Travel insurance for business trips", """## Policy
Business travel automatically includes travel insurance coverage for the trip dates once
booked through the approved travel system — no separate enrollment needed. Personal trips are
not covered under this policy.""")

    # Travel & reimbursement (3)
    add("Travel & Reimbursement", "Business travel booking policy", """## Policy
Book flights/hotels through the approved travel portal, not independently, so the trip is
automatically covered by travel insurance and company rates apply. Economy class for flights
under 6 hours; premium economy permitted beyond that with manager approval.""")
    add("Travel & Reimbursement", "Expense reimbursement process", """## Steps
1. Submit expenses with itemized receipts through the HR portal's expense section within 30
   days of the expense.
2. Your manager approves, then reimbursement is paid with your next regular payroll run.
3. Expenses submitted more than 60 days after the fact require additional justification and
   may not be approved.""")
    add("Travel & Reimbursement", "Per diem rates for business travel meals", """## Policy
A daily meal per diem applies for overnight business travel, varying by destination city cost
of living (standard/high-cost-city rates are listed on the intranet Travel page). Per diem is
paid automatically based on your approved travel dates, no separate expense claim needed for
meals within the per diem amount.""")

    # Work from home (3)
    add("Work From Home", "Work from home policy", """## Policy
Most roles follow a hybrid policy: a minimum of 3 days per week in the office, with the
remaining days flexible to work from home, agreed with your manager. Fully remote arrangements
require a documented exception approved by your manager and HR.""")
    add("Work From Home", "Home office equipment and stipend", """## Policy
A one-time home office setup stipend (desk, chair, monitor) is available for employees with an
approved hybrid or remote arrangement — submit receipts through the HR portal within 90 days of
starting the arrangement.""")
    add("Work From Home", "Working from home while traveling/abroad", """## Policy
Working remotely from a different country requires advance approval (tax and legal
implications vary by country) — raise this with HR at least 3 weeks before travel. Short trips
(under 10 working days) in approved countries are generally straightforward; longer stays need
a closer review.""")

    # Onboarding (3)
    add("Onboarding", "First week onboarding checklist", """## What to expect
Day 1: laptop and accounts are provisioned before you arrive; IT orientation and HR paperwork
session in the morning. Week 1: meet your manager 1:1, complete mandatory compliance training,
and get your system access provisioned for your specific role (this can take 1-2 business
days after your manager submits the access request).""")
    add("Onboarding", "Setting up direct deposit and tax forms as a new hire", """## Steps
Complete your bank details and tax declaration forms in the HR portal during your first week —
you'll get an automatic reminder if these aren't done by day 5, since pay can't be processed
without them.""")
    add("Onboarding", "Probation period and review", """## Policy
New hires have a 3-month probation period with a formal review at the end. Regular 1:1 check-ins
with your manager happen throughout — the end-of-probation review should have no surprises if
those check-ins have been happening.""")

    # Performance review (2, to round out to 40)
    add("Performance Review", "Performance review cycle overview", """## Policy
Formal performance reviews happen twice a year (mid-year and year-end). Mid-year is a
lighter-weight check-in; year-end feeds into the annual compensation review. Self-assessment is
due 1 week before your manager's assessment, both feeding into a joint conversation rather than
a one-way delivery.""")
    add("Performance Review", "How performance ratings relate to compensation", """## Policy
Year-end performance ratings are one input (alongside role, market benchmarking, and budget) to
the annual compensation review, not an automatic formula. Compensation decisions are
communicated separately from the performance review conversation itself, typically a few weeks
later.""")

    return articles
