import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DokkuSnapshot } from '../helpers/dokku';

describe('snapshot:delete', () => {
  let dokku: DokkuSnapshot;

  beforeAll(() => {
    dokku = new DokkuSnapshot();
    dokku.createTestApp('snap-delete-test');
  });

  afterAll(async () => {
    await dokku.cleanup();
  });

  it('deletes a snapshot', async () => {
    const createResult = await dokku.exec('create', 'snap-delete-test');
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const id = match![1];

    const deleteResult = await dokku.exec('delete', 'snap-delete-test', id);
    expect(deleteResult.exitCode).toBe(0);
    expect(deleteResult.stdout).toContain('Snapshot deleted');

    const listResult = await dokku.exec('list', 'snap-delete-test');
    expect(listResult.stdout).not.toContain(id);
  });

  it('fails for non-existent snapshot', async () => {
    const result = await dokku.exec('delete', 'snap-delete-test', 'no-such-snapshot');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('not found');
  });

  it('fails for non-existent app', async () => {
    const result = await dokku.exec('delete', 'snap-delete-nonexistent', 'some-id');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('does not exist');
  });
});
