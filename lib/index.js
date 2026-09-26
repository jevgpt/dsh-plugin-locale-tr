/**
 * Turkish language pack for the DeepSeek Harness web GUI — host half.
 *
 * The locale catalog lives entirely in the browser: `dsh-client-modules`
 * discovers this package through its `dsh.client` manifest declaration and
 * serves `lib/client.js` to the Client tree, where it calls
 * `ctx.locale.addLanguage` / `ctx.locale.register`. This half exists so the
 * package is a legitimate Loader row whose entry the client scan can resolve;
 * it contributes no host-side behaviour.
 */

/** Host plugin body — no host-side behaviour for this language pack. */
export function apply() {}
