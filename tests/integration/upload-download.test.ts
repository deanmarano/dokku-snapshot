import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DokkuSnapshot } from '../helpers/dokku';
import { execSync } from 'child_process';

describe('snapshot:upload and snapshot:download with file provider', () => {
  let dokku: DokkuSnapshot;
  const APP = 'snap-upload-test';
  const TEST_PASSWORD = 'upload-test-pw-123';
  const PROVIDER_NAME = 'test-local';
  const BACKUP_DIR = '/tmp/snapshot-upload-test-' + Date.now();
  let snapshotId: string;

  beforeAll(async () => {
    dokku = new DokkuSnapshot();
    dokku.createTestApp(APP);
    dokku.setAppConfig(APP, { UPLOAD_KEY: 'upload_value', SECRET: 'top-secret' });

    // Create a snapshot
    const result = await dokku.exec('create', APP);
    expect(result.exitCode).toBe(0);
    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    expect(match).not.toBeNull();
    snapshotId = match![1];

    // Create the file provider
    const addResult = await dokku.exec('provider:add', PROVIDER_NAME, '--type', 'file', '--path', BACKUP_DIR);
    expect(addResult.exitCode).toBe(0);
  });

  afterAll(async () => {
    // Clean up provider
    try { await dokku.exec('provider:delete', PROVIDER_NAME); } catch { /* ignore */ }
    // Clean up backup dir
    try { execSync(`rm -rf ${BACKUP_DIR}`); } catch { /* ignore */ }
    await dokku.cleanup();
  });

  describe('provider lifecycle', () => {
    const LIFECYCLE_PROVIDER = 'lifecycle-test';

    afterAll(async () => {
      try { await dokku.exec('provider:delete', LIFECYCLE_PROVIDER); } catch { /* ignore */ }
    });

    it('provider:add creates a provider', async () => {
      const result = await dokku.exec('provider:add', LIFECYCLE_PROVIDER, '--type', 's3', '--bucket', 'my-bucket', '--region', 'us-east-1');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Provider 'lifecycle-test' created");
    });

    it('provider:show displays config', async () => {
      const result = await dokku.exec('provider:show', LIFECYCLE_PROVIDER);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('TYPE=s3');
      expect(result.stdout).toContain('BUCKET=my-bucket');
      expect(result.stdout).toContain('REGION=us-east-1');
    });

    it('provider:set updates a config key', async () => {
      const setResult = await dokku.exec('provider:set', LIFECYCLE_PROVIDER, 'PREFIX', 'dokku-snaps');
      expect(setResult.exitCode).toBe(0);

      const showResult = await dokku.exec('provider:show', LIFECYCLE_PROVIDER);
      expect(showResult.stdout).toContain('PREFIX=dokku-snaps');
    });

    it('provider:list includes the provider', async () => {
      const result = await dokku.exec('provider:list');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('lifecycle-test');
      expect(result.stdout).toContain('s3');
    });

    it('provider:add rejects duplicate names', async () => {
      const result = await dokku.exec('provider:add', LIFECYCLE_PROVIDER, '--type', 'file', '--path', '/tmp');
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('already exists');
    });

    it('provider:delete removes the provider', async () => {
      const result = await dokku.exec('provider:delete', LIFECYCLE_PROVIDER);
      expect(result.exitCode).toBe(0);

      const listResult = await dokku.exec('provider:list');
      expect(listResult.stdout).not.toContain('lifecycle-test');
    });
  });

  describe('provider:set-default and provider:unset-default', () => {
    it('sets default provider for an app', async () => {
      const result = await dokku.exec('provider:set-default', APP, PROVIDER_NAME);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`set to '${PROVIDER_NAME}'`);
    });

    it('unsets default provider for an app', async () => {
      const result = await dokku.exec('provider:unset-default', APP);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Default provider removed');
    });

    it('unset-default fails when no default is set', async () => {
      const result = await dokku.exec('provider:unset-default', APP);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('No default provider');
    });
  });

  describe('upload and download round-trip', () => {
    it('uploads a snapshot and downloads it back', async () => {
      // Upload with explicit provider
      const uploadResult = await dokku.exec('upload', APP, snapshotId, '--password', TEST_PASSWORD, '--provider', PROVIDER_NAME);
      expect(uploadResult.exitCode).toBe(0);
      expect(uploadResult.stdout).toContain('Uploaded as');

      // Delete the local snapshot
      const deleteResult = await dokku.exec('delete', APP, snapshotId);
      expect(deleteResult.exitCode).toBe(0);

      // Verify it's gone
      const listBefore = await dokku.exec('list', APP);
      expect(listBefore.stdout).not.toContain(snapshotId);

      // Download it back
      const downloadResult = await dokku.exec('download', APP, snapshotId, '--password', TEST_PASSWORD, '--provider', PROVIDER_NAME);
      expect(downloadResult.exitCode).toBe(0);
      expect(downloadResult.stdout).toContain('Downloaded and imported snapshot');

      // Verify it's back in the list
      const listAfter = await dokku.exec('list', APP);
      expect(listAfter.exitCode).toBe(0);
      expect(listAfter.stdout).toContain(snapshotId);
    });

    it('upload works with app default provider', async () => {
      // Set default
      await dokku.exec('provider:set-default', APP, PROVIDER_NAME);

      // Upload without --provider flag
      const result = await dokku.exec('upload', APP, snapshotId, '--password', TEST_PASSWORD);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Uploaded as');

      // Clean up
      await dokku.exec('provider:unset-default', APP);
    });
  });

  describe('error cases', () => {
    it('upload fails without password', async () => {
      const result = await dokku.exec('upload', APP, snapshotId, '--provider', PROVIDER_NAME);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Password is required');
    });

    it('upload fails without provider', async () => {
      const result = await dokku.exec('upload', APP, snapshotId, '--password', TEST_PASSWORD);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('No provider specified');
    });

    it('upload fails for non-existent snapshot', async () => {
      const result = await dokku.exec('upload', APP, 'no-such-snapshot', '--password', TEST_PASSWORD, '--provider', PROVIDER_NAME);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('not found');
    });

    it('download fails with wrong password', async () => {
      const result = await dokku.exec('download', APP, snapshotId, '--password', 'wrong-password', '--provider', PROVIDER_NAME);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Decryption failed');
    });

    it('provider:test works with file provider', async () => {
      const result = await dokku.exec('provider:test', PROVIDER_NAME);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('OK');
    });
  });
});
