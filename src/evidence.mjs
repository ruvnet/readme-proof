import { createHash } from 'node:crypto';
import { readFile, writeFile, open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, parse, dirname } from 'node:path';
import init from '@ruvector/rvf-wasm';
const hash = x => createHash('sha256').update(x).digest('hex');
const MAX = 4 * 1024 * 1024;
async function kernel() {
  let bytes;
  try { bytes = await readFile(new URL('./rvf_wasm_bg.wasm', import.meta.url)); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    bytes = await readFile(new URL(import.meta.resolve('@ruvector/rvf-wasm/wasm')));
  }
  return init(bytes);
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  const out = JSON.stringify(value);
  if (out === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Receipt must contain JSON values');
  return out;
}
export function createReceipt(report, markdown) {
  if (typeof markdown !== 'string') throw new Error('Markdown string required');
  const body = { schema: 'readme-proof/receipt/v1', markdownSha256: hash(markdown), report };
  return { ...body, id: hash(canonical(body)) };
}
function validate(receipt) {
  const { id, ...body } = receipt;
  if (!/^[a-f0-9]{64}$/.test(id) || body.schema !== 'readme-proof/receipt/v1' || hash(canonical(body)) !== id) throw new Error('Receipt digest mismatch');
  return new Float32Array(Buffer.from(id, 'hex'));
}
function allocate(wasm, bytes) {
  const p = wasm.rvf_alloc(bytes.length);
  if (!p) throw new Error('RVF allocation failed');
  new Uint8Array(wasm.memory.buffer, p, bytes.length).set(bytes);
  return p;
}
async function bounded(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > MAX) throw new Error('Evidence must be a regular file at most 4 MiB');
    const bytes = Buffer.alloc(MAX + 1);
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await file.read(bytes, size, bytes.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > MAX) throw new Error('Evidence exceeds 4 MiB');
    return bytes.subarray(0, size);
  } finally { await file.close(); }
}
async function systemParent(path) {
  const parent = await lstat(dirname(path));
  return parent.uid === 0 && (parent.mode & 0o022) === 0;
}
async function rejectSymlinks(path) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const component of absolute.slice(current.length).split('/').filter(Boolean)) {
    current = resolve(current, component);
    // Root-owned links in root-owned, non-shared directories are the OS's own (macOS /tmp, /var).
    try { const stat = await lstat(current); if (stat.isSymbolicLink() && !(stat.uid === 0 && await systemParent(current))) throw new Error('Output symlink refused'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
/** Real RVF vector index and explicit JSON sidecar. Hash vector is an integrity key, not a semantic embedding. */
export async function exportRvf(receipt, path) {
  await rejectSymlinks(path);
  await rejectSymlinks(path + '.receipt.json');
  const vector = validate(receipt);
  const json = canonical(receipt);
  if (Buffer.byteLength(json) > MAX) throw new Error('Receipt exceeds 4 MiB');
  const w = await kernel();
  const h = w.rvf_store_create(32, 0);
  if (h <= 0) throw new Error('RVF store creation failed');
  let vp, ip, op, size;
  try {
    vp = allocate(w, new Uint8Array(vector.buffer));
    ip = allocate(w, new Uint8Array(new BigUint64Array([1n]).buffer));
    if (w.rvf_store_ingest(h, vp, ip, 1) !== 1) throw new Error('RVF ingest failed');
    size = Math.abs(w.rvf_store_export(h, 0, 0));
    if (!size || size > MAX) throw new Error('RVF size invalid');
    op = w.rvf_alloc(size);
    if (!op || w.rvf_store_export(h, op, size) !== size) throw new Error('RVF export failed');
    const bytes = Buffer.from(new Uint8Array(w.memory.buffer, op, size));
    await writeFile(path + '.receipt.json', canonical({ receipt, rvfSha256: hash(bytes) }), { flag: 'wx', mode: 0o600 });
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
    return { id: receipt.id, path, sidecar: path + '.receipt.json', bytes: size, sha256: hash(bytes), backend: '@ruvector/rvf-wasm@0.1.9' };
  } finally {
    if (vp) w.rvf_free(vp, 128);
    if (ip) w.rvf_free(ip, 8);
    if (op) w.rvf_free(op, size);
    w.rvf_store_close(h);
  }
}
export async function readRvf(path) {
  const bytes = await bounded(path);
  const envelope = JSON.parse(await bounded(path + '.receipt.json'));
  if (envelope.rvfSha256 !== hash(bytes)) throw new Error('RVF binary digest mismatch');
  const receipt = envelope.receipt;
  const vector = validate(receipt);
  const w = await kernel();
  const p = allocate(w, bytes);
  let h, q, out;
  try {
    h = w.rvf_store_open(p, bytes.length);
    if (h <= 0 || w.rvf_store_dimension(h) !== 32 || w.rvf_store_count(h) !== 1) throw new Error('Invalid RVF evidence store');
    q = allocate(w, new Uint8Array(vector.buffer));
    out = w.rvf_alloc(12);
    if (!out || w.rvf_store_query(h, q, 1, 0, out) !== 1) throw new Error('RVF query failed');
    const view = new DataView(w.memory.buffer);
    if (view.getBigUint64(out, true) !== 1n || view.getFloat32(out + 8, true) !== 0) throw new Error('RVF receipt binding mismatch');
    return receipt;
  } finally {
    w.rvf_free(p, bytes.length);
    if (q) w.rvf_free(q, 128);
    if (out) w.rvf_free(out, 12);
    if (h > 0) w.rvf_store_close(h);
  }
}
