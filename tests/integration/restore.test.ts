import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DokkuSnapshot } from '../helpers/dokku';

describe('snapshot:restore', () => {
  let dokku: DokkuSnapshot;

  beforeAll(() => {
    dokku = new DokkuSnapshot();
  });

  afterAll(async () => {
    await dokku.cleanup();
  });

  it('restores service data with version info', async () => {
    const APP = 'snap-restore-svc';
    const PG_SVC = 'snap-restore-svc-pg';
    dokku.createTestApp(APP);
    dokku.createPostgresService(PG_SVC);
    dokku.linkPostgres(PG_SVC, APP);

    // Create snapshot
    const createResult = await dokku.exec('create', APP);
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // Restore
    const restoreResult = await dokku.exec('restore', APP, snapshotId, '--force');
    expect(restoreResult.exitCode).toBe(0);
    expect(restoreResult.stdout).toContain('Snapshot version:');
    expect(restoreResult.stdout).toContain('Importing postgres service');
  });

  it('requires --force flag', async () => {
    const APP = 'snap-restore-force';
    dokku.createTestApp(APP);

    const createResult = await dokku.exec('create', APP);
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    const restoreResult = await dokku.exec('restore', APP, snapshotId);
    expect(restoreResult.exitCode).not.toBe(0);
    expect(restoreResult.stderr).toContain('--force');
  });

  it('fails for non-existent snapshot', async () => {
    const APP = 'snap-restore-bad';
    dokku.createTestApp(APP);

    const result = await dokku.exec('restore', APP, 'fake-snapshot-id', '--force');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('not found');
  });
});
