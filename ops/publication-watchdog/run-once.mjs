import { runWatchdog } from './src/index.mjs';

// Recovery is based on what readers can reach, never on a receipt that exists only
// in Git. This makes the GitHub fallback genuinely independent of Pages deployment.
const result = await runWatchdog(process.env, new Date());
console.log(JSON.stringify(result));
