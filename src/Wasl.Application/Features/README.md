# Features

One folder per **use case**, not per technical type.

```text
Features/
  Customers/
    CreateCustomer/        CreateCustomerCommand · Handler · Validator · CustomerDto
    GetCustomer/
  Tickets/
    CreateTicket/
    ChangeStatus/
```

Not `Commands/`, `Handlers/`, and `Validators/` directories — those stop working at about
three features, because a change to one feature then scatters across all of them.

Empty in feature 001 on purpose: the folder exists so the convention is visible from the
first commit rather than established by whoever happens to add the first use case.
Feature 007 puts the first one here.

See `docs/sdd/02-architecture.md` and `decisions/ADR-010-vertical-slices.md` — the
feature-folder idea is the part of that rejected proposal which was adopted.
