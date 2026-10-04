<div align="center">

# 🤝 Wasl — وصل

**A bilingual customer support CRM, built spec-first with .NET 10 and React**

[![.NET](https://img.shields.io/badge/.NET-10.0-512BD4?logo=dotnet)](https://dotnet.microsoft.com/)
[![ASP.NET Core](https://img.shields.io/badge/ASP.NET%20Core-Web%20API-512BD4?logo=dotnet)](https://learn.microsoft.com/aspnet/core)
[![SQL Server](https://img.shields.io/badge/SQL%20Server-2022-CC2927?logo=microsoftsqlserver)](https://www.microsoft.com/sql-server)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![i18n](https://img.shields.io/badge/i18n-EN%20%7C%20AR%20(RTL)-2E7D32)](#-localization)
[![Spec Kit](https://img.shields.io/badge/Spec--Driven-GitHub%20Spec%20Kit-24292F?logo=github)](specs/README.md)
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)](.github/workflows)

[Overview](#-overview) • [Features](#-features) • [Architecture](#%EF%B8%8F-architecture) • [Getting Started](#-getting-started) • [API](#-api-endpoints) • [Testing](#-testing) • [Roadmap](#-roadmap)

</div>

---

## 📖 Overview

Wasl is a customer support CRM: customers, tickets, a status workflow, assignment, escalation,
a timeline of comments and changes, outbound messages, and a dashboard — in **English and Arabic**,
with a full right-to-left interface.

It is built **spec-first**. Every feature lives in its own folder under [`specs/`](specs/) with a
written specification, a frozen API contract, an ordered task list, recorded test output, and a
`summary.md` stating what was built, what was not, and why.

### Key Highlights

- 🎫 **Ticket lifecycle** — a server-owned state machine (BR-1) with every one of its 36 transitions under test
- 👥 **Role-based access** — `Manager` and `Agent`, JWT bearer auth, closed-by-default endpoints
- 🧾 **Audit trail** — every state change writes an audit row in the **same transaction**, and the log is append-only by **database permission**
- 🌍 **Bilingual** — server messages from `.resx`, UI from `en` + `ar` catalogues, RTL via CSS logical properties
- 🛡️ **Hardened write path** — optimistic concurrency, idempotency keys, rate limits, deadlock translation
- 🎨 **Tenant theming** — brand colour with a contrast gate enforced in the domain
- 📐 **Contract-checked** — the generated OpenAPI document is compared against the frozen `contracts/` in a test

---

## ✨ Features

### Support Workflow

| Area | What it does | Status |
|------|--------------|--------|
| **Tickets** | Create, list, filter, search, detail, numbered from a SQL sequence | ✅ Delivered |
| **Status workflow** | BR-1 state machine; `allowedTransitions` comes from the server, never from the client | ✅ Delivered |
| **Assignment** | Managers assign anyone; Agents may only take an unassigned ticket (BR-2) | ✅ Delivered |
| **Escalation** | Manager-only, one-way, raises priority to a **floor** — never downgrades (BR-3) | ✅ Delivered |
| **Timeline** | Comments + history merged into one cursor-paged feed | ✅ Delivered |
| **Tags** | Attach / detach, with a unique index guarding the race | ✅ Delivered |
| **Messages** | Outbound messages through a provider abstraction (mock provider) | ✅ Delivered |
| **Customers** | Directory with search, profile, create, edit; duplicate email/phone refused (BR-4) | ✅ Delivered |
| **Dashboard** | Attention levels with day-over-day trend from a daily snapshot | ✅ Delivered |
| **Branding** | Tenant brand colour and sidebar presets, contrast-gated | ✅ Delivered |
| **Language** | Per-user preferred language, `ar` / `en` | ✅ Delivered |
| **Audit log screen** | Read access to `dbo.AuditLog` | 🔄 Specified, not built |
| **Customer overview** | Aggregated customer view | 🔄 Specified, not built |

### Core Capabilities

- ✅ RFC 7807 `ProblemDetails` on every non-2xx, each with a `traceId` matching the server log
- ✅ One `type` per business refusal — `errors/invalid-status-transition`, `errors/concurrency-conflict`, `errors/duplicate-customer`, `errors/already-escalated` …
- ✅ Request validation with FluentValidation, localized through catalogue keys
- ✅ Optimistic concurrency with SQL Server `rowversion`
- ✅ `Idempotency-Key` on `POST /api/tickets`
- ✅ Sign-in throttle per **(address, email)** pair, plus a general write limit per caller
- ✅ Deadlock victims answered as `503 errors/transient-conflict` with `Retry-After`
- ✅ Sensitive and free-text fields redacted from audit diffs (BR-9.7), guarded by a coverage test

---

## 🏗️ Architecture

### Clean Architecture — four projects

```
┌─────────────────────────────────────────────────────────────┐
│                         Wasl.Api                             │
│                 (Composition & HTTP Layer)                   │
│  • Controllers  • Middleware  • Auth  • Localization        │
└─────────────────────────────────────────────────────────────┘
               ↓                                  ↓
┌──────────────────────────────┐   ┌──────────────────────────┐
│     Wasl.Infrastructure      │ → │     Wasl.Application     │
│  • EF Core  • Migrations     │   │  • Features/ (one folder │
│  • Transaction & Audit       │   │    per use case)         │
│  • JWT issuer  • Seeders     │   │  • Validators            │
│  • Queries/  • Mock provider │   │  • Abstractions          │
└──────────────────────────────┘   └──────────────────────────┘
                                                ↓
                              ┌──────────────────────────────┐
                              │         Wasl.Domain          │
                              │  • Entities  • Rules         │
                              │  • State machine (BR-1)      │
                              │  • ZERO package references   │
                              └──────────────────────────────┘
```

Dependency direction is `Api` / `Infrastructure` → `Application` → `Domain`, never the reverse.
**An architecture test fails the build** if `Wasl.Domain` gains a package reference or
`Wasl.Application` can see EF Core or ASP.NET Core.

### Request Flow

```
┌──────────────┐
│  🖥️ Client   │  React + TanStack Query
└──────┬───────┘
       │  Bearer JWT · Accept-Language
       ↓
┌─────────────────────────────────────────────┐
│  🌐 ASP.NET Core middleware                 │
│  UseAuthentication                          │
│    → UseRequestLocalization                 │
│    → UseAuthorization  (fallback: closed)   │
└──────┬──────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────┐
│  🎛️ Controller — bind, authorise,           │
│     dispatch, map. Nothing else.            │
└──────┬──────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────┐
│  📨 MediatR pipeline (Common/WaslPipeline)  │
│                                             │
│  TransientFailure → Validation              │
│        → Transaction → Audit → Handler      │
└──────┬──────────────────────────────────────┘
       │
       ├──────────────────┬───────────────────┐
       ↓                  ↓                   ↓
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│  💎 Domain   │  │  💾 EF Core  │  │  📤 Provider     │
│  rules &     │  │  SQL Server  │  │  (mock, after    │
│  invariants  │  │  2022        │  │   the commit)    │
└──────────────┘  └──────┬───────┘  └──────────────────┘
                         ↓
               ┌──────────────────┐
               │  🧾 dbo.AuditLog │
               │  same transaction│
               └──────────────────┘
```

### Design Decisions

| Decision | Why |
|----------|-----|
| **MediatR pipeline** | Validation, transaction boundary and audit are structural, not remembered (ADR-008) |
| **No `IRepository<T>`** | `DbSet<T>` is already a repository; `IApplicationDbContext` only keeps EF out of Application |
| **No `Result<T>`** | Domain exceptions, mapped to `ProblemDetails` in one place |
| **`ProblemDetails`, not a success envelope** | `200` is never returned with an error in the body |
| **Two pagination shapes** | Page envelope for lists; cursor for the timeline, which grows where the reader is looking |
| **Sub-resource `PUT`** | `/status`, `/assignee` — each is a business action with its own rules and history row |

Every decision is recorded as an ADR in [`docs/sdd/decisions/`](docs/sdd/decisions/).

---

## 🛠️ Technology Stack

### Backend

| Category | Library | Version | Purpose |
|----------|---------|---------|---------|
| **Runtime** | .NET SDK | 10.0.2xx | Pinned in `global.json` |
| **Web** | ASP.NET Core | 10.0 | Controllers, auth, localization |
| **ORM** | EF Core SqlServer | 10.0.11 | Data access, migrations |
| **Mediator** | MediatR | 14.2.0 | Commands, queries, pipeline behaviours |
| **Validation** | FluentValidation | 12.1.1 | Request validation |
| **Auth** | JwtBearer + Identity.Core | 10.0.11 | Tokens and password hashing |
| **OpenAPI** | Microsoft.AspNetCore.OpenApi | 10.0.11 | Generated for the contract test |
| **Database** | SQL Server | 2022 | `rowversion`, filtered unique indexes, sequences |

### Frontend

| Category | Library | Purpose |
|----------|---------|---------|
| **UI** | React 18 + TypeScript | Feature-folder SPA |
| **Build** | Vite | Dev server with `/api` proxy |
| **Server state** | TanStack Query | The only fetching layer |
| **Forms** | React Hook Form + Zod | One schema drives types and validation |
| **Routing** | React Router | Filters and pagination live in the URL |
| **i18n** | i18next + react-i18next | `en` + `ar` catalogues, parity-checked in CI |

### Testing

| Tool | Used for |
|------|----------|
| **xUnit + FluentAssertions** | All backend suites |
| **Testcontainers.MsSql** | A real SQL Server per integration run — never EF `InMemory` |
| **WebApplicationFactory** | Real HTTP through the real pipeline |
| **Vitest + React Testing Library** | Frontend unit and component tests |

---

## 🚀 Getting Started

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download) — `dotnet --version` must report `10.0.2*`
- [Docker](https://www.docker.com/) — for the database and the integration tests
- [Node.js](https://nodejs.org/) 20+ — frontend only (CI runs 22)
- [Git](https://git-scm.com/downloads)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/AshrafFathyazm/Wasl.git
   cd Wasl
   ```

2. **Start SQL Server** — on host port **14330**
   ```bash
   docker compose up -d db
   ```
   Wait for `docker compose ps` to report `healthy`: the port accepts connections several seconds
   before the engine answers a query.

3. **Restore**
   ```bash
   dotnet restore
   ```

4. **Set the five secrets** — none has a default, and the host refuses to start without each one
   ```bash
   dotnet user-secrets --project src/Wasl.Api set "Database:AppPassword"  "<a password>"
   dotnet user-secrets --project src/Wasl.Api set "Jwt:SigningKey"        "<32+ bytes>"
   dotnet user-secrets --project src/Wasl.Api set "Seed:ManagerPassword"  "<8+ characters>"
   dotnet user-secrets --project src/Wasl.Api set "Seed:AgentPassword"    "<8+ characters>"
   dotnet user-secrets --project src/Wasl.Api set "Seed:AgentTwoPassword" "<8+ characters>"
   ```

5. **Point the runtime connection at the restricted principal** — same password as `Database:AppPassword`
   ```bash
   dotnet user-secrets --project src/Wasl.Api set "ConnectionStrings:Wasl" \
     "Server=localhost,14330;Database=Wasl;User Id=wasl_app;Password=<the same>;TrustServerCertificate=True;MultipleActiveResultSets=True"
   ```

6. **Provision the schema and the principal, then seed a demo**
   ```bash
   dotnet run --project src/Wasl.Api -- --provision
   dotnet run --project src/Wasl.Api -- --seed       # 3 customers, 5 tickets — then exits
   ```
   > `dotnet ef database update` alone is **not** enough: it applies the schema but does not
   > create `wasl_app`, the principal the application connects as.

7. **Run the API** — `http://localhost:5272`
   ```bash
   dotnet run --project src/Wasl.Api
   ```

8. **Run the web app**
   ```bash
   cd src/wasl-web
   npm ci
   npm run dev
   ```
   Vite proxies `/api/**` to the API, so the browser makes no cross-origin request.

### Seeded Users

| Email | Role | Language |
|-------|------|----------|
| `manager@wasl.local` | Manager | `ar` |
| `agent@wasl.local` | Agent | `en` |
| `agent2@wasl.local` | Agent | `ar` |

Passwords are whatever you set in `Seed:*`. Email is case-insensitive.

> 🔎 **There is no `/swagger`.** The OpenAPI document is generated and deliberately **not served** —
> serving it would add a third anonymous endpoint. It is produced inside a test and compared against
> the frozen contracts.

The full clean-clone walkthrough, with troubleshooting, is in
[`specs/001-solution-skeleton/quickstart.md`](specs/001-solution-skeleton/quickstart.md).

---

## 📡 API Endpoints

Base `/api` · JSON · UTC ISO-8601 with `Z` · ids are GUID strings · enums are strings.
Everything requires a bearer token except the two endpoints marked 🔓.

### Auth & Profile

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/token` 🔓 | Sign in, receive a JWT. Throttled — `429` with `Retry-After` |
| `PUT` | `/api/me/language` | Change the signed-in user's preferred language |

### Tickets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/tickets` | Create a ticket. Accepts `Idempotency-Key` |
| `GET` | `/api/tickets` | Paged list with filters and search. `pageSize` clamps at 100 |
| `GET` | `/api/tickets/{id}` | Detail, including `allowedTransitions` and `canEscalate` |
| `PUT` | `/api/tickets/{id}/status` | Change status — BR-1, with `expectedVersion` |
| `PUT` | `/api/tickets/{id}/assignee` | Assign, reassign or unassign — BR-2 |
| `POST` | `/api/tickets/{id}/escalate` | Escalate — **Manager only** — BR-3 |
| `POST` | `/api/tickets/{id}/comments` | Add a comment (append-only) |
| `GET` | `/api/tickets/{id}/timeline` | Comments + history, **cursor-paged** |
| `PUT` | `/api/tickets/{id}/tags/{tagId}` | Attach a tag |
| `DELETE` | `/api/tickets/{id}/tags/{tagId}` | Detach a tag |
| `POST` | `/api/tickets/{ticketId}/messages` | Send an outbound message |
| `GET` | `/api/tickets/{ticketId}/interactions` | Messages sent on the ticket |

### Customers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/customers` | Directory, paged, with search |
| `GET` | `/api/customers/companies` | Company names for the filter panel |
| `POST` | `/api/customers` | Create — duplicate email/phone is `409` naming the field only |
| `GET` | `/api/customers/{id}` | Full record with `version` |
| `PUT` | `/api/customers/{id}` | Update |

### Lookups, Dashboard & Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/support-users` | Active users for the assignee picker |
| `GET` | `/api/tags` | Tag vocabulary |
| `GET` | `/api/canned-replies` | Reply templates, optionally by category |
| `GET` | `/api/communications/channels` | Channels that can be sent on |
| `GET` | `/api/dashboard` | Attention levels and trend |
| `GET` | `/api/settings/branding` | Current brand settings |
| `PUT` | `/api/settings/branding` | Update brand — **Manager only** |
| `GET` | `/health` 🔓 | Liveness and database check, outside `/api` |

### Example Request

```bash
# 1. Sign in
curl -sX POST http://localhost:5272/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@wasl.local","password":"<Seed:ManagerPassword>"}'

# 2. Use the accessToken
curl "http://localhost:5272/api/tickets?pageSize=20" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Accept-Language: ar"
```

### Error Response

```json
{
  "type": "errors/invalid-status-transition",
  "title": "That status change is not permitted.",
  "status": 409,
  "traceId": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
}
```

`type`, the keys of `errors`, enum values and `traceId` are never localized — clients branch on
them. `title` and `detail` follow `Accept-Language`.

---

## 🌍 Localization

### Supported Languages

- **English (`en`)** — LTR
- **Arabic (`ar`)** — RTL

### How It Works

- Server-authored messages live in `.resx` catalogues in both languages
- UI strings live in `src/wasl-web/src/locales/{en,ar}` — **no user-facing string in JSX**
- A CI gate fails the build if a key exists in one catalogue and not the other
- Layout uses CSS logical properties (`margin-inline-start`), never `left` / `right`
- Directional icons mirror under RTL through one rule
- Arabic text is stored as `nvarchar` end to end

### Choosing the Culture

```http
Accept-Language: ar
```

Resolution order: the query string, then the signed-in user's stored preference, then
`Accept-Language`. The preference is carried in the token, so a change takes effect at the next
sign-in.

---

## 🧪 Testing

### Test Suites

| Suite | What it covers | Needs Docker |
|-------|----------------|:------------:|
| `Wasl.Domain.Tests` | Entities, rules, the state machine, architecture boundaries | ❌ |
| `Wasl.Application.Tests` | Use cases with faked infrastructure | ❌ |
| `Wasl.Api.IntegrationTests` | Real HTTP + real SQL Server via Testcontainers | ✅ |
| `src/wasl-web` (Vitest) | Components, routes, guards, catalogue parity | ❌ |

Last recorded run (`022`, 2026-10-04): **330 domain · 46 application · 615 integration · 1416 frontend.**

### Running Tests

```bash
# backend — warnings are errors
dotnet build
dotnet test                                   # everything
dotnet test tests/Wasl.Domain.Tests           # no database, no Docker
dotnet test tests/Wasl.Api.IntegrationTests   # needs Docker running

# frontend
cd src/wasl-web
npm run test && npx tsc -b && npm run lint && npm run build
```

> ⚠️ **Verify with the whole suite.** `--filter` is for diagnosis, never for proof — integration
> classes share one SQL Server container, and a filtered run says nothing about the suite.

### What Is Guarded

- 🏛️ Layer boundaries — architecture tests
- 🧾 Every state-changing command is `IAuditableCommand`, and every persisted string is classified for redaction
- 🔑 No raw resource key reaches a response; every key exists in the catalogue
- 📐 The generated OpenAPI document matches `contracts/` in both directions
- 🎨 Every `var(--token)` in CSS resolves to a real token

Guards are proven with **negative controls** — break the protected thing on purpose, watch the
guard go red, put it back — recorded in each feature's `tests.md`.

---

## 📁 Project Structure

```
Wasl/
├── docs/sdd/                          # The blueprint: FR, BR, NFR, US, ADR, design, testing
├── specs/                             # One folder per feature
│   └── NNN-feature/                   # spec · plan · contracts · tasks · tests · summary
│
├── src/
│   ├── Wasl.Domain/                   # No EF, no HTTP, no packages at all
│   │   ├── Customers/                 # Customer, ContactNormalisation
│   │   ├── Tickets/                   # Ticket, comments, history, BR-1 transitions
│   │   ├── Communications/            # Interaction, channels, delivery status
│   │   ├── Settings/                  # BrandContrast
│   │   ├── Users/                     # SupportUser
│   │   └── Audit/                     # AuditEntry
│   │
│   ├── Wasl.Application/              # Depends only on Wasl.Domain
│   │   ├── Features/                  # One folder per use case
│   │   ├── Common/Abstractions/       # IApplicationDbContext, ICurrentUser, …
│   │   ├── Common/Behaviours/         # ValidationBehaviour
│   │   └── Resources/                 # .resx for server-authored messages
│   │
│   ├── Wasl.Infrastructure/           # Implements what Application declares
│   │   ├── Persistence/               # WaslDbContext, configurations, migrations
│   │   ├── Persistence/Behaviours/    # TransactionBehaviour, AuditBehaviour
│   │   ├── Persistence/Audit/         # Diff interceptor, redaction, writer
│   │   ├── Persistence/Seed/          # Demo and user seeders
│   │   ├── Queries/                   # TicketTimelineQuery, dashboard aggregates
│   │   ├── Auth/                      # Password hasher, throttle, JWT issuer
│   │   ├── Communications/            # MockCommunicationProvider
│   │   └── Scheduling/                # DailySnapshotService
│   │
│   ├── Wasl.Api/                      # Composes everything at startup
│   │   ├── Controllers/
│   │   ├── Common/Auth/               # Policies, denial handler, HttpCurrentUser
│   │   ├── Common/Localization/       # SharedResource{,.ar}.resx
│   │   ├── Common/WaslPipeline.cs     # THE ordered behaviour list
│   │   └── Program.cs
│   │
│   └── wasl-web/                      # React + TypeScript
│       └── src/
│           ├── features/              # auth · customers · dashboard · settings · tickets
│           ├── components/            # Shared primitives
│           ├── icons/                 # One icon module
│           ├── locales/{en,ar}/       # Translation catalogues
│           ├── shell/                 # App layout and navigation
│           └── styles/                # Semantic design tokens
│
├── tests/
│   ├── Wasl.Domain.Tests/
│   ├── Wasl.Application.Tests/
│   └── Wasl.Api.IntegrationTests/
│
├── docker-compose.yml                 # SQL Server 2022 on port 14330
├── global.json                        # SDK pin
└── Directory.Build.props              # Nullable on, warnings as errors
```

---

## 🔮 Roadmap

### Not Built Yet

- [ ] Audit log read endpoint and screen (`019`)
- [ ] Customer overview (`018`)
- [ ] A real email / SMS / WhatsApp provider — only the mock exists, with no credentials and no network
- [ ] Inbound messages — refused today by a database `CHECK` constraint
- [ ] Safe retry for `POST /api/tickets/{id}/comments` (no idempotency key yet)

### Out of Scope, by Decision

- Attachments
- A global client state store — server state is TanStack Query, UI state is the URL
- De-escalation — escalation is one-way (BR-3.9)

Open product questions are tracked in
[`docs/sdd/11-open-questions.md`](docs/sdd/11-open-questions.md).

---

## 🤝 Contributing

Work follows a gated, spec-first flow. **Both gates are per feature, every time.**

1. **Spec** — write `specs/NNN-feature/spec.md`. No code
2. **Questions** — anything unclear goes to *Open Questions*, never guessed into the design
3. **Review** — the product owner reads the spec in full
4. **Approval** — an explicit yes before implementation starts
5. **Implement** — task by task, against a frozen `contracts/*-api.md`
6. **Summary** — `summary.md`: what was built, trade-offs, deviations, limitations
7. **Permission** — ask before every `git commit` and `git push`

Please ensure:
- `dotnet build` is clean — warnings are errors
- The **whole** test suite passes, not a filtered subset
- Every new i18n key exists in both `en` and `ar`
- Every touched screen has been viewed in Arabic

The full working agreement is in [`CLAUDE.md`](CLAUDE.md); the feature plan is in
[`specs/README.md`](specs/README.md).

---

## 📚 Where the Reasoning Lives

| Document | What is in it |
|----------|---------------|
| [`docs/sdd/12-delivery-log.md`](docs/sdd/12-delivery-log.md) | Every decision, in order, with what was rejected and why |
| [`docs/sdd/04-business-rules.md`](docs/sdd/04-business-rules.md) | The `BR-*` rules cited by specs and tests |
| [`docs/sdd/15-scope-coverage.md`](docs/sdd/15-scope-coverage.md) | The product scope, mapped to covered or cut |
| [`docs/sdd/09-definition-of-done.md`](docs/sdd/09-definition-of-done.md) | The Definition of Done |
| `specs/NNN-*/tests.md` | Recorded test output and the defects each feature's tests found |

---

## 📄 License

Private repository. No open-source license is granted.

---

## 📞 Contact

- 🌐 GitHub: [@AshrafFathyazm](https://github.com/AshrafFathyazm)
- 📦 Repository: [github.com/AshrafFathyazm/Wasl](https://github.com/AshrafFathyazm/Wasl)

---

<div align="center">

**Built spec-first — every claim here traces to a spec, a test, or a recorded decision.**

</div>
