# Project Context

## Product

A Customer Support CRM that lets a support team manage customers, tickets, and
customer interactions across multiple communication channels.

## Core scope

1. **Customer Management** — profiles, contact details, interaction history, notes.
2. **Ticket Management** — creation, categories, priorities, assignment, status
   lifecycle, escalation, history.
3. **Communication Channels** — channel is recorded as the origin/medium of a ticket
   or an interaction (Email, WhatsApp, LiveChat, SMS, WebForm).
4. **Authentication and Authorization** — minimal but real: two roles, enforced on
   the server.
5. **Localization** — the full interface and every server-authored message available
   in English and Arabic, with correct right-to-left layout for Arabic.

## Must-have end-to-end flow

```text
Create Customer
  → View Customer
    → Create Ticket
      → Assign Agent
        → Change Status
          → Add Comment
            → View Ticket History
```

If time runs short, this flow is completed at full quality before anything else is
started. A smaller scope delivered completely is worth more than a wide scope
delivered partially.

## Explicitly out of scope

| Out of scope | Reason |
|---|---|
| Real WhatsApp / SMS / email delivery integration | Requires provider accounts and credentials; the channel abstraction is modelled without a live provider |
| File attachments on customers or tickets | Storage, virus scanning, and size limits are a separate concern; notes and comments cover the demo flow |
| Automatic SLA engine and time-based escalation | Escalation is a manual, explicit action in the MVP |
| Analytics, reporting, and dashboards | No requirement in the core flow |
| Microservices, event bus, message broker | See `decisions/ADR-002-architecture-style.md` |
| Customer-facing portal or self-service | Every actor in scope is an internal support user |
| Reopening a closed ticket | `Closed` is terminal; see `04-business-rules.md` |
| Multi-tenancy | Single support organisation |
| Translation of user-entered content | Customer names, ticket subjects, descriptions, and comments are stored and displayed exactly as entered. Machine translation of free text is a different product |
| Locales beyond English and Arabic | Two locales prove the mechanism; a third is configuration, not design |

## Quality rules

- Domain logic lives in the domain and application layers, never in controllers or
  React components.
- Validation happens at the boundary; invariants are enforced in the domain.
- Error handling is uniform and returns a single documented error shape.
- API contracts are explicit; DTOs are never domain entities.
- No secrets, connection strings, or tokens in source control.
- Every business rule that can be stated in one sentence has at least one test.
- Every commit is small, buildable, and has a message that explains intent.

## Working language

All artifacts, code, comments, commit messages, and documentation are written in
English so the repository is readable by any reviewer.

This is separate from the product's languages. The **repository** is English-only; the
**product** is English and Arabic. Translated strings live in resource files, never in
code, comments, or documentation.
