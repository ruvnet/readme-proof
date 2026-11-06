import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, existsSync, rmSync, lstatSync } from 'node:fs';
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

// The accept branch: a root-owned link in a root-owned, non-writable directory (merged-usr
// /bin on Linux, /tmp and /var on macOS) must not be refused as a planted symlink.
test('--out does not refuse an OS-owned symlink on the path', { skip: !isOsLink('/bin') && 'no root-owned /bin symlink here' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'readme-proof-oslink-'));
  try {
    const readme = join(dir, 'README.md');
    writeFileSync(readme, '# Demo\n\nPlain text.\n');
    const quiet = console.log; console.log = () => {};
    let error;
    try { main(['analyze', readme, '--json', '--out', '/bin/readme-proof-missing-dir/report.json']); } catch (e) { error = e; } finally { console.log = quiet; }
    assert.ok(error, 'writing under /bin must fail for a normal user');
    assert.doesNotMatch(String(error.message), /symlink/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
function isOsLink(path) {
  try { const s = lstatSync(path); return s.isSymbolicLink() && s.uid === 0 && process.getuid?.() !== 0; } catch { return false; }
}
test('rvf export does not refuse an OS-owned symlink on the path', { skip: !isOsLink('/bin') && 'no root-owned /bin symlink here' }, async () => {
  const { createReceipt, exportRvf } = await import('../src/evidence.mjs');
  await assert.rejects(exportRvf(createReceipt({ passed: 1, failed: 0 }, '# Demo'), '/bin/readme-proof-missing-dir/report.rvf'), error => !/symlink/i.test(error.message));
});
