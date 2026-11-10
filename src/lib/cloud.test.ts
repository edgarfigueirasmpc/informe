import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloudRequest, readCloudFile, saveCloudFile } from './cloud';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
describe('MPC Cloud same-origin protocol', () => {
  it('uses same-origin cookies, no redirects, CSRF and no cache', async () => {
    const fetch = vi.fn().mockResolvedValue(json({})); vi.stubGlobal('fetch', fetch);
    await cloudRequest('uploads', { method: 'POST' }, 'csrf');
    expect(fetch).toHaveBeenCalledWith('/api/uploads', expect.objectContaining({ credentials: 'same-origin', redirect: 'error', cache: 'no-store', headers: { 'X-CSRF-Token': 'csrf' } }));
  });
  it('reads the version of the downloaded content, not a prior listing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('a;b\n1;2', { headers: { ETag: '"current"' } })));
    const result = await readCloudFile('/carpeta/a.csv');
    expect(result.source).toEqual({ path: '/carpeta/a.csv', etag: 'current' });
    expect(await result.file.text()).toBe('a;b\n1;2');
  });
  it('uploads chunks and replaces only with the opened ETag', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ id: 'u', maxChunk: 2 }))
      .mockResolvedValueOnce(json({})).mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ path: '/a.csv', entry: { etag: 'new' } }));
    vi.stubGlobal('fetch', fetch);
    expect(await saveCloudFile(new Blob(['123']), '/a.csv', 'csrf', 'old')).toEqual({ path: '/a.csv', etag: 'new' });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ path: '/', name: 'a.csv', onConflict: 'replace', ifMatch: 'old' });
    expect(fetch.mock.calls[1][1].headers['X-Chunk-SHA256']).toHaveLength(64);
    expect(fetch.mock.calls[2][0]).toBe('/api/uploads/u?offset=2');
  });
  it('save as never silently replaces a document', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ id: 'u', maxChunk: 2 })).mockResolvedValueOnce(json({ path: '/a.csv', entry: { etag: 'new' } }));
    vi.stubGlobal('fetch', fetch); await saveCloudFile(new Blob([]), '/a.csv', 'csrf');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ onConflict: 'fail', visibility: 'private' });
  });
  it('reports conflicts without retrying or discarding local data and cancels the upload', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ id: 'u', maxChunk: 2 }))
      .mockResolvedValueOnce(json({}, 409)).mockResolvedValueOnce(json({}));
    vi.stubGlobal('fetch', fetch);
    await expect(saveCloudFile(new Blob([]), '/a.csv', 'csrf', 'old')).rejects.toThrow('Tus cambios se conservan');
    expect(fetch.mock.calls[2][1].method).toBe('DELETE'); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('keeps session-expiry errors actionable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 401)));
    await expect(cloudRequest('fs/list')).rejects.toThrow('tus cambios siguen aquí');
  });
});
