namespace Wasl.Api.Common.Localization;

/// <summary>
/// The marker type <see cref="Microsoft.Extensions.Localization.IStringLocalizer{T}"/> resolves
/// the catalogues from. `005` AC-16.
/// </summary>
/// <remarks>
/// <para>
/// <b>It sits in the same folder as its own <c>.resx</c> files, and <c>AddLocalization()</c> is
/// called with NO <c>ResourcesPath</c>.</b> That is the whole reason this type exists where it
/// does. With a <c>ResourcesPath</c>, the factory composes the base name as
/// <c>{RootNamespace}.{ResourcesPath}.{TypeName minus RootNamespace}</c>, so a marker in
/// <c>Wasl.Api.Common.Localization</c> would look for
/// <c>Resources/Common/Localization/SharedResource.resx</c> — a path nobody would guess from
/// either end. Side by side, the manifest name a <c>.resx</c> compiles to is exactly this type's
/// full name, and the two cannot drift.
/// </para>
/// <para>
/// <b>Getting it wrong does not throw.</b> <c>IStringLocalizer</c> answers a missing resource by
/// returning the key as its own value, so a misconfigured path renders
/// <c>Error.DuplicateCustomer.Email</c> to the user and reads like a missing translation rather
/// than a broken lookup. `002` already shipped that failure twice — a `401` showing
/// <c>Error.Auth.InvalidCredentials</c> on the login screen, and seventeen unresolved
/// FluentValidation keys under form fields. <b>AC-16 asserts
/// <c>LocalizedString.ResourceNotFound</c> is <c>false</c> for every shipped key in both
/// cultures</b>, which is the only assertion that can tell the two apart.
/// </para>
/// <para>
/// One catalogue, not one per feature. The keys are already namespaced by their prefix
/// (<c>Error.</c>, <c>Validation.</c>), and splitting them would mean choosing a file for every
/// new key and a second parity test per pair.
/// </para>
/// </remarks>
internal sealed class SharedResource;
