# Security policy

baribari processes microphone audio, system audio, speaker embeddings, transcripts,
API credentials, and downloaded model files. Security changes must protect those
assets without weakening the project's local-first defaults.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose user data,
execute code during installation, bypass authentication, or compromise a release.
Use GitHub's private vulnerability reporting for this repository. Include affected
versions, reproduction steps, impact, and any suggested mitigation. If private
reporting is unavailable, contact the maintainer through the address listed on the
GitHub profile and disclose only enough information to establish a secure channel.

The latest released version and the current `main` branch receive security fixes.
Older releases may be asked to upgrade rather than receive a backport.

## Security boundaries

- Audio, speaker profiles, and session files stay local unless the user explicitly
  enables LAN sharing or configures an external AI provider.
- The web sharing server is a network boundary. New remotely reachable operations
  require authentication, input limits, and an explicit exposure model.
- Model archives and native binaries are executable supply-chain inputs even when
  they are not JavaScript. Downloads require an expected source, size limits,
  integrity verification, and atomic installation.
- The TUI, future desktop UI, and web clients are untrusted presentation layers.
  They must not receive API keys or gain direct filesystem access through generic
  commands.

## Package manager policy

The repository uses a pinned pnpm release and one committed `pnpm-lock.yaml` for
the complete workspace. Do not add npm, Yarn, Bun, or secondary workspace
lockfiles. End users may still install the published `baribari` package with npm or
run it with `npx`; this policy concerns repository development and releases.

The following protections belong in the committed `pnpm-workspace.yaml`:

```yaml
sharedWorkspaceLockfile: true
saveExact: true
minimumReleaseAge: 4320
minimumReleaseAgeStrict: true
minimumReleaseAgeIgnoreMissingTime: false
trustPolicy: no-downgrade
trustLockfile: false
blockExoticSubdeps: true
strictDepBuilds: true
```

`minimumReleaseAge: 4320` creates a three-day cooling-off period for direct and
transitive releases. A security fix may be exempted only by exact package version,
with the reason recorded in the dependency update commit or pull request.

`trustLockfile` must remain `false`: a lockfile change is input to verification,
not proof that the dependency is safe. Do not weaken these settings merely to make
an install pass.

## Dependency install scripts

Dependency lifecycle scripts are denied unless a package is explicitly reviewed in
the `allowBuilds` map. An approval means the named package is permitted to execute
code during installation; it is not a general statement that every future version
is trusted.

Before approving a build script:

1. Identify why the script is required and which files or binaries it creates.
2. Inspect the exact resolved version, its package metadata, source repository,
   maintainer history, and lifecycle script.
3. Prefer packages that publish provenance and registry signatures.
4. Approve the narrowest package/version matcher pnpm supports.
5. Run installation without secrets in the environment.
6. Verify typecheck, tests, build, package contents, and supported platforms.

Never enable `dangerouslyAllowAllBuilds`. Do not use `.pnpmfile` hooks to bypass
the approval policy. A package that does not need its install script should be
explicitly denied when pnpm requires a decision.

## Adding and updating dependencies

- Use exact direct dependency versions. The lockfile remains mandatory even with
  exact versions because transitive dependencies must also be fixed.
- Prefer registry packages over Git, branch, commit, or arbitrary tarball
  dependencies. Any necessary direct exotic dependency must pin an immutable
  commit and be documented.
- Do not execute unfamiliar tools with `pnpm dlx`, `npx`, `curl | sh`, or an
  equivalent command. Add reviewed tools as pinned development dependencies.
- Make dependency-only changes separately from feature changes.
- Review manifest and lockfile diffs, including new maintainers, new transitive
  packages, lifecycle scripts, native binaries, registry changes, and license
  changes.
- Do not run automatic major/latest upgrades in release workflows.
- Prefer removal over adding a dependency for small, stable utilities.

Required checks for dependency changes:

```sh
pnpm install --frozen-lockfile
pnpm audit --audit-level high
pnpm audit signatures
pnpm typecheck
pnpm test
pnpm build
pnpm pack:check
```

An audit advisory may be ignored only when its reachability and impact have been
documented. Ignore entries must use the advisory identifier and include a review
date in the same commit or pull request.

## CI and GitHub Actions

- Pin third-party GitHub Actions to a full commit SHA and retain a comment naming
  the human-readable release.
- CI installs with `pnpm install --frozen-lockfile`; it must never regenerate or
  modify the lockfile.
- Release builds do not restore a mutable dependency cache unless the cache is
  content-addressed by the exact lockfile and cannot replace verification.
- Workflows receive the minimum permissions required by each job.
- Pull-request workflows from forks must not receive publish, signing, or service
  credentials.
- Generated artifacts must come from the checked-out commit, not from an unpinned
  download.

## Publishing baribari

Publishing uses npm Trusted Publishing from GitHub Actions with OIDC and npm
provenance. Do not restore a long-lived `NPM_TOKEN` when OIDC is available.

A release must:

1. Start from a clean, reviewed commit whose version matches the tag.
2. Install from the frozen lockfile and run all required checks.
3. Build the CLI package (`apps/cli`) explicitly rather than recursively publishing
   every workspace package.
4. Inspect the package tarball and ensure it contains only intended runtime files,
   README files, and license material.
5. Publish only the public `baribari` package from `apps/cli`. Workspace root,
   documentation, and desktop applications remain private packages.
6. Produce provenance through the trusted publisher and keep npm account 2FA
   enabled for human operations.

## Secrets and local data

- Never commit API keys, npm tokens, signing keys, session recordings, speaker
  embeddings, model archives, or generated user configuration.
- Logs and bug reports must redact authorization headers, query tokens, filesystem
  usernames, API keys, and meeting content by default.
- New configuration fields containing secrets must be masked in every UI and must
  not be sent to web clients.
- Security-sensitive tests use synthetic fixtures, not real meetings.

## Incident response

If a dependency or release is suspected to be compromised:

1. Stop publishing and disable affected automation credentials or trusted
   publisher configuration if appropriate.
2. Preserve the tag, workflow run, lockfile, tarball digest, and relevant logs.
3. Identify the first affected version and whether install scripts executed.
4. Remove or pin away from the dependency, rotate exposed credentials, and rebuild
   from a known-good lockfile in a clean environment.
5. Publish a patched version and security advisory with clear upgrade guidance.
6. Do not rewrite or silently replace published history.

Package-manager protections reduce exposure windows; they do not prove that a
dependency or signed release is benign. Human review and narrow runtime boundaries
remain required.
