import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.mjs';

// #5: on macOS os.tmpdir() lives under /var, a root-owned link into /private, and
// every --out under it was refused. Links a user can create must still be refused.
test('--out works under the OS temp directory and still refuses a user-planted symlink', () => {
  const dir = mkdtempSync(join(tmpdir(), 'readme-proof-out-'));
  try {
    const readme = join(dir, 'README.md');
    writeFileSync(readme, '# Demo\n\nPlain text.\n');
    const quiet = console.log; console.log = () => {};
    try { main(['analyze', readme, '--json', '--out', join(dir, 'report.json')]); } finally { console.log = quiet; }
    assert.ok(existsSync(join(dir, 'report.json')));
    mkdirSync(join(dir, 'real'));
    symlinkSync(join(dir, 'real'), join(dir, 'alias'));
    assert.throws(() => main(['analyze', readme, '--json', '--out', join(dir, 'alias', 'report.json')]), /symlink/i);
    assert.ok(!existsSync(join(dir, 'real', 'report.json')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
