using System.Reflection;
using FluentAssertions;
using Wasl.Domain.Audit;

namespace Wasl.Domain.Tests.Audit;

/// <summary>
/// BR-9.7 — the test that LOOKS.
/// </summary>
/// <remarks>
/// <para>
/// <b>This exists because the same gap has been found three times, from three directions.</b>
/// `013`'s comment body was in BR-9.7's original list; `016`'s escalation reason was not and went
/// out in <c>Changes</c> in full, twice in one diff; `021`'s outbound message body was not either,
/// and that is the only text in this product a <i>customer</i> receives. Each was discovered by
/// somebody building an unrelated feature and happening to read a diff.
/// </para>
/// <para>
/// The cause is written into <c>AuditRedaction</c> itself: <b>BR-9.7 enumerates instead of
/// describing a category</b>, so every new kind of human text is absent from the list until
/// somebody writes a test that looks. <c>CLAUDE.md</c> carries the instruction in three words —
/// <i>"Write that test."</i> — and this is it.
/// </para>
/// <para>
/// <b>It is a CLASSIFICATION guard, not a detector.</b> There is no heuristic here that tries to
/// recognise human text by its name, because `016` wrote the same guard wrong twice by guessing at
/// shapes: a scan for <c>=== 'Closed'</c> went red on a rule it was explicitly permitted to mirror,
/// and the narrowed version went red on an entry TYPE that merely shares a word with a status.
/// **A guard that goes red on a legitimate case gets loosened wholesale**, so this one cannot be
/// wrong about a field's meaning — it only insists that somebody decided.
/// </para>
/// <para>
/// Every string a diff could carry is either on <c>AuditRedaction</c>'s list, or here with a
/// written reason. A new entity, or a new string column on an old one, is <b>red and named</b>
/// until it is classified. Deleting a row to make it green deletes the reason with it, which is
/// the only kind of loosening this shape allows.
/// </para>
/// <para>
/// <b>It runs in the DOMAIN suite</b> — no EF, no database, no container — because BR-9.7 is a
/// domain rule and <c>AuditRedaction</c> is a pure function beside it. What it reflects over is the
/// domain assembly, and the entity spelling it asserts is the CLR type name, which is exactly what
/// <c>AuditDiffInterceptor.Describe</c> emits: <c>entry.Metadata.ClrType.Name</c>.
/// </para>
/// </remarks>
public sealed class AuditRedactionCoverageTests
{
    /// <summary>
    /// The persisted types, as this test expects to discover them.
    /// </summary>
    /// <remarks>
    /// Written out rather than derived, so that a NEW entity is a failure naming it rather than a
    /// silent extra row in a loop. <c>TicketTag</c> carries no string at all and is listed anyway:
    /// the day it gains one, the classification below is where the question gets asked.
    /// </remarks>
    private static readonly string[] KnownPersistedTypes =
    [
        "AuditEntry",
        "CannedReply",
        "Customer",
        "Interaction",
        "OrganizationSettings",
        "SupportUser",
        "Tag",
        "Ticket",
        "TicketComment",
        "TicketHistoryEntry",
        "TicketTag",
    ];

