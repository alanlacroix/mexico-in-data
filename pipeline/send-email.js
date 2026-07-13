// Retired on 2026-07-13.
//
// Signups and delivery now belong to Beehiiv. This file intentionally has no
// provider code, no secret lookup, and no send mode. Keeping a fail-closed shim
// prevents an old local command or workflow from silently using Buttondown.

console.error(`
send-email.js is retired. Nothing was sent.

Prepare the manual Beehiiv handoff instead:
  node pipeline/prepare-beehiiv.js --week YYYY-Www

Review the package, create the post in Beehiiv, send a Beehiiv test, and approve
the delivered test there before scheduling or sending.
`);

process.exitCode = 1;
