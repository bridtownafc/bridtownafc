# Security Principles

## Access and administration

- CMS accounts are individual; shared logins are prohibited.
- MFA for administrators and publishers.
- Least-privilege roles with periodic access review and prompt offboarding.
- Audit history for access, publishing, score changes, prices, partner status and policies.
- Separate development, preview and production environments.

## Forms and personal data

- Server-side validation, output encoding, CSRF protection where relevant, rate limiting and bot defence.
- Enquiry success is shown only after durable acceptance.
- Minimise fields; publish a privacy notice and retention period.
- Protect notification emails from injection; never place secrets or private recipient addresses in client code.
- Restrict enquiry access and record export.

## Application and supply chain

- Lock dependencies, automate vulnerability alerts and review updates.
- Keep secrets in managed environment storage, never Git or CMS content.
- Security headers: CSP, HSTS after domain verification, `X-Content-Type-Options`, `Referrer-Policy`, frame restrictions and permissions policy.
- Escape CMS content by default; strictly control any rich HTML.
- Validate media type, size and metadata; scan uploads where the platform supports it.
- Disable unnecessary CMS endpoints and preview-token leakage.

## Resilience

- Automated CMS/data backups with defined retention and tested restore.
- Versioned deployments and documented rollback.
- Monitoring for availability, errors, form delivery and integration failures.
- Incident contacts and severity process owned by the club/technical operator.

## Pre-launch checks

Threat model, access review, dependency scan, header validation, form abuse testing, secret scan, backup restore test, privacy review and administrator training. Penetration testing should be considered before adding accounts, payments or ticketing.

