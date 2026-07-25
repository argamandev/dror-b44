# Base44 Platform — Ground-Truth Facts

Extracted verbatim (quoted where possible) from the Base44 skill docs installed at
`.agents/skills/` (base44-cli, base44-sdk, base44-remote-dev, base44-sandbox,
base44-troubleshooter). Source: `base44` CLI package version `0.1.5` (per
`base44-cli/SKILL.md` frontmatter `sourcePackage`). Where the docs are silent, this
file says **NOT DOCUMENTED** rather than filling the gap from general knowledge.

Two development modes exist in these docs and they are **not interchangeable**:

- **Local project mode** (`base44-cli` + `base44-sdk`): a checked-out project with a
  `base44/` folder; you run `entities push` / `functions deploy` / `agents push` /
  `deploy` to ship changes.
- **Remote sandbox mode** (`base44-remote-dev` + `base44-sandbox`): no local
  checkout; a coding agent edits files directly in Base44's cloud sandbox over MCP
  (or the `base44 sandbox` CLI) and **writing the file is the deploy** — no push/deploy
  commands are run at all.

This sheet documents both where they differ, since which one applies depends on how
the Dror Base44 rebuild is actually being developed.

---

## 1. Project layout

`npx base44 create <name> --path <path> --template backend-and-client` produces (per
`base44-cli/SKILL.md`):

```
my-app/
├── base44/                      # Base44 configuration (created by CLI)
│   ├── config.jsonc             # Project settings, site config
│   ├── .types/                  # Auto-generated TypeScript types (created by `types generate`)
│   │   └── types.d.ts           # Module augmentation for @base44/sdk
│   ├── entities/                # Entity schema definitions
│   │   ├── task.jsonc
│   │   └── board.jsonc
│   ├── functions/               # Backend functions (optional)
│   │   └── my-function/
│   │       └── entry.ts
│   ├── agents/                  # Agent configurations (optional)
│   │   └── support_agent.jsonc
│   └── connectors/              # OAuth connector configurations (optional)
│       └── googlecalendar.jsonc
├── src/                         # Frontend source code
│   ├── api/
│   │   └── base44Client.js      # Base44 SDK client
│   ├── pages/
│   ├── components/
│   └── main.jsx
├── index.html                   # SPA entry point
├── package.json
└── vite.config.js               # Or your framework's config
```

Also created by `create`: `base44/.app.jsonc` (holds the app ID; should be
git-ignored per `scaffold.md`).

Two templates (`create.md`):

| Template ID | When to use |
|---|---|
| `backend-and-client` | New full-stack app — Vite + React + Tailwind, generated for you |
| `backend-only` | Add Base44 to an existing frontend project (Next.js, Vue, Svelte, etc.) — adds **no** frontend |

`base44 scaffold` (for an app already provisioned externally, e.g. via Stripe
Projects) always uses the `backend-only` template and does **not** push
entities/deploy the site.

### `config.jsonc` fields

```jsonc
{
  "name": "My App",                    // Required: project name
  "description": "App description",    // Optional: project description
  "visibility": "public",              // Optional: "public" | "private" | "workspace"
  "entitiesDir": "./entities",         // Optional: default "entities"
  "functionsDir": "./functions",       // Optional: default "functions"
  "agentsDir": "./agents",             // Optional: default "agents"
  "connectorsDir": "./connectors",     // Optional: default "connectors"
  "site": {                            // Optional: site deployment config
    "installCommand": "npm install",   // Optional: install dependencies
    "buildCommand": "npm run build",   // Optional: build command
    "serveCommand": "npm run dev",     // Optional: local dev server
    "outputDirectory": "./dist"        // Optional: build output directory
  }
}
```

| Property | Description | Default |
|---|---|---|
| `name` | Project name (required) | - |
| `description` | Project description | - |
| `visibility` | `public`, `private`, or `workspace` | - |
| `entitiesDir` | Entity schema dir | `"entities"` |
| `functionsDir` | Backend function dir | `"functions"` |
| `agentsDir` | Agent config dir | `"agents"` |
| `connectorsDir` | Connector config dir | `"connectors"` |
| `site.installCommand` | Install deps | - |
| `site.buildCommand` | Build command | - |
| `site.serveCommand` | Local dev server command | - |
| `site.outputDirectory` | Build output dir for deployment | - |

