import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DokkuSnapshot } from '../helpers/dokku';

describe('snapshot:list', () => {
  let dokku: DokkuSnapshot;

  beforeAll(() => {
    dokku = new DokkuSnapshot();
  });

  afterAll(async () => {
    await dokku.cleanup();
  });

  it('lists snapshots for app', async () => {
    dokku.createTestApp('snap-list-test');

    // Create two snapshots with a small delay to ensure different timestamps
    const result1 = await dokku.exec('create', 'snap-list-test');
    expect(result1.exitCode).toBe(0);
    const match1 = result1.stdout.match(/Snapshot created:\s*(\S+)/);
    const id1 = match1![1];

    // Wait 1 second to ensure different timestamp
    await new Promise(r => setTimeout(r, 1100));

    const result2 = await dokku.exec('create', 'snap-list-test');
    expect(result2.exitCode).toBe(0);
    const match2 = result2.stdout.match(/Snapshot created:\s*(\S+)/);
    const id2 = match2![1];

    const listResult = await dokku.exec('list', 'snap-list-test');
    expect(listResult.exitCode).toBe(0);
    expect(listResult.stdout).toContain(id1);
    expect(listResult.stdout).toContain(id2);
  });

  it('shows empty list for app with no snapshots', async () => {
    dokku.createTestApp('snap-list-empty');

    const result = await dokku.exec('list', 'snap-list-empty');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No snapshots found');
  });

  it('fails for non-existent app', async () => {
    const result = await dokku.exec('list', 'snap-list-nonexistent');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('does not exist');
  });
});
