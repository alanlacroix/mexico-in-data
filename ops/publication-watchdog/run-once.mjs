import { runWatchdog } from './src/index.mjs';

// Recovery compares the live receipt with the repository's newer coordination
// receipt. This catches a deferred repair even when Pages still serves a same-day
// edition that the newer pipeline no longer certifies.
const result = await runWatchdog(process.env, new Date());
console.log(JSON.stringify(result));