`auth-pull.md` additionally references an `authDir` config property ("The auth
config file is written to `base44/auth/` (the `authDir` configured in
`config.jsonc`)") — its default value and whether it appears in the config table
above is **NOT DOCUMENTED** (the main config-property table in `SKILL.md` does not
list `authDir`).

**Remote-sandbox mode note:** in `base44-sandbox`, entity/function/agent config files
are written directly and auto-sync (~5s debounced auto-commit) — there is no
`entities push`/`functions deploy`/`agents push`/`deploy` step; those CLI commands
are explicitly **not** to be run there.

---

## 2. Entities

**File naming:** `base44/entities/{kebab-case-name}.jsonc` for a PascalCase entity
`name` (e.g. `TeamMember` → `team-member.jsonc`). Entity `name` pattern:
`/^[a-zA-Z0-9]+$/`. Field names: snake_case.

### Schema format (from `entities-create.md`)

```jsonc
{
  "name": "EntityName",       // PascalCase entity name
  "type": "object",           // Always "object" — top level, NOT nested under a "schema" key
  "properties": {
    "field_name": {
      "type": "string",
      "description": "Field description"
    }
  },
  "required": ["field_name"]
}
```

Common mistake called out explicitly: wrapping `type`/`properties` inside a nested
`"schema": { ... }` object — this causes `"Invalid schema: Schema must have a 'type'
field"` on push.

**Field types:** `string`, `number`, `integer`, `boolean`, `array`, `object`, `binary`.
**String `format` values:** `date`, `date-time`, `time`, `email`, `uri`, `hostname`,
`ipv4`, `ipv6`, `uuid`, `file`, `regex`, `richtext`.
**Field properties:** `type`, `description`, `enum`, `enumNames`, `default`, `format`,
`items`, `properties`, `$ref`, `minLength`, `maxLength`, `pattern`, `minimum`,
`maximum`, `rls` (field-level security, see below).

### RLS syntax (entity-level, in the `rls` key of the schema)

Five operations: `create`, `read`, `update`, `delete`, `write` (shorthand for create+
update+delete). Each accepts `true` (allow all incl. anonymous), `false` (block all),
or a condition object. **If no `rls` is defined, all records are accessible to all
users.**

Template variables: `{{user.id}}`, `{{user.email}}`, `{{user.role}}`,
`{{user.data.field_name}}`. Built-in record attributes usable in conditions: `id`,
`created_date`, `updated_date`, `created_by`.

Two condition forms:
```jsonc
{ "created_by": "{{user.email}}" }                 // entity-field-to-user comparison
{ "user_condition": { "role": "admin" } }          // user property check (equality only)
```
Entity-field conditions on custom fields need a `data.` prefix: `{ "data.status":
"published" }`. Supported operators: logical `$or`, `$and`, `$nor`; and, **only for
`data.*` fields**, `$in`, `$nin`, `$ne`, `$all`. `user_condition` supports **equality
only** — no operators, no `$gt`/`$lt`/`$regex`/`$expr`/`$where`.

Full example (`rls-examples.md`):
```jsonc
{
  "name": "Task",
  "type": "object",
  "properties": {
    "title": { "type": "string" },
    "status": { "type": "string", "enum": ["todo", "in_progress", "done"] }
  },
  "rls": {
    "create": true,
    "read": {
      "$or": [
        { "created_by": "{{user.email}}" },
        { "user_condition": { "role": "admin" } }
      ]
    },
    "update": { "$or": [{ "created_by": "{{user.email}}" }, { "user_condition": { "role": "admin" } }] },
    "delete": { "user_condition": { "role": "admin" } }
  }
}
```

**Field-level security (FLS):** same operation set, declared inside a field's own
schema via its `rls` key, e.g.:
```jsonc
"salary": {
  "type": "number",
  "rls": {
    "read": { "user_condition": { "role": "hr" } },
    "update": { "user_condition": { "role": "hr" } }
  }
}
```
If no field-level `rls` is set, the field inherits entity-level rules.

**Not supported anywhere in RLS/FLS:** `$gt`, `$lt`, `$gte`, `$lte`, `$regex` — use
backend functions for those. Complex "owner OR admin"-style multi-condition access is
now expressible via `$or`/`$and`; genuinely complex business logic still needs the
Dashboard UI, split entities, or backend functions.

### Auto/server fields

Per the SDK's `entities.md` `ServerEntityFields` type, every record automatically
gets:
```typescript
interface ServerEntityFields {
  id: string;
  created_date: string;
  updated_date: string;
  created_by?: string | null;
  created_by_id?: string | null;
  is_sample?: boolean;
}
```

### Pushing entities

```bash
npx base44 entities push
```
Pushes **all** entities in `base44/entities/` — full sync: reports `Created`,
`Updated`, `Deleted` (entities removed locally are deleted remotely). Syncs schema
only, not data.

**Remote-sandbox mode:** no `entities push` — writing the `.jsonc` file into the
sandbox auto-syncs it.

### TypeScript type generation

```bash
npx base44 types generate
```
No auth required, runs entirely locally. Reads `base44/entities|functions|agents|
connectors/`, writes `base44/.types/types.d.ts`, and (if `tsconfig.json` exists) adds
`base44/.types/*.d.ts` to its `include` array. Generated file augments `@base44/sdk`
with `EntityTypeRegistry`, `FunctionNameRegistry`, `AgentNameRegistry`,
`ConnectorTypeRegistry`:

```typescript
export interface Task {
  title: string;
  status: "todo" | "in_progress" | "done";
  assignee?: string;
}

declare module '@base44/sdk' {
  interface EntityTypeRegistry {
    "Task": Task;
  }
  interface FunctionNameRegistry {
    "send_email": true;
  }
  interface AgentNameRegistry {
    "support_agent": true;
  }
  interface ConnectorTypeRegistry {
    "googlecalendar": true;
  }
}
```

---

## 3. SDK client (frontend)

Install: `npm install @base44/sdk` (never pin a version).

### Import + `createClient` signature

```javascript
import { createClient } from "@base44/sdk";

// The parameter is 'appId' — NOT 'clientId' or 'id'
const base44 = createClient({
  appId: "your-app-id",          // Required
  token: "optional-user-token",  // Optional: pre-authenticated user token
  options: {                      // Optional
    onError: (error) => {         // Must be nested in `options`, not top-level
      console.error("Base44 error:", error);
    }
  }
});
```

TypeScript config type (`client.md`):
```typescript
interface CreateClientConfig {
  appId: string;
  token?: string;
  serviceToken?: string;   // @internal — only auto-set in Base44-hosted backend functions
  options?: CreateClientOptions;
}
interface CreateClientOptions {
  onError?: (error: Error) => void;
}
```

Inside a Base44-generated app, a pre-configured client is importable from
`@/api/base44Client` and used as `base44` directly (no manual `createClient` call
needed).

Client methods: `base44.setToken(newToken)`, `base44.cleanup()` (disconnects
WebSocket connections — call on unmount).

### Auth methods (`base44.auth`, from `auth.md` / `QUICK_REFERENCE.md`)

```typescript
interface AuthModule {
  me(): Promise<User>;
  updateMe(data: Partial<Omit<User, 'id' | 'created_date' | 'updated_date' | 'app_id' | 'is_service'>>): Promise<User>;
  isAuthenticated(): Promise<boolean>;

  loginViaEmailPassword(email: string, password: string, turnstileToken?: string): Promise<LoginResponse>;
  loginWithProvider(provider: 'google' | 'microsoft' | 'facebook', fromUrl?: string): void;
  logout(redirectUrl?: string): void;
  redirectToLogin(nextUrl: string): void;   // ⚠️ avoid — prefer custom UI

  setToken(token: string, saveToStorage?: boolean): void;

  register(params: RegisterParams): Promise<any>;
  verifyOtp(params: VerifyOtpParams): Promise<any>;
  resendOtp(email: string): Promise<any>;

  inviteUser(userEmail: string, role: string): Promise<any>;

  resetPasswordRequest(email: string): Promise<any>;
  resetPassword(params: ResetPasswordParams): Promise<any>;
  changePassword(params: ChangePasswordParams): Promise<any>;
}
```

**Email/password signup is `register()`, not `signUp()`.** Full flow (register → OTP
email → `verifyOtp()` → `loginViaEmailPassword()`); a user **cannot log in before
verifying**:
```javascript
await base44.auth.register({ email, password, referral_code, turnstile_token });
await base44.auth.verifyOtp({ email, otpCode: "123456" });
const { user, access_token } = await base44.auth.loginViaEmailPassword(email, password);
```

`RegisterParams`: `{ email: string; password: string; turnstile_token?: string | null; referral_code?: string | null; }`

`logout(redirectUrl?)` — "redirects the user to the server-side logout endpoint
(`/api/apps/auth/logout`) to clear HTTP-only cookies and the session, then redirects
to the given URL (or the current page if omitted)."

`me()` returns:
```typescript
interface User {
  id: string; created_date: string; updated_date: string; email: string;
  full_name: string | null; disabled: boolean | null; is_verified: boolean;
  app_id: string; is_service: boolean; role: string; [key: string]: any;
}
```

**Confirmed hallucination table** (`base44-sdk/SKILL.md`) — do not use these:
`signInWithGoogle()`, `signInWithProvider()`, `auth.google()`,
`signInWithEmailAndPassword()`, `signIn()`, `createUser()`/`signUp()`,
`onAuthStateChanged()`, `currentUser` property — all wrong; correct forms are
`loginWithProvider('google')`, `loginViaEmailPassword(email, pw)`, `register({email,
password})`, and `await auth.me()` respectively.

### Entity CRUD methods (`base44.entities.EntityName.*`)

```typescript
interface EntityHandler<T = any> {
  list<K extends keyof T = keyof T>(sort?: SortField<T>, limit?: number, skip?: number, fields?: K[]): Promise<Pick<T, K>[]>;
  filter<K extends keyof T = keyof T>(query: Partial<T>, sort?: SortField<T>, limit?: number, skip?: number, fields?: K[]): Promise<Pick<T, K>[]>;
  get(id: string): Promise<T>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<DeleteResult>;
  deleteMany(query: Partial<T>): Promise<DeleteManyResult>;
  bulkCreate(data: Partial<T>[]): Promise<T[]>;
  updateMany(query: Partial<T>, data: Record<string, Record<string, any>>): Promise<UpdateManyResult>;  // MongoDB-style, e.g. { $set: {...} }
  bulkUpdate(data: (Partial<T> & { id: string })[]): Promise<T[]>;
  importEntities(file: File): Promise<ImportResult<T>>;   // frontend only
  subscribe(callback: RealtimeCallback<T>): () => void;   // realtime, returns unsubscribe fn
}
```

**`list`/`filter` sort param** is `SortField<T>`: field name, optional `-` prefix for
descending (e.g. `"-created_date"`). **Max limit is 5,000 items per request** for
both `list()` and `filter()`.

```javascript
const pendingTasks = await base44.entities.Task.filter(
  { status: "pending", assignedTo: userId },  // query
  "-created_date",                             // sort
  10,                                          // limit
  0                                            // skip
);
```

Confirmed hallucination table: `find()`→`filter()`, `findOne(id)`→`get(id)`,
`insert(data)`→`create(data)`, `remove(id)`→`delete(id)`, `onChange(cb)`→
`subscribe(cb)`.

**User entity:** built-in; regular users can only read/update their own record;
cannot `create()` users (use `auth.register()`); service role has full access.

**RLS/service-role note:** `asServiceRole` sets the caller's role to `"admin"` but
does **not** bypass RLS — your RLS rules must explicitly grant admin access (e.g.
`{ "user_condition": { "role": "admin" } }`) for service-role calls to succeed.

---

## 4. Backend functions

### File location & discovery

```
base44/
  functions/
    process-order/
      entry.ts
```

Function name = path from `base44/functions/` to the folder containing `entry.ts` (or
`entry.js`), e.g. `base44/functions/orders/process/entry.ts` → function name
`orders/process`. `entry.ts`/`entry.js` must be inside a **named subfolder** — not
directly in `base44/functions/`. All `*.js/*.ts/*.json/*.jsonc` files in the function
folder are included on deploy (multi-file functions can `import` each other with
relative paths, extension included). Shared code across functions must live in
`base44/shared/` — the only directory outside a function folder that gets uploaded
(reachable via `../../shared/...` relative imports; imports that escape `base44/`
entirely fail at deploy time).

**Remote-sandbox mode difference:** "no `function.jsonc` is required (the sandbox
infers the function from the directory; the config file is ignored in this mode)" —
you only create `entry.ts`.

