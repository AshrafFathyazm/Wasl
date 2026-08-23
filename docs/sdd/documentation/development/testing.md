# Running and Writing Tests

Strategy and rationale live in `testing/test-strategy.md`. This file is about
mechanics.

## Running

```bash
# Everything
dotnet test

# By project
dotnet test tests/Wasl.Domain.Tests            # fast, no dependencies
dotnet test tests/Wasl.Application.Tests       # fast, faked infrastructure
dotnet test tests/Wasl.Api.IntegrationTests    # requires Docker

# One test or one class
dotnet test --filter "FullyQualifiedName~TicketStatusTransitionTests"
dotnet test --filter "Name~ChangeStatus_FromNewToInProgress_ReturnsConflict"

# Frontend
cd src/wasl-web
npm run test
npm run test -- --watch
```

Integration tests start a SQL Server container through Testcontainers. The first run
pulls the image; later runs reuse it.

## Where a test belongs

| The test needs | Project |
|---|---|
| Only domain objects | `Wasl.Domain.Tests` |
| A use case with faked infrastructure | `Wasl.Application.Tests` |
| Real HTTP, real database, or a real constraint | `Wasl.Api.IntegrationTests` |
| A React component | `wasl-web` |

If a test needs a database to prove its point, it is an integration test. Do not
substitute EF InMemory to move it up the pyramid — it does not enforce unique
constraints, foreign keys, or concurrency tokens, which is usually exactly what the
test was written to verify.

## Naming

`MethodOrEndpoint_Condition_ExpectedResult`, with the rule identifier in a comment
where one applies:

```csharp
[Fact]
public void ChangeStatus_ToInProgressWithoutAssignee_Throws()  // BR-1.3
```

## Integration test structure

```csharp
public class ChangeTicketStatusTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task ChangeStatus_FromNewToInProgress_ReturnsConflict()  // BR-1
    {
        var client = await factory.AuthenticatedClientAsync(SupportRole.Manager);
        var ticket = await factory.SeedTicketAsync(status: TicketStatus.New);

        var response = await client.PutAsJsonAsync(
            $"/api/tickets/{ticket.Id}/status",
            new { status = "InProgress", expectedVersion = ticket.Version });

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        problem!.Type.Should().EndWith("invalid-status-transition");
    }
}
```

Each test resets its data by transaction rollback. No test depends on another, and no
test depends on execution order.

## Test data builders

One builder per aggregate, with defaults, so a test states only what it cares about:

```csharp
var ticket = new TicketBuilder()
    .WithStatus(TicketStatus.PendingCustomer)
    .WithAssignee(agentId)
    .Build();
```

A test that sets fifteen fields to reach the one that matters has buried its own
point.

## Asserting the absence of N+1

Several stories require that a list query does not issue a query per row. Assert the
executed command count directly rather than trusting the implementation:

```csharp
using var counter = factory.CountExecutedCommands();
await client.GetAsync("/api/tickets?pageSize=50");
counter.Count.Should().BeLessThanOrEqualTo(2);   // the page and the total count
```

## Rules

- Never record a result that was not observed.
- A test that asserts nothing is worse than no test — it produces a green tick for
  nothing.
- Test the failure paths. The happy path is the one that was manually checked anyway.
- Anything knowingly untested goes in the story's `tests.md` with a reason.
