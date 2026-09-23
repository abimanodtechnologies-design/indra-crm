# Indra Engineering CRM — local deployment

This is your existing React/Express/PostgreSQL application adapted to run on this PC.
The cloud database and deployed website have not been changed.

## Start the CRM

1. Double-click **START-LOCAL.cmd** in this folder.
2. Keep its terminal open and visit **http://localhost:5000**.
3. For this new local database, read **local/FIRST-LOGIN.txt** for the generated administrator login.
4. Change the initial password through Users after signing in.
5. Press Ctrl+C in the server terminal to close the application. Run **STOP-DATABASE.cmd** afterward if you also want to stop PostgreSQL.

Setup and the React build have already been run here. On another Windows PC, install Node.js 24 LTS and PostgreSQL 18, then run **SETUP-LOCAL.cmd**. Set PG_BIN if PostgreSQL is installed outside Program Files.
The first npm dependency installation needs internet. Normal local CRM operation does not.

## Where information is stored

- **local/postgres/**: the actual PostgreSQL database files, inside this project on D:.
- **local/backups/**: portable database backups.
- **local/config.json**: local database credentials, PostgreSQL location, database name.
- **CRM-backend-/.env.local**: active server settings and token-signing secret.
- **local/FIRST-LOGIN.txt**: generated initial administrator credentials.
- Attachments stored by the existing CRM remain inside the PostgreSQL database.

PostgreSQL listens only on 127.0.0.1:55432, separately from the already installed PostgreSQL service on 5432.
The application uses the restricted indra_app database role; administrative backup/restore uses a separate local owner.
Do not manually edit or copy a running PostgreSQL data directory for backup. Use the backup commands.
Keep local/config.json, .env files and backups private.

## Existing cloud records

Only the database structure has been copied so far. Business records and existing cloud users have **not** been imported.
To bring them across deliberately:

1. Run **MIGRATE-CLOUD.cmd** while online. It reads the original backend .env and downloads a snapshot without changing the cloud.
2. Close the CRM server.
3. Run the RESTORE-LOCAL.cmd command printed by the migration script.
4. Restart the CRM and sign in with your existing cloud credentials.

Restore uses a new local database. The previous local database remains available for rollback.
Cloud and local installations are independent after import; changes are not synchronized.
Pause cloud data entry during the final snapshot/cutover to avoid missing subsequent cloud changes.
Cloud proposal links in old messages will still refer to their original host.

## Backups and recovery

- In CRM **Settings → Local database & backup → Back up now**, or double-click **BACKUP-LOCAL.cmd**.
- To back up to another local drive: `BACKUP-LOCAL.cmd "E:\\CRM Backups"`.
- Scheduled backups run after 6 PM, at most once per local calendar date, while the application server is running. If started later that day, a backup catches up.
- Set `backupDir` in local/config.json to an absolute path (escape backslashes in JSON) to change the default backup location.
- Backups are retained until you remove them. There is no automatic deletion.
- Restore: stop the server, then run `RESTORE-LOCAL.cmd "full path to backup.dump"`.
  A pre-restore backup is taken, the dump is loaded transactionally into a new database, basic tables are checked, and the local config switches only on success.
  The old database name is retained in local/config.json as previousDatabase. Restore invalidates existing login tokens.
- If restore fails, the current database remains selected. The unused new database can be inspected separately.
- The scheduled job depends on the CRM process. It is not a Windows service or a task that runs while the PC is off.

## Local/offline behavior

React is served by Express; all API calls use the same local origin. No AWS API or Supabase connection is used in local mode.
The existing cloud .env files are preserved, but .env.local / .env.production.local take precedence.
Automatic email/SMS/calling integrations are disabled; an email send action reports that it is disabled.
WhatsApp, Google Maps, sending email/SMS and links shared outside this PC still require internet/network access.
The dashboard's existing manual browser notification remains available.
A local administrator reminder appears after 9 AM for due/overdue follow-ups when the CRM is open, including after opening it later in the day.
The reminder uses the computer's local time. No reminders run while the browser/PC is closed.
Automatic outbound proposal/email workers are disabled with AUTOMATIONS_ENABLED=false.

## Optional office LAN access

Default access is this PC only. For other office computers:
- In CRM-backend-/.env.local set HOST=0.0.0.0.
- Set PUBLIC_FRONTEND_URL and FRONTEND_URL to http://SERVER-LAN-IP:5000.
- Add that exact origin to ALLOWED_ORIGINS and restart the server.
- Allow TCP 5000 through Windows Firewall on the private office network only.
- Open http://SERVER-LAN-IP:5000 on client PCs. Keep database port 55432 local.
- Internet-facing hosting and HTTPS setup are separate deployment work.

## Development and checks

- Production build: `cd CRM`, then `npm run build`.
- Start production from the project root: `node local-crm.cjs start`.
- Development: start the database using `node local-crm.cjs start-db`; run `npm run dev` in CRM-backend- and CRM in separate terminals. Vite proxies /api to port 5000.
- Integration check while the server is running: `node CRM-backend-/scripts/test-local.cjs`.
  It creates uniquely named test fixtures, tests local writes, restores a backup to an isolated temporary database, and removes test fixtures afterward.
- Original edited-file copies: local/before-local-conversion/.
- A large-bundle warning remains from the existing React application; it does not prevent the production build.

The application source, its previous uncommitted changes, and its existing modules have been retained.