### Handler pattern (Deno)

Functions run on **Deno**, not Node.js, exported via `Deno.serve()`. npm packages use
the `npm:` specifier prefix.

```typescript
import { createClientFromRequest } from "npm:@base44/sdk";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);   // inherits the caller's auth
  const { orderId } = await req.json();
  const order = await base44.entities.Orders.get(orderId);
  return Response.json({ success: true, order });
});
```

**Exact import for the request-authenticated client:** `import {
createClientFromRequest } from "npm:@base44/sdk"` inside `entry.ts` (in the
`base44-sdk` reference docs the same import is shown without the `npm:` prefix —
`import { createClientFromRequest } from "@base44/sdk"` — but the CLI/functions-create
docs and every concrete `entry.ts` example consistently use the `npm:` specifier,
which is required for Deno). **No specific version is pinned anywhere in the
docs** — always shown unpinned as `npm:@base44/sdk`.

`createClientFromRequest(req)` "extracts auth from request headers that Base44
injects and returns a client that includes service role access
(`base44.asServiceRole`)."

Admin ops: `base44.asServiceRole.entities.Orders.list()` etc. Secrets:
`Deno.env.get("KEY_NAME")`. Responses: `Response.json(body, { status })`.

### Invoking a function from the frontend SDK

```typescript
interface FunctionsModule {
  invoke(functionName: FunctionName, data?: Record<string, any>): Promise<any>;
  fetch(path: string, init?: RequestInit): Promise<Response>;
}
```

