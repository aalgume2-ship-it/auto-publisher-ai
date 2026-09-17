import { spawnSync } from 'node:child_process';

const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';

const commands = isVercel
  ? [
      ['pnpm', ['--filter', '@aca/shared', 'build']],
      ['pnpm', ['--filter', '@aca/web', 'build']],
    ]
  : [['corepack', ['pnpm', 'exec', 'turbo', 'run', 'build']]];

for (const [bin, args] of commands) {
  const result = spawnSync(bin, args, { stdio: 'inherit', shell: true, env: process.env });
  if (result.status !== 0) {
    process.exit(typeof result.status === 'number' ? result.status : 1);
  }
}
