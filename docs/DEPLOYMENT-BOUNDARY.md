# Deployment and Production Boundary

## Phase 1 rule

Phase 1 produces documentation only. It does not deploy, configure hosting, modify DNS, access WordPress administration, change plugins/themes, alter databases, create infrastructure, merge to `main` or open a pull request.

## Protected production

`https://bridtown.com` remains the live WordPress site and must remain operational and untouched until a separately approved migration phase. Read-only public inspection is permitted. Discovered configuration is documented, not modified.

This repository is independent from Bilinear, Skilzco, DCAI/Atlas, National Data Centre Academy and every unrelated repository or service. It must not share their databases, APIs, secrets, deployment processes or operational resources.

## Future environment model

- Local development: dummy/non-sensitive data.
- Preview: isolated project environment, protected where practical, with `noindex` and no production credentials.
- Staging: production-like validation, separately authorised.
- Production: `bridtown.com`, reached only through a controlled migration and rollback plan.

## Launch gates

Written approval, content sign-off, accessibility and performance review, security checks, redirect validation, backup/export of the current site, DNS/hosting plan, monitoring, rollback owner and launch communications. DNS TTL or production changes must never occur merely because an application build is complete.

