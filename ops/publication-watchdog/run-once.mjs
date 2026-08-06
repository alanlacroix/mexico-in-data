import { runWatchdog } from './src/index.mjs';

const result = await runWatchdog(process.env, new Date());
console.log(JSON.stringify(result));
