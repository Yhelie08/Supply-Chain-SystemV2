#!/usr/bin/env node
// Claude Code PreToolUse hook: refuses dangerous git commands before they run.
// Reads the hook payload on stdin ({"tool_input":{"command":"..."}}) and exits 2 to block.
// Kept in Node so it works on Windows without jq or Git Bash.

const DANGEROUS = [
  // git push, including `git -C <dir> push`, `git.exe push`, `&& git push`
  { name: 'git push', re: /(?:^|[;&|]\s*)git(?:\.exe)?(?:\s+-[Cc]\s+(?:"[^"]*"|\S+))*\s+push\b/i },
  { name: 'git reset --hard', re: /(?:^|[;&|]\s*)git(?:\.exe)?(?:\s+-[Cc]\s+(?:"[^"]*"|\S+))*\s+reset\s+--hard\b/i },
  { name: 'git clean -f', re: /(?:^|[;&|]\s*)git(?:\.exe)?(?:\s+-[Cc]\s+(?:"[^"]*"|\S+))*\s+clean\s+-[a-z]*f/i },
  { name: 'git branch -D', re: /(?:^|[;&|]\s*)git(?:\.exe)?(?:\s+-[Cc]\s+(?:"[^"]*"|\S+))*\s+branch\s+-D\b/ },
  { name: 'git checkout .', re: /(?:^|[;&|]\s*)git(?:\.exe)?(?:\s+-[Cc]\s+(?:"[^"]*"|\S+))*\s+checkout\s+\.(?:\s|$)/ },
  { name: 'git restore .', re: /(?:^|[;&|]\s*)git(?:\.exe)?(?:\s+-[Cc]\s+(?:"[^"]*"|\S+))*\s+restore\s+\.(?:\s|$)/ },
];

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let command = '';
  try {
    command = String(JSON.parse(input)?.tool_input?.command ?? '');
  } catch {
    // Unreadable payload: let Claude Code decide; do not block unrelated tools.
    process.exit(0);
  }

  for (const { name, re } of DANGEROUS) {
    if (re.test(command)) {
      process.stderr.write(
        `BLOCKED: "${command}" matches the dangerous pattern "${name}". ` +
        'The user has prevented the AI from running this. Ask the user to run it themselves, ' +
        'or get explicit approval and disable this guard for that one command.\n'
      );
      process.exit(2);
    }
  }
  process.exit(0);
});