    /// <summary>
    /// <c>Entity.Field</c> → why its values are stored rather than redacted.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Five of these are the question this test exists to keep visible</b>, and they are marked
    /// FLAGGED. They are recorded as the behaviour that ships today, not endorsed: changing any of
    /// them is a BR-9.7 decision for the product owner, and this file is where the decision lands
    /// when it is made. Redacting one would NOT break the tests that look like they pin it —
    /// <c>AuditPipelineTests</c> asserts the field NAME appears in the document, and
    /// <c>AuditRedaction.Apply</c> keeps the name and replaces both values. Measured, not assumed.
    /// </para>
    /// </remarks>
    private static readonly Dictionary<string, string> StoredWithAReason = new(StringComparer.Ordinal)
    {
        /* ---- AuditEntry: unreachable by construction -------------------------------------
         * `AuditDiffInterceptor` filters the change set with `entry.Entity is not AuditEntry`
         * before it describes anything, so no column of the audit table can appear in another
         * row's diff. Classified rather than skipped, because "the interceptor excludes it" is a
         * fact in another project that this list should have to restate if it ever stops being
         * true. */
        ["AuditEntry.ActorEmail"] = "never described — the interceptor excludes AuditEntry itself",
        ["AuditEntry.ActorRole"] = "never described — the interceptor excludes AuditEntry itself",
        ["AuditEntry.Action"] = "never described — the interceptor excludes AuditEntry itself",
        ["AuditEntry.EntityType"] = "never described — the interceptor excludes AuditEntry itself",
        ["AuditEntry.EntityLabel"] = "never described — the interceptor excludes AuditEntry itself",
        ["AuditEntry.Changes"] = "never described — and it IS the redacted diff, already filtered",
        ["AuditEntry.TraceId"] = "never described — the interceptor excludes AuditEntry itself",
        ["AuditEntry.IpAddress"] = "never described — the interceptor excludes AuditEntry itself",
        ["AuditEntry.UserAgent"] = "never described — the interceptor excludes AuditEntry itself",

        /* ---- Customer ---------------------------------------------------------------------
         * The identifying columns are the same trade BR-9.6 already accepts for the actor's
         * email, and the same one `021` accepts for `Interaction.RecipientAddress`: an auditor
         * asking WHO a change was about must be able to answer from the trail. */
        ["Customer.FullName"] = "identity — the trail is ABOUT this customer, and BR-9.6 accepts "
            + "the same trade for the actor's own email",
        ["Customer.Email"] = "identity, and BR-4 makes it a uniqueness key rather than free text",
        ["Customer.PhoneE164"] = "identity, and BR-4's second uniqueness key",
        ["Customer.CompanyName"] = "identity",
        ["Customer.Notes"] = "FLAGGED — free text a STAFF MEMBER wrote about a customer, which is "
            + "the category BR-9.7 describes and does not enumerate. Stored today. Nothing forces "
            + "that: AuditPipelineTests asserts the field NAME is present and redaction keeps the "
            + "name, so the only thing in the way is that it is a decision, not a defect",

        /* ---- Ticket ------------------------------------------------------------------------ */
        ["Ticket.TicketNumber"] = "identifier — BR-8.13 keeps it identical in every locale, and it "
            + "is the label the trail is about",
        ["Ticket.Subject"] = "FLAGGED — the CUSTOMER's own words, one line of them. Same category "
            + "as the comment body BR-9.7 does name. Stored today",
        ["Ticket.Description"] = "FLAGGED — the customer's own words at length, and the longest "
            + "free text on any entity. Stored today",

        /* ---- TicketHistoryEntry -------------------------------------------------------------
         * `Note` is redacted (`016`); these two are not, and the reason is that today they are
         * never free text. That is a property of the callers, not of the column, which is why it
         * is FLAGGED rather than settled. */
        ["TicketHistoryEntry.OldValue"] = "FLAGGED by shape — carries an enum value or a user id "
            + "on every event type written today, never typed text. The column itself constrains "
            + "nothing, so a future event that writes a sentence here lands outside the rule",
        ["TicketHistoryEntry.NewValue"] = "FLAGGED by shape — same as OldValue",

        /* ---- Interaction (`021`) ----------------------------------------------------------- */
        ["Interaction.RecipientAddress"] = "DELIBERATE, and `021` AC-16 wants it: an auditor "
            + "asking where a message went must be able to answer from the trail, and the address "
            + "is the whole answer. The trade is stated in AuditRedaction's own remarks",
        ["Interaction.ProviderName"] = "infrastructure identifier — which provider sent it",
        ["Interaction.ProviderMessageId"] = "the provider's own id, for correlation",
        ["Interaction.FailureCode"] = "a code, not a message",

        /* ---- CannedReply -------------------------------------------------------------------- */
        ["CannedReply.Title"] = "staff-authored template vocabulary, not about any customer — and "
            + "`034` Q-3 keeps these without an admin screen, so no command mutates them and none "
            + "reaches a diff today",
        ["CannedReply.Body"] = "FLAGGED if that changes — template text is not about a customer, "
            + "but it IS free text, and the reason it is safe today is that nothing writes it "
            + "through the pipeline. An admin screen makes this a real question",

        /* ---- Tag ---------------------------------------------------------------------------- */
        ["Tag.Name"] = "managed vocabulary, one word, and `027` renders it to every reader",

        /* ---- OrganizationSettings (`022`) ---------------------------------------------------
         * THE GUARD'S FIRST REAL CATCH, and it fired the day it was written: `022` added this
         * entity hours later and the suite went red naming the type and both columns, exactly as
         * designed. Classified here rather than left red, because both are `#RRGGBB` and there is
         * nothing to weigh — but the classification is `039`'s reading of `022`'s data, and the
         * lane that owns the feature overrules it in one line if it is wrong. */
        ["OrganizationSettings.BrandColor"] = "a `#RRGGBB` colour, normalised on write — not text, "
            + "not about any person, and it is rendered to every reader of every screen",
        ["OrganizationSettings.OnBrand"] = "the foreground the contrast gate chose, one of two "
            + "fixed candidates — a colour, not a value anyone typed",

        /* ---- SupportUser --------------------------------------------------------------------- */
        ["SupportUser.FullName"] = "the actor's identity — BR-9.6 accepts the actor's email, so "
            + "the name it belongs to is the same trade",
        ["SupportUser.Email"] = "the actor's identity, named by BR-9.6",
        ["SupportUser.PreferredLanguage"] = "a two-letter code, not text",
    };