```javascript
const res = await base44.functions.invoke("processOrder", { orderId, action: "ship" });
const result = res.data; // ⚠️ invoke() returns the RAW axios response — the function's
                          // JSON is on `.data`, not the top-level object.
// Throws on non-2xx; error body at err.response.data
```

`functions.fetch(path, init?)` is the low-level escape hatch — returns a native
`Response`, used for SSE/streaming responses or custom HTTP methods
(`base44.functions.fetch("/stream-data", { method: "POST", ... })`, read via
`response.body.getReader()`).

Also callable via plain HTTP: `POST https://<app-domain>/functions/<function-name>`.

Confirmed hallucination table: `functions.call()`, `functions.run()`,
`callFunction()`, `httpsCallable()(data)` are all wrong — correct is
`functions.invoke(name, data)`.

### Push / deploy functions

```bash
npx base44 functions deploy [names...] [--force]
npx base44 functions delete <names...>
npx base44 functions list
npx base44 functions pull [name]
```
- No `[names...]` → deploys all.
- `--force` deletes remote functions no longer present locally; cannot combine with
  explicit names.
- Reports `deployed` / `unchanged` / `error` per function; exit code 1 if any failed
  (CI-safe).

**Remote-sandbox mode:** no deploy command — writing `entry.ts` into the sandbox ships
it directly (auto-commit, ~5s debounce).

### Env secrets (`base44 secrets`)

```bash
npx base44 secrets set API_KEY=abc123 DB_PASSWORD=secret
npx base44 secrets set --env-file .env.production
npx base44 secrets list
npx base44 secrets delete <key>
```
`entries...` are `KEY=VALUE` pairs, or use `--env-file <path>` (mutually exclusive
with inline entries). Overwrites existing secrets of the same name. Requires auth.
Read inside a function with `Deno.env.get("KEY")`.

---

## 5. InvokeLLM

### Call signature

```javascript
base44.integrations.Core.InvokeLLM(params: InvokeLLMParams): Promise<string | object>
```

```typescript
interface InvokeLLMParams {
  prompt: string;                       // required
  add_context_from_internet?: boolean;  // Google Search/Maps/News context
  response_json_schema?: object;        // if set, response is a structured object, not a string
  file_urls?: string[];                 // URLs from UploadFile, for file/image context
}
```

