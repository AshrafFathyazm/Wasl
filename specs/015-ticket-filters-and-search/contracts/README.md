# `015` has no contract of its own, deliberately

The endpoint is `010`'s. This feature adds **query parameters** to
`GET /api/tickets` and changes nothing about the envelope, the row, the order, or the
statuses.

So the parameters are recorded as a **Contract change** at the foot of
[`010/contracts/tickets-list-api.md`](../../010-ticket-list-and-detail/contracts/tickets-list-api.md),
and the frozen text above that section is not edited.

That is the rule `error-contract.md` set when `429` arrived on `POST /api/auth/token`
after freezing, and it is what `033` did to `008`'s contract on the same day this landed:
**a contract a lane has already built against is a record of what was agreed, and
rewriting it in place destroys the only evidence of what changed.**

A second frozen file for the same endpoint would be two documents to keep in step, and
`002c`'s two-way OpenAPI comparison would then have to decide which one it is comparing
against.
