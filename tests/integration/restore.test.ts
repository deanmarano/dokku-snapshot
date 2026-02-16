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

  it('restores port mappings', async () => {
    dokku.createTestApp('snap-restore-ports');
    dokku.setPortMap('snap-restore-ports', 'http:80:5000', 'https:443:5000');

    const createResult = await dokku.exec('create', 'snap-restore-ports');
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // Clear ports
    dokku.runDokku('ports:clear', 'snap-restore-ports');

    // Restore
    const restoreResult = await dokku.exec('restore', 'snap-restore-ports', snapshotId, '--force');
    expect(restoreResult.exitCode).toBe(0);

    // Verify ports restored
    const ports = dokku.getPortMap('snap-restore-ports');
    expect(ports).toContain('http:80:5000');
    expect(ports).toContain('https:443:5000');
  });

  it('restores docker options', async () => {
    dokku.createTestApp('snap-restore-dopt');
    dokku.setDockerOption('snap-restore-dopt', 'deploy', '--restart=always');

    const createResult = await dokku.exec('create', 'snap-restore-dopt');
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // Remove option
    try {
      dokku.runDokku('docker-options:remove', 'snap-restore-dopt', 'deploy', '--restart=always');
    } catch { /* may not exist */ }

    // Restore
    const restoreResult = await dokku.exec('restore', 'snap-restore-dopt', snapshotId, '--force');
    expect(restoreResult.exitCode).toBe(0);

    // Verify option restored
    const options = dokku.getDockerOptions('snap-restore-dopt');
    expect(options).toContain('--restart=always');
  });

  it('restores git deploy branch', async () => {
    dokku.createTestApp('snap-restore-git');
    dokku.setGitProperty('snap-restore-git', 'deploy-branch', 'production');

    const createResult = await dokku.exec('create', 'snap-restore-git');
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // Unset
    dokku.setGitProperty('snap-restore-git', 'deploy-branch', '');

    // Restore
    const restoreResult = await dokku.exec('restore', 'snap-restore-git', snapshotId, '--force');
    expect(restoreResult.exitCode).toBe(0);

    // Verify
    const branch = dokku.getGitProperty('snap-restore-git', 'deploy-branch');
    expect(branch).toBe('production');
  });

  it('restores proxy settings', async () => {
    dokku.createTestApp('snap-restore-proxy');
    dokku.setProxyEnabled('snap-restore-proxy', false);

    const createResult = await dokku.exec('create', 'snap-restore-proxy');
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // Re-enable proxy
    dokku.setProxyEnabled('snap-restore-proxy', true);

    // Restore
    const restoreResult = await dokku.exec('restore', 'snap-restore-proxy', snapshotId, '--force');
    expect(restoreResult.exitCode).toBe(0);

    // Verify proxy is disabled again
    const report = dokku.runDokku('proxy:report', 'snap-restore-proxy');
    expect(report).toContain('false');
  });

  it('restores builder settings', async () => {
    dokku.createTestApp('snap-restore-builder');
    dokku.setBuilder('snap-restore-builder', 'dockerfile');

    const createResult = await dokku.exec('create', 'snap-restore-builder');
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // Clear builder
    dokku.runDokku('builder:set', 'snap-restore-builder', 'selected', '');

    // Restore
    const restoreResult = await dokku.exec('restore', 'snap-restore-builder', snapshotId, '--force');
    expect(restoreResult.exitCode).toBe(0);

    // Verify
    const report = dokku.runDokku('builder:report', 'snap-restore-builder');
    expect(report).toContain('dockerfile');
  });

  it('restores nginx settings', async () => {
    dokku.createTestApp('snap-restore-nginx');
    dokku.setNginxProperty('snap-restore-nginx', 'client-max-body-size', '50m');

    const createResult = await dokku.exec('create', 'snap-restore-nginx');
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // Clear nginx property
    dokku.runDokku('nginx:set', 'snap-restore-nginx', 'client-max-body-size');

    // Verify cleared
    const before = dokku.getNginxProperty('snap-restore-nginx', 'client-max-body-size');
    expect(before).toBe('');

    // Restore
    const restoreResult = await dokku.exec('restore', 'snap-restore-nginx', snapshotId, '--force');
    expect(restoreResult.exitCode).toBe(0);

    // Verify
    const after = dokku.getNginxProperty('snap-restore-nginx', 'client-max-body-size');
    expect(after).toBe('50m');
  });

  it('handles v1 snapshot gracefully', async () => {
    dokku.createTestApp('snap-restore-v1');
    dokku.setAppConfig('snap-restore-v1', { MY_VAR: 'test' });

    // Create a snapshot (v2)
    const createResult = await dokku.exec('create', 'snap-restore-v1');
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // Simulate v1 by removing new files
    const snapshotDir = `/var/lib/dokku/data/snapshot/snap-restore-v1/${snapshotId}`;
    for (const file of ['ports.txt', 'ps-scale.txt', 'git.txt', 'checks.txt', 'resource.txt', 'builder.txt', 'buildpacks.txt', 'nginx.txt', 'scheduler.txt', 'registry.txt', 'cron.txt', 'app-json.txt']) {
      try {
        dokku.readFile(`${snapshotDir}/${file}`);
        // File exists, remove it to simulate v1
        const cmd = process.env.DOKKU_USE_SUDO === 'true' ? `sudo rm -f ${snapshotDir}/${file}` : `rm -f ${snapshotDir}/${file}`;
        require('child_process').execSync(cmd);
      } catch { /* file doesn't exist, that's fine */ }
    }

    // Clear config
    dokku.runDokku('config:clear', '--no-restart', 'snap-restore-v1');

    // Restore should succeed even without new files
    const restoreResult = await dokku.exec('restore', 'snap-restore-v1', snapshotId, '--force');
    expect(restoreResult.exitCode).toBe(0);

    // Config should still be restored
    const config = dokku.getAppConfig('snap-restore-v1');
    expect(config['MY_VAR']).toBe('test');
  });

  it('displays service version on restore', async () => {
    dokku.createTestApp('snap-restore-ver');
    dokku.createPostgresService('snap-restore-ver-svc');
    dokku.linkPostgres('snap-restore-ver-svc', 'snap-restore-ver');

    // Create snapshot (includes postgres info + export)
    const createResult = await dokku.exec('create', 'snap-restore-ver');
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // Restore (should display version info)
    const restoreResult = await dokku.exec('restore', 'snap-restore-ver', snapshotId, '--force');
    expect(restoreResult.exitCode).toBe(0);
    expect(restoreResult.stdout).toContain('Snapshot version:');
  });

  it('imports service data on restore', async () => {
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