Examples straight from `integrations.md`:
```javascript
// Basic — returns string
const response = await base44.integrations.Core.InvokeLLM({ prompt: "Summarize this text: ..." });

// Structured JSON — returns object
const response = await base44.integrations.Core.InvokeLLM({
  prompt: "Analyze the sentiment of: 'Great product but slow shipping'",
  response_json_schema: {
    type: "object",
    properties: {
      sentiment: { type: "string", enum: ["positive", "negative", "mixed"] },
      score: { type: "number", description: "Score from 1-10" },
      key_points: { type: "array", items: { type: "string" } }
    }
  }
});
// Returns: { sentiment: "mixed", score: 7, key_points: [...] }

// With file/image attachments (uploaded via UploadFile first)
const response = await base44.integrations.Core.InvokeLLM({
  prompt: "Describe what's in this image",
  file_urls: ["https://...uploaded_image.png"]
});
```

**Model selection: NOT DOCUMENTED for `InvokeLLM`.** `InvokeLLMParams` has no `model`
field anywhere in the docs — you cannot choose a model for `InvokeLLM` calls per the
documented API surface. `response_json_schema` behavior is documented only as: "If
provided, returns object instead of string."

**File/image input support:** yes, via `file_urls` (array of URLs previously
returned by `Core.UploadFile`) — described generically as "file attachments" and
demonstrated specifically with an image URL. No separate parameter for inline
base64/binary upload to `InvokeLLM` — files must be uploaded first via `UploadFile`
and passed by URL.

### Claude / model ids — exhaustive search result

A full-text search of every skill file for `claude|opus|sonnet|haiku|anthropic`
(case-insensitive) turned up exactly **one** model-id-shaped string in the entire
doc set, and it is **not** in the `InvokeLLM` docs — it's in the separate **AI
Gateway** module (`ai-gateway.md`), which is a different feature (an
OpenAI-compatible Chat Completions endpoint for building tool-using "code agents" in
backend functions, via `base44.aiGateway.connection()` → `{ baseURL, token }` fed to
an OpenAI-compatible SDK like the Vercel AI SDK):

> "Use **`automatic`** (the default, cheapest) unless the task needs a specific model
> (e.g. `claude_sonnet_4_6`). Non-default models cost more credits — use them only
> when needed, and tell the user."

That is the **only** Claude model id string documented anywhere (`claude_sonnet_4_6`,
given only as a one-off example, not part of an enumerated list). **No exhaustive
list of supported models exists in the docs for either `InvokeLLM` or the AI
Gateway** — no other Claude id (no Opus/Haiku variant, no version-numbered id like
`claude_opus_4_x`) appears anywhere in the skill files. Do not assume any other
Claude model id is valid — this needs to be verified against the live Base44
dashboard/API, not guessed.

AI Gateway usage rules also documented: backend-function only
(`createClientFromRequest`), user-scoped by default (`base44.aiGateway.connection()`
runs with the caller's permissions/RLS; `asServiceRole.aiGateway` for
cross-user/system work), stateless between invocations, **no streaming**, and calls
are metered against the app's credit quota exactly like `InvokeLLM`.

---

## 6. Agents

### Config file format — `base44/agents/{agent_name}.jsonc`

Naming: agent `name` must match `/^[a-z0-9_]+$/` (lowercase, underscores, 1–100
chars); file name must match (underscores, not hyphens).

```jsonc
{
  "name": "agent_name",              // Required: lowercase alphanumeric + underscores, 1-100 chars
  "description": "Brief description of what this agent does",  // Required, min 1 char
  "instructions": "Detailed instructions for the agent's behavior",  // Required, min 1 char
  "tool_configs": [                  // Optional: defaults to []
    { "entity_name": "Task", "allowed_operations": ["read", "create", "update", "delete"] },
    { "function_name": "send_email", "description": "Send an email notification" }
  ],
  "memory_config": {                 // Optional
    "enabled": true,                 // default true
    "scope": "both",                 // "global" | "user" | "both", default "both"
    "include_other_conversation_context": false,  // default false
    "instructions": null             // string | null
  },
  "whatsapp_greeting": "Hello! How can I help you today?"  // Optional
}
```

**Entity tools:** `{ "entity_name": "<PascalCase entity name>", "allowed_operations":
[...] }` where `allowed_operations` is a subset of `["read", "create", "update",
"delete"]`. `entity_name` must match the entity's PascalCase `name` field exactly
(e.g. `"Task"`, not `"task"`).

**Function tools:** `{ "function_name": "<name>", "description": "..." }`.

Confirmed common mistake: do **not** use `"tools": [{ "type": "entity_query",
"entity": "Task" }]` — the correct key is `tool_configs` with `entity_name` +
`allowed_operations`.

`memory_config`: if omitted entirely, the backend default applies and **memory is
enabled**; set `"enabled": false` explicitly to disable it.

### Push/pull

```bash
npx base44 agents push   # full sync — local replaces remote (deletes remote agents not present locally)
npx base44 agents pull   # full sync — remote replaces local
```

**Remote-sandbox mode:** no `agents push`/`pull` — writing the `.jsonc` file
auto-syncs.

### Invocation from the frontend SDK

Agents are **not** invoked with a single "run" call — they're conversational, via
`base44.agents`:

