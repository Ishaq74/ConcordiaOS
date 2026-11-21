# Security Summary

**Reviewed Files**: 16
**Issues Resolved**: 7

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Command Execution | `server.ts` | 1119–1248 | `/api/script-runner` and `/api/git/push` spawned child processes with shell execution enabled (`shell: true`), allowing shell metacharacters in arguments or working directories to run arbitrary shell commands. | High | Fixed | Removed `shell: true` across `ensureRepo`, `/api/script-runner`, `/api/dev-server`, and `/api/git/push`; added strict command (`npm`, `npx`, `pnpm`, `bun`, `bunx`, `git`, `node`, `grep`), git subcommand, and flag (`node -e/-p`) allowlists via `execFile`. |
| API Key Handling | `vite.config.ts`, `src/apps/OfficeApp.tsx` | 6–20 / 496, 754, 1062 | `vite.config.ts` injected `GEMINI_API_KEY` into the frontend bundle and `OfficeApp.tsx` initialized `@google/genai` directly in the browser. | High | Fixed | Removed `loadEnv` and `define` from `vite.config.ts`, removed `@google/genai` from frontend bundles, and routed all AI requests through server-side `/api/gemini/*` endpoints reading `process.env.GEMINI_API_KEY`. |
| SSRF & Image Fetching | `server.ts` | 72–117, 729–819 | Server-side image inspection needed strict origin checks so remote image URLs could not target localhost or private cloud metadata IPs. | High | Fixed | Added `assertSafeRemoteUrl` validating `http:`/`https:` schemes, blocking local hostnames, resolving DNS records, rejecting private/loopback IP ranges (`isPrivateIp`), enforcing `image/*` MIME checks, and enforcing a 5 MB download cap and 8 s timeout. |
| Path Traversal & Repo Integrity | `server.ts` | 38–53, 875–979 | File read/write/delete endpoints needed strict path confinement and protection against overwriting `.git`, `node_modules`, `pg-data`, or `pg-databases`. | High | Fixed | Centralized `resolveRepoPath` (null-byte rejection + `path.resolve` prefix check with `path.sep`) and `isProtectedPath` blocking writes/deletes inside `.git`, `node_modules`, `pg-data`, and `pg-databases`; enforced `isValidDbName` on multi-DB operations. |
| Unrestricted File Upload | `server.ts` | 639–685 | `multer` stored arbitrary uploaded file types without size caps or filename sanitization, and `OfficeApp` referenced `originalname` instead of the sanitized filename. | Medium | Fixed | Added 10 MB per-file and 10-file limits, strict image extension + `image/*` MIME validation, safe slugged filename generation, and updated `OfficeApp` to use `json.files[0].path` / `filename`. |
| Grep Option Injection | `src/apps/I18nApp.tsx` | 857 | Passing search terms directly to `grep -rI <query> src/` allowed leading-hyphen terms like `--exclude` or `-f` to be parsed as `grep` flags. | Medium | Fixed | Inserted `--` before the search pattern (`['-rI', '--', query, 'src/']`) and handled exit code `1` (0 matches) gracefully on the server. |
| Untrusted Custom URLs | `src/apps/OfficeApp.tsx` | 202–212, 1180 | Custom image URLs accepted arbitrary schemes (`javascript:`, `data:text/html`) into image fields. | Low | Fixed | Added `isValidImageInput` validating `https://`, `http://`, or relative `/...` paths (rejecting protocol-relative `//`) before storing custom image URLs. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Server-Side AI Proxy | `server.ts` | `getGeminiClient()` loads `process.env.GEMINI_API_KEY` exclusively on the Express backend; no credentials reach Vite client bundles. |
| Filesystem Confinement | `server.ts` | `resolveRepoPath()` and `isProtectedPath()` confine all reads, writes, deletes, and `cwd` overrides within `concordia_repo` while protecting `.git`, `node_modules`, `pg-data`, and `pg-databases`. |
| Database Identifier Validation | `server.ts` | `isValidDbName()` enforces `/^[a-zA-Z0-9_-]{1,63}$/` before creating, switching, or deleting PGlite database directories under `concordia_repo/pg-databases`. |
| Seed Export & Filename Validation | `server.ts` | `/api/seeds/:file` enforces `/^[a-zA-Z0-9_-]+\.data\.ts$/` on filenames and `/^[a-zA-Z_$][a-zA-Z0-9_$]*$/` on `exportKey` identifiers before writing TypeScript seed files. |
| Dependency Security | `package.json` | Upgraded `multer` to `^2.1.1` and `@google/genai` to `^1.45.0`. |

## PoC Verification

### 1. Command Injection Blocked in `/api/script-runner`

#### Summary
| Field | Value |
|---|---|
| Issue Type | OS Command Execution Injection |
| Impact | High |
| Affected File | `server.ts:1119–1179` |
| Test Scenario | `POST /api/script-runner` with `{ "command": "npm", "args": ["run", "build; cat /etc/passwd"], "cwd": "../../" }` or `{ "command": "node", "args": ["-e", "process.exit(1)"] }` |

