# Security Policy

## Reporting

Please report security issues privately through GitHub's security advisory flow
when available. Avoid posting exploit details, credentials or database
identifiers in public issues.

## Secrets

This project should only contain browser-safe public environment variable names
and placeholders. Keep the following out of Git:

- `.env.local` and other local environment files.
- Supabase service-role keys.
- Supabase secret keys.
- JWT secrets.
- Database passwords and connection strings.
- Personal documents, signatures and exported credentials.

If a credential is exposed in a chat, screenshot, log or commit, rotate it in
the provider dashboard before using the project publicly.
