import { execFileSync } from 'node:child_process';

const [from, to, ...deploymentOptions] = process.argv.slice(2);
if (!from || !to || from === to) throw new Error('Supply distinct source and target Telegram IDs, then optional Convex CLI deployment flags.');
// Internal functions require Convex administrator credentials, never a browser session.
execFileSync('npx', ['convex', 'run', 'migrations/transfer_user_data:transfer', JSON.stringify({ fromToken: from, toToken: to }), ...deploymentOptions], { stdio: 'inherit' });