```typescript
interface AgentsModule {
  getConversations(): Promise<AgentConversation[]>;
  getConversation(conversationId: string): Promise<AgentConversation | undefined>;
  listConversations(filterParams: ModelFilterParams): Promise<AgentConversation[]>;
  createConversation(conversation: CreateConversationParams): Promise<AgentConversation>;
  addMessage(conversation: AgentConversation, message: Partial<AgentMessage>): Promise<AgentMessage>;
  subscribeToConversation(conversationId: string, onUpdate?: (conversation: AgentConversation) => void): () => void;
  getWhatsAppConnectURL(agentName: AgentName): string;
}
```

```javascript
const conversation = await base44.agents.createConversation({
  agent_name: "support-agent",
  metadata: { order_id: "ORD-123" }
});
await base44.agents.addMessage(conversation, { role: "user", content: "Hello" });
const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (updated) => {
  setMessages(updated.messages);   // called when new messages arrive
});
```

> "This module requires a logged-in user. All agent methods work in the context of
> the authenticated user."

**Streaming: partial — realtime via WebSocket, not token streaming.**
`subscribeToConversation` gives realtime push updates when new messages
arrive/complete (via WebSocket), but tool-call data on that live feed is **truncated**
(`arguments_string` capped at 500 chars, `results` at 50) — call
`getConversation(id)` afterward for the full stored data. There is no documented
token-by-token SSE streaming API for agent responses (that's explicitly a
non-feature of the separate AI Gateway too — "No streaming").

**Can agents create/update entities? Yes** — via `tool_configs` entity tools with
`allowed_operations` including `create`/`update`/`delete`, subject to that entity's
RLS. The docs stress being explicit in `instructions` about when to use these tools,
since the agent won't proactively query/act on entities without being told to.

**Distinct from "code agents":** `base44.agents` is for **managed, conversational**
in-app chat agents (the platform runs the loop). For **non-conversational,
programmatic** task work (triggered by an entity event/schedule/webhook, your code
owns the loop and tools), the docs point to building a "code agent" on the **AI
Gateway** (`base44.aiGateway.connection()`) instead — a materially different
mechanism, backend-only, using an external agent-loop library (e.g. Vercel AI SDK's
`ToolLoopAgent`) rather than `base44.agents`.

---

## 7. Audio/media integrations

**Exhaustive search result: no transcription, speech-to-text, or text-to-speech
integration exists anywhere in the documented SDK.** A case-insensitive full-text
search of every file in `.agents/skills/` for `transcri|speech|audio|whisper|tts|
text-to-speech` returned **zero matches**. There is no `Core.TranscribeAudio`,
`Core.TextToSpeech`, `Core.SpeechToText`, or any similarly named method documented,
and no mention of audio processing capability at all.

**What does exist (file upload / extraction, from `integrations.md`):**

```typescript
interface CoreIntegrations {
  InvokeLLM(params: InvokeLLMParams): Promise<string | object>;
  GenerateImage(params: GenerateImageParams): Promise<GenerateImageResult>;
  UploadFile(params: UploadFileParams): Promise<UploadFileResult>;
  SendEmail(params: SendEmailParams): Promise<any>;
  ExtractDataFromUploadedFile(params: ExtractDataFromUploadedFileParams): Promise<object>;
  UploadPrivateFile(params: UploadPrivateFileParams): Promise<UploadPrivateFileResult>;
  CreateFileSignedUrl(params: CreateFileSignedUrlParams): Promise<CreateFileSignedUrlResult>;
}
```

- **`Core.UploadFile({ file })` → `{ file_url }`** — uploads to **public** storage.
  ```javascript
  const { file_url } = await base44.integrations.Core.UploadFile({ file: fileInput.files[0] });
  ```
- **`Core.UploadPrivateFile({ file })` → `{ file_uri }`** — private storage, needs a
  signed URL to access.
- **`Core.CreateFileSignedUrl({ file_uri, expires_in? })` → `{ signed_url }`** —
  `expires_in` in seconds, default 300.
- **`Core.ExtractDataFromUploadedFile({ file_url, json_schema })` → `object`** — AI
  extraction of **structured data** from an uploaded file (the shown example is an
  invoice/document, extracting fields like `invoice_number`, `total_amount`). This is
  document/structured-data extraction, not audio transcription, and there is no
  indication in the docs that it accepts or processes audio files at all.
- Functions can also receive a `File` directly: `base44.functions.invoke(name, {
  file, ... })` auto-switches to `multipart/form-data` when a `File` object is
  present in the payload — so a backend function could in principle receive raw
  audio bytes and call an external transcription API itself (e.g. via a connector or
  a secret-configured third-party API key), but **that would be custom code you
  write, not a documented Base44-provided transcription integration.**

**Conclusion for the product decision this section exists to inform:** if Dror's
Base44 rebuild needs audio transcription (e.g. for session recordings) or
text-to-speech, **Base44 has no built-in integration for either** per these docs.
The only documented path is a self-written backend function that calls an external
transcription API (OpenAI Whisper, etc.) directly, using `base44 secrets` for the
API key and either `UploadFile`/`UploadPrivateFile` to store the audio first or a
multipart `functions.invoke()` call to hand the file straight to the function.

