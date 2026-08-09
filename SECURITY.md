# Security Policy

## Supported code

| Code line | Security support |
| --- | --- |
| `main` | Supported |
| Older commits, tags, forks, and pre-release snapshots | Not supported unless explicitly documented otherwise |

Ledgerly is under active development. Security fixes are applied to `main`;
the project does not currently promise backports to earlier snapshots.

## Report a vulnerability privately

Submit suspected vulnerabilities through
[GitHub private vulnerability reporting](https://github.com/d4rkNinja/ledgerly-app/security/advisories/new).
Do not open an Issue, start a Discussion, or publish exploit details before the
maintainers have coordinated a fix and disclosure.

Include as much of the following as possible:

- the affected component and code revision;
- the security impact and realistic attack scenario;
- minimal reproduction steps or a proof of concept;
- required configuration, permissions, or preconditions;
- relevant logs with secrets and personal data removed; and
- suggested remediation or mitigations, if known.

## What to expect

Maintainers will review reports, request additional details when necessary,
assess impact, and coordinate remediation and disclosure. Response and fix times
depend on severity, reproducibility, and maintainer availability; this project
does not guarantee a specific response-time service level.

Please act in good faith, minimize access to data, avoid privacy violations or
service disruption, and provide reasonable time for remediation before public
disclosure.

## Scope notes

Reports about exposed credentials, authorization bypasses, workspace isolation,
financial data integrity, session handling, or vulnerable dependencies are in
scope. General support questions and non-security defects belong in the
channels described in [SUPPORT.md](SUPPORT.md).
