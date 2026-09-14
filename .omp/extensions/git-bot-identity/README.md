# Git Bot Identity Extension

Provides a secure, isolated bot identity for Git and GitHub operations within the Oh My Pi harness using a block-by-default credential model.

- **Bot Identity**: Operates as a dedicated GitHub account for write actions.
- **Human Co-author**: Automatically adds `Co-authored-by` trailers to bot commits.
+ **Fail-closed**: Write operations are blocked by default and only granted for classified writes when valid agent credentials are configured.

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

## Enforcement Model
The extension employs a block-by-default credential model. Security is derived from removing credentials at the process level, not merely by classifying commands.

- **Neutralization at Load**: At extension load, the `omp` process environment is neutralized. Every child process—including the bash tool, the eval kernel, and task-subagent shells—is born without GitHub-reaching credentials. This is achieved by:
    - Removing the SSH agent (`SSH_AUTH_SOCK`).
    - Overriding `GH_TOKEN`, `GITHUB_TOKEN`, and `GH_ENTERPRISE_TOKEN` with an invalid sentinel to defeat the macOS keyring and force `gh` to fail closed.
    - Disabling interactive prompts (`GIT_TERMINAL_PROMPT=0`) and SSH transport (`GIT_SSH_COMMAND=false`).
    - Redirecting `GIT_CONFIG_GLOBAL` to a dedicated, credential-less deny configuration.
    - Prefixing `PATH` with a directory containing guidance shims for `git` and `gh`.
- **Selective Re-grant**: Credentials from `config.json` are re-granted *only* for classified write-class `git` or `gh` commands executed through the bash tool. This grant is strictly scoped to that single call. Read-only calls remain credential-neutral; public reads work normally, and when configured, reads run as the agent account.
- **Prevention of Bypass**: Writes cannot be forced through the eval tool or subshells. The `git`/`gh` shims on `PATH` intercept unauthorized attempts and print a guidance message directing the agent to use the bash tool or stop.
- **Boundary Limits**: This model is not hermetic. It does not prevent code from fetching secrets via alternative means (e.g., direct macOS keychain access via other tools, hardcoded tokens, or raw HTTPS calls to the API). Only launch-level credential isolation closes these gaps.

## GPG Signing
Bot commits are signed with a bot-owned GPG key located in `~/.config/git-bot-identity/gnupg/`.

- **Isolation**: The extension sets `GNUPGHOME` to this directory, ensuring the human's primary keyring is never consulted.
- **Passphrase-less**: Keys are generated without passphrases to allow automated signing without pinentry.
- **Provisioning**: The signing key is resolved in precedence order — `signingKeyFile` (import one mounted secret key; multi-host) → `signingKey` (an id already in the bot keyring) → generate one on first write (single-host).
- **Fail-closed**: If key generation or signing fails, the write operation is blocked.

## Security
- **Fail-closed Model**: Write-class calls are blocked if required credentials (`name`, `email`, `token`) are missing or invalid. Read-only calls proceed without credentials.
+ **Strict Identity**: The bot identity is isolated and never falls back to the human identity for write actions.

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