---

## 8. Auth config

Auth settings live in `base44/auth/` (local files), synced via `base44 auth pull`/
`base44 auth push`, and are also included in `base44 deploy`. **The exact raw JSON/
jsonc schema of the auth config file is NOT DOCUMENTED** — none of the auth reference
files (`auth-pull.md`, `auth-push.md`, `auth-password-login.md`,
`auth-social-login.md`, `auth-sso.md`) show its raw file contents; the config is
manipulated exclusively through CLI subcommands, not hand-edited as a schema.

### Enabling email/password signup

```bash
npx base44 auth password-login enable
npx base44 auth password-login disable
```
"Updates the local auth config file only — run `npx base44 auth push` or `npx base44
deploy` to apply the change to Base44." Disabling it with no other login method
enabled warns that users will be locked out.

### Social login / SSO

```bash
npx base44 auth social-login <google|microsoft|facebook|apple> <enable|disable> [--client-id ...] [--client-secret ...]
npx base44 auth sso <enable|disable> --provider <google|microsoft|github|okta|custom> --client-id ... [...]
```
Google, Microsoft, Facebook are "Built-in (All Plans)"; Okta, Azure AD, GitHub are
listed as "SSO Providers (Elite Plan)" in `auth.md`. **SSO and social login are
mutually exclusive** — enabling one disables the other in the local config. OAuth
client secrets are stored in Base44's secrets store, not the local config file.

### Invite/verification behavior

- **Registration → OTP verification → login**, not immediate login: `register()`
  sends a verification email with an OTP code; `verifyOtp({ email, otpCode })` must
  succeed before `loginViaEmailPassword()` will work. `resendOtp(email)` is available
  and rate-limited.
- **Admin invites:** `base44.auth.inviteUser(userEmail, role)` (also mirrored on
  `base44.users.inviteUser()`) sends an invitation email; typically requires admin
  privileges (403 if not authorized).
- **Password reset:** `resetPasswordRequest(email)` → email with reset token →
  `resetPassword({ resetToken, newPassword })`.
- **App visibility** (`public`/`private`, set via `base44 visibility <level>` or
  `config.jsonc`'s `visibility` field) gates whether unauthenticated users can view
  any content: public apps allow anonymous browsing of public content, private apps
  redirect unauthenticated users to login for everything.

---

## 9. Hosting/deploy

### Site config (`config.jsonc` → `site`)

```jsonc
"site": {
  "installCommand": "npm install",
  "buildCommand": "npm run build",
  "serveCommand": "npm run dev",
  "outputDirectory": "./dist"
}
```
`outputDirectory` examples by framework (`site-deploy.md`): Vite → `./dist`, Next.js
→ `./.next` or `./out`, CRA → `./build`.

### `base44 deploy` behavior

```bash
npx base44 deploy [-y|--yes]
```
Deploys, in sequence: entity schemas → functions → agent configs → connector configs
→ auth config → app visibility (if configured) → site files. `-y` skips the
confirmation prompt (needed for CI/agent use). Does **not** run your build for you —
`npm run build` must be run first. Prints the dashboard URL and the deployed app URL
on success. If any new connectors need OAuth, prompts to complete it in a browser
(skipped automatically in non-interactive/no-TTY environments).

### `base44 site deploy` (site only)

```bash
npx base44 site deploy [-y|--yes]
```
Archives `site.outputDirectory` and uploads it; **SPA only** — "Base44 hosting
supports Single Page Applications with a single `index.html` entry point. All routes
are served from `index.html` (client-side routing)." Previous deployments are
versioned/preserved.

### Deployed URL pattern

From the documented example output of `site deploy`:
```
Visit your site at: https://my-app.base44.app
```
i.e. `https://<app-name>.base44.app`. (This is the only concrete URL pattern shown in
the docs — no formal spec of the subdomain-derivation rule is given beyond this
example.)

### `base44 dev` behavior

```bash
npx base44 dev [-p|--port <number>]   # default port 4400
```
- **Always** starts the Base44 backend locally — "entities, functions, and auth
  routes" — and watches local resources, reloading on change. **So yes, it proxies/
  runs functions locally**, not just entities.
- **Also** starts your frontend dev server, but **only if** `config.jsonc` has
  `site.serveCommand` set (e.g. `"npm run dev"`); if that's missing, `dev` still
  works but only runs the backend.
- Injects `VITE_BASE44_APP_ID` and `VITE_BASE44_APP_BASE_URL` env vars into the
  frontend process.
- Requires a **linked local project** (`base44/.app.jsonc` must exist); rejects
  `--app-id`/`BASE44_APP_ID`.
- Shuts everything down cleanly on stop; if the frontend process exits, the whole
  dev environment shuts down.

**Remote-sandbox mode equivalent:** no `base44 dev` — `get_app_preview_url` (MCP
tool) brings up a managed dev server (Vite HMR) and returns its preview URL; build/
type/lint errors are surfaced on demand via `run_command` (`npm run build`, `npx tsc
--noEmit`, `npm run lint`), and the Vite dev-server log is tailable at
`/tmp/vite.log` inside the sandbox.

---

## 10. Gotchas