#### How It Was Fixed
Removed shell interpretation (`shell: true`) and replaced `exec` with `execFileAsync`, combined with command, git-subcommand, `node` inline-eval, and `cwd` path-confinement validation.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Payload arrives at `app.post("/api/script-runner", ...)` | Handler parses `command`, `args`, `cwd` |
| 2 | `ALLOWED_COMMANDS.has(command)` checks allowlist (`server.ts:1125`) and blocks `node -e/-p` (`server.ts:1137`) | Disallowed commands/eval return HTTP `403` |
| 3 | `resolveRepoPath(cwd)` resolves `"../../"` outside `REPO_PATH` (`server.ts:1148`) | Returns `null` -> HTTP `403 Access denied` |
| 4 | Even with valid `cwd`, `execFileAsync(command, cleanArgs, { cwd: execCwd })` (`server.ts:1154`) passes arguments verbatim without invoking `/bin/sh` | Shell metacharacters `;`, `&&`, `$(...)` cannot execute |

#### Conclusion
**Fix Verified** - Neither path escapes in `cwd`, inline `node` evaluation, nor shell metacharacters in `args` can execute arbitrary OS commands.

---

### 2. SSRF Blocked in `/api/gemini/alt-text`

#### Summary
| Field | Value |
|---|---|
| Issue Type | Server-Side Request Forgery (SSRF) |
| Impact | High |
| Affected File | `server.ts:99–117`, `server.ts:729–773` |
| Test Scenario | `POST /api/gemini/alt-text` with `{ "imageUrl": "http://169.254.169.254/latest/meta-data/" }` or `{ "imageUrl": "file:///etc/passwd" }` |

#### How It Was Fixed
Enforced scheme validation (`http:`/`https:`), blocked local/internal hostnames, resolved DNS records via `dns.lookup(..., { all: true })`, and rejected all loopback, link-local, and RFC 1918 private IPs via `isPrivateIp`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Request enters `/api/gemini/alt-text` (`server.ts:729`) | Checks whether `imageUrl` starts with `/images/` |
| 2 | Non-local URL enters `assertSafeRemoteUrl(imageUrl)` (`server.ts:99–117`) | `file://` rejected at `server.ts:101`; `169.254.169.254` checked by `net.isIP(host)` + `isPrivateIp(host)` (`server.ts:108–109`) |
| 3 | Safeguard throws error before `fetch()` (`server.ts:759`) runs | HTTP `500` returned without making an internal network request |

#### Conclusion
**Fix Verified** - Metadata endpoints, loopback interfaces, and non-HTTP schemes are rejected prior to any outbound HTTP request.

---

### 3. Path Traversal Blocked in Filesystem Routes

#### Summary
| Field | Value |
|---|---|
| Issue Type | Path Traversal & Protected Directory Tampering |
| Impact | High |
| Affected File | `server.ts:38–53`, `server.ts:875–979` |
| Test Scenario | `GET /api/fs/read?path=../../package.json` or `POST /api/fs/write` with `{ "path": ".git/config", "content": "..." }` |

#### How It Was Fixed
Added `resolveRepoPath` normalizing paths against `REPO_PATH` with separator boundary enforcement, and `isProtectedPath` blocking writes/deletes into `.git`, `node_modules`, `pg-data`, and `pg-databases`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Request enters `/api/fs/read` (`server.ts:875`) or `/api/fs/write` (`server.ts:925`) | Passes `targetPath` to `resolveRepoPath` |
| 2 | `path.resolve(REPO_PATH, "../../package.json")` resolves outside `REPO_PATH` (`server.ts:42–45`) | `resolveRepoPath` returns `null` -> HTTP `403 Access denied` |
| 3 | `".git/config"` resolves inside `REPO_PATH`, then hits `isProtectedPath(fullPath)` (`server.ts:49–53`, `936`) | Top-level directory `".git"` triggers HTTP `403 Access denied` |

#### Conclusion
**Fix Verified** - Files outside `concordia_repo` and critical repository internals cannot be read, overwritten, or deleted.

---

### 4. Client Bundle API Key Exposure Eliminated

#### Summary
| Field | Value |
|---|---|
| Issue Type | Client-Side Credential Exposure |
| Impact | High |
| Affected File | `vite.config.ts:6–20`, `server.ts:56–69`, `src/apps/OfficeApp.tsx:496,754,1062` |
| Test Scenario | Inspect Vite build output (`dist/assets/*.js`) for `GEMINI_API_KEY` or browser-side `@google/genai` initialization |

#### How It Was Fixed
Removed `define: { 'process.env.GEMINI_API_KEY': ... }` from `vite.config.ts`, removed `@google/genai` from client imports, and moved all Gemini SDK calls to `/api/gemini/generate`, `/api/gemini/alt-text`, and `/api/gemini/translate`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `vite build` bundles `src/**` using `vite.config.ts` | No env-var replacement occurs (`define` removed) |
| 2 | User clicks AI Write, SEO, Alt Text, or Translate in `OfficeApp.tsx` or `I18nApp.tsx` | Browser posts JSON payload to `/api/gemini/*` |
| 3 | Express handler calls `getGeminiClient()` (`server.ts:56–69`) reading `process.env.GEMINI_API_KEY` on server | API key stays strictly server-side |

#### Conclusion
**Fix Verified** - The Gemini API key is never embedded in client JavaScript assets or transmitted from the browser.
