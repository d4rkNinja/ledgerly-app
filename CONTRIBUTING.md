# Contributing to Ledgerly

Thank you for helping improve Ledgerly. By participating, you agree to follow
the [Code of Conduct](CODE_OF_CONDUCT.md).

## Choose the right channel

- Search existing [Issues](https://github.com/d4rkNinja/ledgerly-app/issues)
  and [Discussions](https://github.com/d4rkNinja/ledgerly-app/discussions)
  before starting something new.
- Use Discussions for questions, troubleshooting, and early-stage ideas.
- Use the
  [issue forms](https://github.com/d4rkNinja/ledgerly-app/issues/new/choose)
  for reproducible bugs and scoped feature proposals.
- Follow [SECURITY.md](SECURITY.md) for suspected vulnerabilities or exposed
  secrets. Do not disclose them publicly.

## Development workflow

1. Fork the repository and create a focused branch from `main`.
2. Follow the [root README](README.md) for prerequisites, environment setup,
   and application startup.
3. Keep the change focused. Avoid unrelated refactors or generated artifacts.
4. Add or update tests for observable behavior.
5. Update documentation when behavior, configuration, or commands change.
6. Run the checks relevant to the files you changed.
7. Open a pull request using the repository template.

Use clear, imperative commit messages that explain the change. Keep commits
reviewable and avoid mixing formatting-only changes with behavioral changes.

## Verification

There is no single root-level test command. Run checks from the relevant
directory:

| Area | Directory | Commands |
| --- | --- | --- |
| API | `api/` | `go test ./...`, `go vet ./...`, `go build ./...` |
| Web | `web/` | `npm run check` |
| Android scripts | `web/` | `npm run test:scripts` |
| Android/native | `web/` | `npm run android:test` |

Run the complete set when a change crosses application boundaries. Go code
should also be formatted with `gofmt`.

## Pull requests

A useful pull request:

- explains the problem and why the change is needed;
- summarizes the implementation without repeating the diff;
- keeps unrelated changes out;
- identifies breaking changes, migrations, security implications, and risks;
- lists the exact verification commands and results; and
- includes screenshots or recordings only when visible UI behavior changed.

Maintainers may request changes or close proposals that conflict with project
scope, security, maintainability, or the Code of Conduct.

## Security and privacy

Never commit secrets, credentials, production configuration, private keys,
signing material, personal financial data, or production database contents.
Redact sensitive information from logs and screenshots. Report vulnerabilities
through the private channel documented in [SECURITY.md](SECURITY.md).
