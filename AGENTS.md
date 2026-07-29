# Agents.md — guidance for AI agents working in this repo

## Your behavior

- Be concise, articulate with your language in interactions and avoid idioms that may confuse people who don't know what they mean. Use simple language

## Open work and progress

Open work is tracked by the maintainer outside this repository. Do not
create tracker or progress documents. If you defer work or find a gap,
describe it in the pull request and the maintainer will record it.

## Build and verify

- //TODO

## Chores

- Always bump the version number for any part of the product (ex: core and dashboard) based on semantic versioning when commiting your final work to a branch.
- Core and Dashboard do not need to have vesion parity.
- SemVer reference: https://semver.org

## Documentation

- Keep text descriptions short without excessive details unless necessary to prevent confusion
- Refrain from using idiomatic language such as "clobber," "belt and suspenders," etc. which may be read differently by different people

## Branches and Commit messages — use Conventional Commits

- follow the instructions in the ##Documentation section for writing commit messages

- Follow the spec: <https://www.conventionalcommits.org/en/v1.0.0/#specification>

```
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

- **Allowed types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
  `build`, `ci`, `chore`, `revert`.
- **description:** imperative mood, lowercase, no trailing period.
- **Breaking changes:** add `!` after the type/scope (e.g. `feat(create)!:`) and/or
  a `BREAKING CHANGE:` footer.
- **Examples:**
  - `feat(security): add container fingerprint hardening`
  - `fix(create): bind sshd to loopback only`
  - `chore: adopt test/ and lib/ layout`
- End messages with the `Co-Authored-By:` trailer naming the AI model used.

## Before committing

- Run all unit tests
- Run all linting
- Never commit items in `.gitignore`.

## No inline foreign-language code — extract to its own file

- NEVER embed another language (Python, etc.) inline in any other file

## All Typescript, front end and back end

- Always use a functional-first immutability-first coding style (user,
  2026-07-29: this applies to the server too, not only the app)
  - Prefer `map`, `filter` and `reduce` over `for` loops; build new values
    instead of mutating them; `const` over `let`
  - This is about building values. For iteration that only causes side
    effects, biome's `noForEach` requires `for...of` over `.forEach` —
    obey the linter there, or express the check as data instead
  - Where a loop is kept, say in a comment what it does that the
    functional form cannot. Sequencing that must not become concurrent is
    the usual reason

## UI code: Typescript

- All network state management needs to be in React Query
- All non-network app state management needs to be managed by Zustand

## Backend code

- Follow the Typescript rules above

## UX

- Use the Material UI/UX framework
- WCAG compliance is required
  - If a feature can't be WCAG compliant, propose an alternative for users that need it. I.e. a table for those who can't see a graph
- i18n compatability is a must
- **Everything must work on both mobile and tablet.**
