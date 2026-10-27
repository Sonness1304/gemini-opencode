# Security guidance

## Scope

This repository is an experimental archive. It has no production support or response-time guarantee.

The adapter touches account sessions and local tool boundaries. Keep services on loopback, preserve client permissions, and review the pinned upstream source and dependencies before a live deployment.

## Reporting a concern

Do not include credentials, cookies, private prompts, account databases, or executable payloads in public issues.

If GitHub offers **Report a vulnerability** for this repository, use that private reporting route. Otherwise, open a minimal issue asking for a private contact channel without publishing exploit details or private data.

Do not test against other people's accounts or services. A small local fixture is preferable to a live exploit.

## Operational notes

- Store secrets outside the repository and inject keys only where required.
- A shared browser session is not isolated merely because it has multiple account selectors.
- Client permission rules are independent of model output and bridge schema checks.
- Do not replay a request when a mutation may already have occurred.
- The historical web launcher uses the OS URL handler; choose a verified browser profile separately if required.
