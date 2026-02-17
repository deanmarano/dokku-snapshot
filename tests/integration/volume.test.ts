import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DokkuSnapshot } from '../helpers/dokku';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, chmodSync } from 'fs';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const PLUGIN_DATA_ROOT = '/var/lib/dokku/data/snapshot';

describe('snapshot:volume', () => {
  let dokku: DokkuSnapshot;
  const APP = 'snap-vol-test';
  let STORAGE_DIR: string;

  beforeAll(() => {
    dokku = new DokkuSnapshot();
    dokku.createTestApp(APP);

    // Use a temp directory we can write to as the storage mount.
    // Must be world-readable/writable so the dokku user can tar and extract.
    STORAGE_DIR = mkdtempSync(join(tmpdir(), 'snap-vol-test-'));
    chmodSync(STORAGE_DIR, 0o777);
    dokku.setStorageMount(APP, `${STORAGE_DIR}:/app/uploads`);
  });

  afterAll(async () => {
    try { dokku.runDokku('storage:unmount', APP, `${STORAGE_DIR}:/app/uploads`); } catch { /* ignore */ }
    try { rmSync(STORAGE_DIR, { recursive: true }); } catch { /* ignore */ }
    await dokku.cleanup();
  });

  describe('volume:exclude / volume:include / volume:list', () => {
    it('lists volumes with included status by default', async () => {
      const result = await dokku.exec('volume:list', APP);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(STORAGE_DIR);
      expect(result.stdout).toContain('[included]');
    });

    it('excludes a volume', async () => {
      const result = await dokku.exec('volume:exclude', APP, STORAGE_DIR);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Excluded');

      const listResult = await dokku.exec('volume:list', APP);
      expect(listResult.stdout).toContain('[excluded]');
    });

    it('does not duplicate exclusion', async () => {
      const result = await dokku.exec('volume:exclude', APP, STORAGE_DIR);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('already excluded');
    });

    it('re-includes a volume', async () => {
      const result = await dokku.exec('volume:include', APP, STORAGE_DIR);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Re-included');

      const listResult = await dokku.exec('volume:list', APP);
      expect(listResult.stdout).toContain('[included]');
    });
  });

  describe('volume backup round-trip', () => {
    it('backs up and restores volume data', async () => {
      // Write test data into the storage directory
      writeFileSync(join(STORAGE_DIR, 'test-file.txt'), 'hello volumes\n');
      mkdirSync(join(STORAGE_DIR, 'subdir'), { recursive: true });
      writeFileSync(join(STORAGE_DIR, 'subdir', 'nested.txt'), 'nested data\n');

      // Create snapshot
      const createResult = await dokku.exec('create', APP);
      expect(createResult.exitCode).toBe(0);
      expect(createResult.stdout).toContain('Backing up volume');
      const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
      const snapshotId = match![1];

      // Verify volume archive exists in snapshot
      const snapshotDir = `${PLUGIN_DATA_ROOT}/${APP}/${snapshotId}`;
      expect(dokku.pathExists(`${snapshotDir}/volumes`)).toBe(true);
      expect(dokku.pathExists(`${snapshotDir}/volumes/manifest.txt`)).toBe(true);
      const manifest = dokku.readFile(`${snapshotDir}/volumes/manifest.txt`);
      expect(manifest).toContain(STORAGE_DIR);

      // Delete the volume contents
      rmSync(join(STORAGE_DIR, 'test-file.txt'));
      rmSync(join(STORAGE_DIR, 'subdir'), { recursive: true });
      expect(existsSync(join(STORAGE_DIR, 'test-file.txt'))).toBe(false);

      // Restore
      const restoreResult = await dokku.exec('restore', APP, snapshotId, '--force');
      expect(restoreResult.exitCode).toBe(0);
      expect(restoreResult.stdout).toContain('Restoring volume');

      // Verify data restored
      const restored = readFileSync(join(STORAGE_DIR, 'test-file.txt'), 'utf-8').trim();
      expect(restored).toBe('hello volumes');
      const nestedRestored = readFileSync(join(STORAGE_DIR, 'subdir', 'nested.txt'), 'utf-8').trim();
      expect(nestedRestored).toBe('nested data');
    });

    it('skips excluded volumes during backup', async () => {
      // Exclude the volume
      await dokku.exec('volume:exclude', APP, STORAGE_DIR);

      // Write data
      writeFileSync(join(STORAGE_DIR, 'excluded.txt'), 'should not be backed up\n');

      // Create snapshot
      const createResult = await dokku.exec('create', APP);
      expect(createResult.exitCode).toBe(0);
      expect(createResult.stdout).toContain('Skipping excluded volume');
      const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
      const snapshotId = match![1];

      // Verify no volume archive for this path
      const snapshotDir = `${PLUGIN_DATA_ROOT}/${APP}/${snapshotId}`;
      const manifestExists = dokku.pathExists(`${snapshotDir}/volumes/manifest.txt`);
      if (manifestExists) {
        const manifest = dokku.readFile(`${snapshotDir}/volumes/manifest.txt`);
        expect(manifest).not.toContain(STORAGE_DIR);
      }

      // Re-include for other tests
      await dokku.exec('volume:include', APP, STORAGE_DIR);
    });
  });
});