The `base44-troubleshooter` skill itself is thin — its only real content is the
`base44 logs` command reference (filters: `--function`, `--since/--until`, `--level
info|warning|error|debug`, `--limit` default 50 max 1000, `--order`, `--env
preview|prod` (defaults to `preview`; "If `prod` returns no logs, the app may not
have been published yet"), `--follow` to stream, incompatible with `--until`/
`--order`). It does not itself list RLS/functions/InvokeLLM/agents/deploy gotchas —
those are aggregated below from across the CLI and SDK skills, per the task's request.

### RLS
- **No `rls` block at all on an entity = fully open** (all users, including
  anonymous, can read/write). This is an easy accidental-exposure trap for a
  clinical-data app like Dror.
- `user_condition` is **equality only** — no `$gt`/`$lt`/`$regex`; reach for a
  backend function for anything more expressive.
- Comparison/regex operators (`$gt`, `$lt`, `$gte`, `$lte`, `$regex`) are **not
  supported** on `data.*` fields either — only `$in`, `$nin`, `$ne`, `$all`.
- Deeply nested user-data templates like `{{user.data.profile.department}}` "may not
  work" — flagged as a soft limitation, not a hard guarantee either way.
- `asServiceRole` sets role to `"admin"` but does **not bypass RLS** — RLS rules
  must explicitly grant admin access, or service-role entity calls will still fail.
- Bidirectional-relationship access ("either party can read") needs `$or` across two
  owner fields, or a redesign storing two records — not a single simple rule.

### Functions / auth pattern
- `base44.functions.invoke()` returns the **raw axios response** — the function's
  JSON payload is on `.data`, not the return value itself; a very easy bug to
  introduce (`res.success` instead of `res.data.success`).
- `invoke()` **throws** on any non-2xx response; the error body is at
  `err.response.data`, not `err.data` or `err.message`.
- Functions must be in a **named subfolder** with `entry.ts`/`entry.js` — a bare
  `base44/functions/myFunction.js` or `base44/functions/entry.ts` is invalid.
- Imports must use `npm:`/`jsr:` specifiers for external packages inside `entry.ts`
  — a plain `from "@base44/sdk"` (no `npm:` prefix) is flagged as the wrong form for
  Deno functions in the CLI reference, though the SDK reference itself shows both
  forms inconsistently (see Section 4 note).
- Relative imports can only reach siblings in the same function folder or
  `base44/shared/` — anything reaching further out (e.g. `../../../src/utils.ts`)
  fails at deploy time.
- `--force` on `functions deploy` cannot be combined with explicit function names.

### InvokeLLM / AI Gateway
- `InvokeLLM` is explicitly documented as **"a single call with no tools"** — "Don't
  chain it to simulate an agent loop." For anything needing tools/multi-step
  reasoning, the docs direct you to the AI Gateway's code-agent pattern instead.
- The AI Gateway has **no streaming** and is **backend-function only** — there's no
  documented way to call it, or `InvokeLLM`, directly from client-side code with
  streaming tokens.
- AI Gateway calls run in the **caller's RLS scope by default**
  (`base44.aiGateway.connection()`); reaching for `asServiceRole.aiGateway` for
  cross-user work means **you must manually scope any tools to trusted server-side
  inputs**, not agent-chosen ones, since it has full access.
- Non-`automatic` models on the AI Gateway "cost more credits" — the docs warn to
  use them "only when needed, and tell the user."
- No `model` parameter exists for `InvokeLLM` at all (see Section 5) — if a specific
  model is required for a Dror feature, `InvokeLLM` cannot deliver that; only the AI
  Gateway takes a model id, and even there only one example id
  (`claude_sonnet_4_6`) is documented.

### Agents
- Entity tool names in `tool_configs` must be the entity's **PascalCase** `name`
  (`"Task"`), not the kebab-case file name or snake_case — a common mismatch source.
- Without explicit instructions telling the agent to use its entity tools, "the
  agent may not proactively query user data when asked" — tool access alone doesn't
  guarantee usage.
- `agents push`/`agents pull` are **full syncs**: pushing local agents deletes any
  remote agent not present locally, and vice versa for pull — an easy way to
  accidentally wipe a remotely-configured agent if local files are stale.
- The live `subscribeToConversation` feed **truncates tool-call data**
  (`arguments_string` to 500 chars, `results` to 50) — don't rely on it for
  full audit-quality tool-call logging; re-fetch via `getConversation(id)` for the
  complete record.
- `memory_config` defaults to **enabled** if the key is omitted entirely — for a
  therapy-notes product this is a meaningful default to know about explicitly
  (cross-conversation memory of patient-related content unless turned off).

### Deploy
- `base44 deploy` does **not** run your frontend build — you must `npm run build`
  first, or site deployment fails.
- In **remote-sandbox mode**, running any of `base44 deploy`, `base44 functions
  deploy`, `base44 ... push`, `base44 create`, or `base44 scaffold` is explicitly
  wrong — "The project-level CLI workflow does **not** apply" there; writing the
  resource file directly is the deploy mechanism, and there's a ~5s debounce before
  the auto-commit lands (don't disconnect immediately after the last edit).
- `--app-id` must **not** be used with `base44 create` or `base44 dev` (both need a
  local linked project); `base44 deploy` also requires a local project directory.
