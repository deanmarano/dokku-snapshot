import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DokkuSnapshot } from '../helpers/dokku';
import { execSync } from 'child_process';

describe('snapshot:export and snapshot:import', () => {
  let dokku: DokkuSnapshot;
  const APP = 'snap-export-test';
  const TEST_PASSWORD = 'test-password-123';
  let snapshotId: string;
  const exportFiles: string[] = [];

  beforeAll(async () => {
    dokku = new DokkuSnapshot();
    dokku.createTestApp(APP);
    dokku.setAppConfig(APP, { MY_KEY: 'my_value' });

    const result = await dokku.exec('create', APP);
    expect(result.exitCode).toBe(0);
    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    expect(match).not.toBeNull();
    snapshotId = match![1];
  });

  afterAll(async () => {
    for (const f of exportFiles) {
      try { execSync(`rm -f ${f}`); } catch { /* ignore */ }
    }
    await dokku.cleanup();
  });

  it('round-trips: export → delete → import → list', async () => {
    const exportPath = `/tmp/${APP}-${snapshotId}.tar.gz.enc`;
    exportFiles.push(exportPath);

    // Export
    const exportResult = await dokku.exec('export', APP, snapshotId, '--password', TEST_PASSWORD, '--output', exportPath);
    expect(exportResult.exitCode).toBe(0);
    expect(exportResult.stdout).toContain('Exported to');

    // Delete original snapshot
    const deleteResult = await dokku.exec('delete', APP, snapshotId);
    expect(deleteResult.exitCode).toBe(0);

    // Import
    const importResult = await dokku.exec('import', APP, exportPath, '--password', TEST_PASSWORD);
    expect(importResult.exitCode).toBe(0);
    expect(importResult.stdout).toContain('Imported snapshot');

    // Verify it appears in list
    const listResult = await dokku.exec('list', APP);
    expect(listResult.exitCode).toBe(0);
    expect(listResult.stdout).toContain(snapshotId);
  });

  it('fails with wrong password on import', async () => {
    const exportPath = `/tmp/${APP}-wrong-pw.tar.gz.enc`;
    exportFiles.push(exportPath);

    const exportResult = await dokku.exec('export', APP, snapshotId, '--password', TEST_PASSWORD, '--output', exportPath);
    expect(exportResult.exitCode).toBe(0);

    const importResult = await dokku.exec('import', APP, exportPath, '--password', 'wrong-password');
    expect(importResult.exitCode).not.toBe(0);
  });

  it('fails when password is missing on export', async () => {
    const result = await dokku.exec('export', APP, snapshotId);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Password is required');
  });

  it('fails when exporting non-existent snapshot', async () => {
    const result = await dokku.exec('export', APP, 'no-such-snapshot', '--password', TEST_PASSWORD);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('not found');
  });

  it('fails on duplicate import', async () => {
    // Snapshot already exists from the round-trip test above
    const exportPath = `/tmp/${APP}-dup.tar.gz.enc`;
    exportFiles.push(exportPath);

    const exportResult = await dokku.exec('export', APP, snapshotId, '--password', TEST_PASSWORD, '--output', exportPath);
    expect(exportResult.exitCode).toBe(0);

    const importResult = await dokku.exec('import', APP, exportPath, '--password', TEST_PASSWORD);
    expect(importResult.exitCode).not.toBe(0);
    expect(importResult.stderr).toContain('already exists');
  });
});