    /// <summary>
    /// The persisted classes, discovered rather than listed — a class, not an exception, not a
    /// record, not static, not abstract.
    /// </summary>
    /// <remarks>
    /// Exceptions carry strings too (<c>ErrorCode</c>, <c>MessageKey</c>, <c>FieldName</c>) and are
    /// never persisted; records are the domain's value carriers, and <c>AuditFieldChange</c> is the
    /// diff itself rather than a row in one.
    /// </remarks>
    private static Type[] Discover() =>
        typeof(AuditRedaction).Assembly.GetTypes()
            .Where(type => type is { IsClass: true, IsPublic: true, IsAbstract: false })
            .Where(type => !(type.IsAbstract && type.IsSealed))
            .Where(type => !typeof(Exception).IsAssignableFrom(type))
            .Where(type => type.GetMethod("<Clone>$", BindingFlags.Public | BindingFlags.Instance) is null)
            .OrderBy(type => type.Name, StringComparer.Ordinal)
            .ToArray();

    /// <summary>
    /// The strings a diff could carry: public instance <c>string</c> properties with a setter.
    /// </summary>
    /// <remarks>
    /// A getter-only property is computed and is not a column, so it is never a
    /// <c>PropertyEntry</c> and cannot reach <c>Describe</c>.
    /// </remarks>
    private static PropertyInfo[] StringColumns(Type type) =>
        type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(property => property.PropertyType == typeof(string))
            .Where(property => property.SetMethod is not null)
            .OrderBy(property => property.Name, StringComparer.Ordinal)
            .ToArray();

    /// <summary>
    /// The control: this scan must actually see something.
    /// </summary>
    /// <remarks>
    /// `008`'s query counter throws rather than returning zero, for the reason this repo has met
    /// six times: <b>a measurement that names the wrong thing is worse than no measurement,
    /// because it is believed.</b> A reflection filter one predicate too strict returns an empty
    /// set, and every assertion below then passes over nothing.
    /// </remarks>
    [Fact]
    public void The_scan_finds_the_entities_and_their_strings_rather_than_passing_over_nothing()
    {
        var types = Discover();

        types.Should().HaveCountGreaterThan(5,
            "an empty or near-empty discovery means the filter is wrong, not that the domain is");

        types.Select(type => type.Name).Should().Contain("Ticket")
            .And.Contain("Customer")
            .And.Contain("Interaction");

        types.Sum(type => StringColumns(type).Length).Should().BeGreaterThan(20,
            "the string columns are what is being classified. Zero of them is a broken filter");

        StringColumns(typeof(SupportUserProbe)).Should().BeEmpty(
            "a type with no settable string must come back empty, or the filter is not filtering");
    }

    /// <summary>A type with no settable string, for the control above.</summary>
    private sealed class SupportUserProbe
    {
        public string Computed => "not a column";
    }

