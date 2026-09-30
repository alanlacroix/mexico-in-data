// Only these receipts may be committed before editorial validation. No prompts,
// evidence, draft content or public artifacts enter the reservation commit.
import { execFileSync } from 'node:child_process';

export const ACCOUNTING_FILES = ['data/llm-spend.json', 'data/edition-attempts.json'];
export function persistModelAccounting({ cwd, execute = execFileSync } = {}) {
  const git = (...args) => execute('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
  git('add', '--', ...ACCOUNTING_FILES);
  git('commit', '--only', '-m', '[CF-Pages-Skip] edition: persist model accounting', '--', ...ACCOUNTING_FILES);
  // Never rebase a paid-call reservation over newer accounting. A failed or
  // ambiguous push aborts BEFORE the request; a remote accepted push is harmless.
  // Final workflow persistence may reconcile conflicts, but cannot send a model call.
  git('push', 'origin', 'HEAD:main');
}
