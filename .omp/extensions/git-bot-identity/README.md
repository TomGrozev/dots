# Git Bot Identity Extension

Provides a secure, isolated bot identity for Git and GitHub operations within the Oh My Pi harness using a block-by-default credential model.

- **Bot Identity**: Operates as a dedicated GitHub account for write actions.
- **Human Co-author**: Automatically adds `Co-authored-by` trailers to bot commits.
- **Fail-closed**: Write operations are blocked by default and only granted for classified writes when valid agent credentials are configured.

## Why an Extension
This is an OMP extension, utilizing the runtime `ExtensionAPI` for auto-discovery from `.omp/extensions/`.

## Setup

### Interactive setup (recommended)

The extension provides an interactive wizard to automate identity and key provisioning, accessible via the `/git-bot-setup` command. If no configuration exists on launch, the extension shows a non-blocking notification prompting you to run this command. A notification is used instead of a dialog to avoid blocking other extension interfaces and to prevent triggering the 30s handler timeout.

**The Wizard Flow:**

1. **PAT entry** — Prompts for the agent account PAT. Use a **classic** PAT with the `repo` scope — a fine-grained token cannot write to a repo owned by a different personal account, even as a collaborator (see [Personal Access Token](#2-personal-access-token-pat) below). *Note: the token is visible while typing in this version; the dialog clears on submit.* Masked entry is a planned follow-up.
2. **Authentication (hard gate)** — Validates the PAT via `gh api user`. Failure to authenticate aborts the setup.
3. **Identity derivation** — Derives `name` and `email` (`{id}+{login}@users.noreply.github.com`) from the GitHub account, allowing manual overrides for both.
4. **Signing key provisioning** — Offers three options:
   - **Generate a new key**: Creates a fresh passphrase-less key in the isolated bot keyring.
   - **Import from a file**: Imports an armored, passphrase-less secret key from a provided path. This is already file-based — the path is recorded as `signingKeyFile` and no storage question is asked. Absolute and `~`-prefixed paths are both accepted; a leading `~` is expanded against the bot host's home directory by the extension (gpg itself never expands it).
   - **Keyring selection**: Lists secret keys from your primary GPG keyring, exports the chosen key, and imports it into the isolated bot keyring.
5. **Signing smoke test (hard gate)** — Signs a throwaway payload with the resolved key. Failure aborts the setup.
6. **Storage destination** — After the smoke test, for "Generate a new key" and "Keyring selection" the wizard asks where the secret should live:
   - **Save to a file** (portable): writes the armored secret to `~/.config/git-bot-identity/signing-key.asc` (0600) and records `signingKeyFile`. The same key can be provisioned on other hosts / CI / Coder workspaces by copying the file contents (e.g. into Coder secrets) — one key and one GitHub-registered public key everywhere, instead of a new key per host.
   - **Keep in the keyring only** (local): the secret never leaves the isolated keyring and no extra secret file sits on disk — but nothing is migratable; a new host means generating a new key and registering its public half on GitHub again.
7. **GitHub registration (soft)** — Attempts to register the public key on the GitHub account via API. If this fails, the wizard prints the armored public key and a link to **Settings > Keys** for manual paste. Never blocks the setup.
8. **Persistence** — Writes `~/.config/git-bot-identity/config.json` with mode 0600, recording exactly one of `signingKey` or `signingKeyFile`.

Re-running `/git-bot-setup` while configured allows targeted reconfiguration of the PAT, signing key, or derived identity, plus one conversion action: **Export current signing key to a file** converts an existing keyring-only key to the file form (`signing-key.asc` + `signingKeyFile`) without regenerating it. It is the same key, so the public half already registered on GitHub stays valid and no re-registration happens.

---

### Manual setup (alternative)

For advanced cases or multi-host deployments, you can configure the bot identity manually. The wizard above automates these steps.

#### 1. GitHub Account


Create a dedicated GitHub account to serve as the agent's identity.

#### 2. Personal Access Token (PAT)

**Use a classic PAT, not a fine-grained one.** The agent is a *separate* GitHub account
(a collaborator), and the repositories it writes to are typically owned by *you* (a personal
account), not by the agent. A fine-grained PAT is scoped to a single resource owner and, for a
personal-account owner, can only reach repositories owned by the token's own account — it
**cannot** act on a repo owned by a different personal account even when the agent is a
collaborator. So a fine-grained `contents:write` token authenticates and reads fine but is
denied write repo-wide (a `403 Permission … denied`). Classic PATs carry the account's full
collaborator access and are not owner-scoped, so they work here.

Generate a **classic** PAT on the agent account:

- **Scope**: `repo` — required. This grants push/pull to repositories the agent collaborates
  on. `repo` is coarse (it covers every repo the account can reach), but the agent account is
  itself the security boundary: it is a dedicated identity, separate from yours, added only to
  the repositories it should touch. Scope its *collaborator membership*, and give the token
  enough to do its job.
- **Scope**: `workflow` — add only if the agent will push commits that modify files under
  `.github/workflows/`; GitHub rejects such pushes without it. Skip it otherwise.
- Everything else (`admin:*`, `delete_repo`, `write:packages`, gists, etc.) — leave off.

> **When a fine-grained PAT *does* work:** only if the repo is owned by the agent account, or
> is owned by an organization that has enabled fine-grained tokens and where the agent is a
> member. In those cases use **Contents: Read and write** (+ **Workflows: R/W** for workflow
> file changes, **Pull requests: R/W** for PR automation). For the common "my repo, agent is a
> collaborator" setup, this path is unavailable — use the classic `repo` token above.

#### 3. GPG Key

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

#### 4. Configuration

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
- **Provisioning**: The signing key is resolved in precedence order — `signingKeyFile` (import one mounted secret key; multi-host) → `signingKey` (an id already in the bot keyring) → generate one on first write (single-host). `signingKeyFile` may be an absolute path or a `~`-prefixed path; a leading `~` is expanded by the extension against the bot host's home directory, since gpg itself never expands it.
- **Fail-closed**: If key generation or signing fails, the write operation is blocked.

## Security

- **Fail-closed Model**: Write-class calls are blocked if required credentials (`name`, `email`, `token`) are missing or invalid. Read-only calls proceed without credentials.
- **Strict Identity**: The bot identity is isolated and never falls back to the human identity for write actions.
- **Credential Storage**: The PAT is stored in plaintext in `config.json`. Masked entry and a secret-store backend are planned follow-ups.

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
- `lib/setup.ts`: Interactive setup wizard and launch prompt.
