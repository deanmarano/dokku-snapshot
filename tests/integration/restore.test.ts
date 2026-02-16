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

  it('restores config vars', async () => {
    dokku.createTestApp('snap-restore-cfg');
    dokku.setAppConfig('snap-restore-cfg', {
      MY_VAR: 'hello',
      OTHER_VAR: 'world',
    });

    // Create snapshot
    const createResult = await dokku.exec('create', 'snap-restore-cfg');
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // Clear config
    dokku.runDokku('config:clear', '--no-restart', 'snap-restore-cfg');

    // Verify config is cleared
    const configBefore = dokku.getAppConfig('snap-restore-cfg');
    expect(configBefore['MY_VAR']).toBeUndefined();

    // Restore
    const restoreResult = await dokku.exec('restore', 'snap-restore-cfg', snapshotId, '--force');
    expect(restoreResult.exitCode).toBe(0);

    // Verify config is restored
    const configAfter = dokku.getAppConfig('snap-restore-cfg');
    expect(configAfter['MY_VAR']).toBe('hello');
    expect(configAfter['OTHER_VAR']).toBe('world');
  });

  it('restores domains', async () => {
    dokku.createTestApp('snap-restore-dom');
    dokku.runDokku('domains:add', 'snap-restore-dom', 'mysite.com');
    dokku.runDokku('domains:add', 'snap-restore-dom', 'api.mysite.com');

    // Create snapshot
    const createResult = await dokku.exec('create', 'snap-restore-dom');
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // Remove domains
    dokku.runDokku('domains:clear', 'snap-restore-dom');

    // Verify domains cleared
    const domainsBefore = dokku.getAppDomains('snap-restore-dom');
    expect(domainsBefore).not.toContain('mysite.com');

    // Restore
    const restoreResult = await dokku.exec('restore', 'snap-restore-dom', snapshotId, '--force');
    expect(restoreResult.exitCode).toBe(0);

    // Verify domains restored
    const domainsAfter = dokku.getAppDomains('snap-restore-dom');
    expect(domainsAfter).toContain('mysite.com');
    expect(domainsAfter).toContain('api.mysite.com');
  });

  it('requires --force flag', async () => {
    dokku.createTestApp('snap-restore-force');

    const createResult = await dokku.exec('create', 'snap-restore-force');
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // Try restore without --force
    const restoreResult = await dokku.exec('restore', 'snap-restore-force', snapshotId);
    expect(restoreResult.exitCode).not.toBe(0);
    expect(restoreResult.stderr).toContain('--force');
  });

  it('fails for non-existent snapshot', async () => {
    dokku.createTestApp('snap-restore-bad');

    const result = await dokku.exec('restore', 'snap-restore-bad', 'fake-snapshot-id', '--force');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('not found');
  });

  it('imports service data on restore', async () => {
    if (!dokku.isPostgresAvailable()) {
      console.log('Skipping: postgres plugin not functional');
      return;
    }
    dokku.createTestApp('snap-restore-pg');
    dokku.createPostgresService('snap-restore-pg-svc');
    dokku.linkPostgres('snap-restore-pg-svc', 'snap-restore-pg');

    // Create snapshot (includes postgres export)
    const createResult = await dokku.exec('create', 'snap-restore-pg');
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // Restore (should import service data)
    const restoreResult = await dokku.exec('restore', 'snap-restore-pg', snapshotId, '--force');
    expect(restoreResult.exitCode).toBe(0);
    expect(restoreResult.stdout).toContain('Importing postgres service');
  });
});