    /// <summary>
    /// A new entity is named, not absorbed.
    /// </summary>
    [Fact]
    public void Every_persisted_type_is_one_this_file_has_classified()
    {
        var discovered = Discover().Select(type => type.Name).ToArray();

        discovered.Should().BeEquivalentTo(KnownPersistedTypes,
            "a persisted type added to the domain brings its strings with it, and BR-9.7's list "
            + "is a list somebody has to extend. This is the test that says so — add the type "
            + "here and classify its strings below, or say here why it is not persisted");
    }

    /// <summary>
    /// <b>The one that looks.</b> Every string a diff could carry is redacted, or stored with a
    /// written reason. Neither is a default.
    /// </summary>
    [Fact]
    public void Every_string_a_diff_could_carry_is_redacted_or_stored_with_a_stated_reason()
    {
        var unclassified = new List<string>();

        foreach (var type in Discover())
        {
            foreach (var property in StringColumns(type))
            {
                // The CLR name, because that is what AuditDiffInterceptor emits:
                // `entry.Metadata.ClrType.Name`. The table spellings in AuditRedaction exist for
                // callers that hold the other name, and another test pins that they agree.
                var key = $"{type.Name}.{property.Name}";
                var redacted = AuditRedaction.IsRedacted(type.Name, property.Name);
                var stored = StoredWithAReason.TryGetValue(key, out var reason);

                if (redacted && stored)
                {
                    throw new InvalidOperationException(
                        $"{key} is on AuditRedaction's deny-list AND in this file's stored list. "
                        + "One of the two is stale, and a field classified twice is classified "
                        + "by whichever list the reader happens to open.");
                }

                if (!redacted && !stored)
                {
                    unclassified.Add(key);
                    continue;
                }

                if (stored)
                {
                    reason.Should().NotBeNullOrWhiteSpace(
                        $"{key} is stored, and an exemption with no reason is an exemption nobody "
                        + "can review");
                }
            }
        }

        unclassified.Should().BeEmpty(
            "BR-9.7 enumerates instead of describing a category, so a new kind of human text is "
            + "absent from the list until a test looks. This is that test. Each field named here "
            + "is either sensitive — add it to AuditRedaction.SecretEntityFields — or it is not, "
            + "and the reason goes in StoredWithAReason. Both are one line. Neither is a default");
    }

    /// <summary>
    /// The reverse: an exemption for a field that no longer exists is a reason nobody can check.
    /// </summary>
    /// <remarks>
    /// `037` found `icons-added.tsx` carrying a stated reason for existing that had been false
    /// since `026`. A stale row here is the same shape: it reads as a decision somebody made about
    /// this codebase, and it is about a column that is gone.
    /// </remarks>
    [Fact]
    public void No_stored_exemption_outlives_the_field_it_describes()
    {
        var live = Discover()
            .SelectMany(type => StringColumns(type).Select(property => $"{type.Name}.{property.Name}"))
            .ToHashSet(StringComparer.Ordinal);

        StoredWithAReason.Keys.Where(key => !live.Contains(key)).Should().BeEmpty(
            "the column is gone and its exemption is not — delete the row with it");
    }

    /// <summary>
    /// The five kinds of human text BR-9.7 has had to learn, asserted by name.
    /// </summary>
    /// <remarks>
    /// The scan above would stay green if somebody removed one of these from the deny-list and
    /// added a reason here instead — that is the cost of a classification guard, and this is what
    /// pays it. Each of these was a measured defect, not a precaution.
    /// </remarks>
    [Theory]
    [InlineData("TicketComment", "Body", "013 — BR-5.5, in the original list")]
    [InlineData("Ticket", "EscalationReason", "016 — went out in full, twice in one diff")]
    [InlineData("TicketHistoryEntry", "Note", "016 — the same text, the same transaction")]
    [InlineData("Interaction", "Body", "021 — the only text a CUSTOMER receives")]
    [InlineData("SupportUser", "PasswordHash", "BR-9.7's own first line")]
    public void The_kinds_of_human_text_already_learned_stay_redacted(
        string entity, string field, string why)
    {
        AuditRedaction.IsRedacted(entity, field).Should().BeTrue(
            $"this one is not a precaution — {why}");
    }
}
