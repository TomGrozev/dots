# Git Bot Identity Extension

Provides a secure, isolated bot identity for Git and GitHub operations within the Oh My Pi harness.

- **Bot Identity**: Operates as a dedicated GitHub account for write actions.
- **Human Co-author**: Automatically adds `Co-authored-by` trailers to bot commits.
- **Fail-closed**: Write operations are blocked if valid agent credentials cannot be verified. Read-only operations always pass.

## Why an Extension
This is an OMP extension, utilizing the runtime `ExtensionAPI` for auto-discovery from `.omp/extensions/`.

## Setup

### 1. GitHub Account
Create a dedicated GitHub account to serve as the agent's identity.

### 2. Personal Access Token (PAT)
Generate a PAT for the agent account with the following permissions:
- **Fine-grained**: `contents:write`
- **Classic**: `repo` (full control of private repositories)

### 3. GPG Key
Bot commits are signed with a GPG key whose UID email MUST equal `config.email`, so the signature matches the committer and GitHub shows the **Verified** badge. Register the key's **public** half once in the agent account's **Settings > SSH and GPG keys**. There are three ways to provision the private half; pick one.

**Recommended (multi-host): provision one key, mount it everywhere.** Generate a single passphrase-less key once, export its secret half to a file, and mount that file on every host (e.g. a Coder secret). Point `signingKeyFile` at it; the extension imports it into its isolated keyring on first write. You register **one** public key on GitHub, not one per host.
```bash
# Once, anywhere:
gpg --batch --pinentry-mode loopback --passphrase '' \
  --quick-generate-key 'git-bot-identity <id+login@users.noreply.github.com>' rsa2048 sign never
gpg --export-secret-keys --armor <key-id> > bot-signing-key.asc   # mount this file on each host
gpg --export --armor <key-id>                                     # register this on the agent account
```
Then set `signingKeyFile` to the mounted path (e.g. `/run/secrets/bot-signing-key.asc`). The key MUST be passphrase-less so signing never blocks on pinentry.

**Single-host: let the extension generate one.** With no `signingKeyFile`/`signingKey`, the extension generates a passphrase-less RSA-2048 sign-only key on first write. Export and register its public half once:
```bash
GNUPGHOME=~/.config/git-bot-identity/gnupg gpg --export --armor <key-id>
```

**Advanced: key already in the bot keyring.** If the isolated keyring (`~/.config/git-bot-identity/gnupg/`) is provisioned out of band, set `signingKey` to its key-id and the extension signs with it as-is.

### 4. Configuration
Create `~/.config/git-bot-identity/config.json`:

| Key | Required | Meaning |
| :--- | :--- | :--- |
| `name` | Yes | Author display name |
| `email` | Yes | Agent account commit email (e.g. `id+login@users.noreply.github.com`). MUST match the GPG key UID for Verified attribution. |
| `token` | Yes | Agent Personal Access Token (PAT) |
| `humanName` | No | Name for co-author trailer; falls back to `git config user.name` |
| `humanNoreply` | No | Email for co-author trailer; falls back to `git config user.email` |
| `signingKey` | No | GPG key-id already present in the bot keyring; used as-is. |
| `signingKeyFile` | No | Path to an armored, passphrase-less secret key to import into the bot keyring. The multi-host path: one key mounted on every host, one public key on GitHub. Takes precedence over generation. |

## How It Works

### Execution Flow
1. **Classification**: Calls are classified as either read-only or write. Only write-class calls are modified. Read-only calls (e.g. `git log`, `gh pr view`, `git fetch`) pass through untouched — they run as you, with your credentials and identity. This is deliberate: reads have nothing to attribute, so there is no reason to rewrite their identity or transport, injecting the PAT into commands that don't need it only widens token exposure, and reads MUST always pass so the agent stays functional even when bot credentials are absent (the fail-closed block applies to writes only).
2. **Identity Injection**: For write calls, the extension overlays the following environment variables:
   - `GIT_AUTHOR_NAME` / `GIT_COMMITTER_NAME`: Set to `config.name`.
   - `GIT_AUTHOR_EMAIL` / `GIT_COMMITTER_EMAIL`: Set to `config.email`.
3. **Transport**: To route requests using the PAT, the extension injects a Git configuration `insteadOf` override:
   `url."https://x-access-token:${token}@github.com/".insteadOf`
   This rewrites both `git@github.com:` and `https://github.com/` requests to use the agent's PAT.
4. **Co-authorship**: A `prepare-commit-msg` hook is installed to append the `Co-authored-by` trailer using the human's identity (prioritizing `config.json` over global git config).
5. **Isolation**: Environment variables are injected per-tool-call; the human's primary shell remains untouched.

## GPG Signing
Bot commits are signed with a bot-owned GPG key located in `~/.config/git-bot-identity/gnupg/`.

- **Isolation**: The extension sets `GNUPGHOME` to this directory, ensuring the human's primary keyring is never consulted.
- **Passphrase-less**: Keys are generated without passphrases to allow automated signing without pinentry.
- **Provisioning**: The signing key is resolved in precedence order — `signingKeyFile` (import one mounted secret key; multi-host) → `signingKey` (an id already in the bot keyring) → generate one on first write (single-host).
- **Fail-closed**: If key generation or signing fails, the write operation is blocked.

## Security
- **Fail-closed Model**: Write-class calls are blocked if required credentials (`name`, `email`, `token`) are missing or invalid. Read-only calls proceed without credentials.
- **Strict Identity**: Bot identity never falls back to human identity for write actions.

## Development

### Commands
- **Test**: `bun test test/`
- **Typecheck**: `bunx tsc --noEmit -p tsconfig.json`

### File Map
- `index.ts`: Hook wiring and entry point.
- `lib/classify.ts`: Call classification logic.
- `lib/env.ts`: Environment variable assembly and transport configuration.
- `lib/config.ts`: Credential and configuration discovery.
- `lib/gpg.ts`: GPG key management and signing.
