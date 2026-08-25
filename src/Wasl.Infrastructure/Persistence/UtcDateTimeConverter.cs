using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Wasl.Infrastructure.Persistence;

/// <summary>
/// Forces every <see cref="DateTime"/> through the database to be UTC.
/// </summary>
/// <remarks>
/// <para>
/// SQL Server has no time-zone-aware type — ADR-013 replaced PostgreSQL's
/// <c>timestamptz</c> with <c>datetime2(3)</c>, and <c>datetime2</c> stores no offset.
/// Without this converter a <see cref="DateTimeKind.Local"/> value is written as if it
/// were UTC and is wrong from then on, silently and permanently.
/// </para>
/// <para>
/// On write: <c>Local</c> is converted, <c>Unspecified</c> is asserted to be UTC already
/// (there is nothing else it could sensibly mean in this codebase, where every column is
/// named <c>*Utc</c>). On read: the value is stamped <c>Utc</c>, because SQL Server
/// returns <c>Unspecified</c> and a caller comparing it against
/// <c>TimeProvider.GetUtcNow()</c> would otherwise get an answer that depends on the
/// server's time zone.
/// </para>
/// <para>Tested by AC-8, because a converter is only as good as the test that proves it.</para>
/// </remarks>
public sealed class UtcDateTimeConverter : ValueConverter<DateTime, DateTime>
{
    public UtcDateTimeConverter()
        : base(
            toDatabase => ToUtc(toDatabase),
            fromDatabase => DateTime.SpecifyKind(fromDatabase, DateTimeKind.Utc))
    {
    }

    private static DateTime ToUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };
}

/// <summary>The nullable counterpart. EF Core needs the two registered separately.</summary>
public sealed class NullableUtcDateTimeConverter : ValueConverter<DateTime?, DateTime?>
{
    public NullableUtcDateTimeConverter()
        : base(
            toDatabase => toDatabase.HasValue ? ToUtc(toDatabase.Value) : null,
            fromDatabase => fromDatabase.HasValue
                ? DateTime.SpecifyKind(fromDatabase.Value, DateTimeKind.Utc)
                : null)
    {
    }

    private static DateTime ToUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };
}
