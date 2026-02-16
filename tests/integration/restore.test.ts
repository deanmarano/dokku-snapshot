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

  it('restores all app configuration settings', async () => {
    const APP = 'snap-restore-all';
    dokku.createTestApp(APP);

    // Set up all config types
    dokku.setAppConfig(APP, { MY_VAR: 'hello', OTHER_VAR: 'world' });
    dokku.runDokku('domains:add', APP, 'mysite.com');
    dokku.runDokku('domains:add', APP, 'api.mysite.com');
    dokku.setPortMap(APP, 'http:80:5000', 'https:443:5000');
    dokku.setDockerOption(APP, 'deploy', '--restart=always');
    dokku.setGitProperty(APP, 'deploy-branch', 'production');
    dokku.setProxyEnabled(APP, false);
    dokku.setBuilder(APP, 'dockerfile');
    dokku.setNginxProperty(APP, 'client-max-body-size', '50m');

    // Create snapshot
    const createResult = await dokku.exec('create', APP);
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // Clear everything
    dokku.runDokku('config:clear', '--no-restart', APP);
    dokku.runDokku('domains:clear', APP);
    dokku.runDokku('ports:clear', APP);
    try { dokku.runDokku('docker-options:remove', APP, 'deploy', '--restart=always'); } catch { /* may not exist */ }
    dokku.setGitProperty(APP, 'deploy-branch', '');
    dokku.setProxyEnabled(APP, true);
    dokku.runDokku('builder:set', APP, 'selected', '');
    dokku.runDokku('nginx:set', APP, 'client-max-body-size');

    // Verify some settings are cleared
    expect(dokku.getAppConfig(APP)['MY_VAR']).toBeUndefined();
    expect(dokku.getAppDomains(APP)).not.toContain('mysite.com');
    expect(dokku.getNginxProperty(APP, 'client-max-body-size')).toBe('');

    // Restore
    const restoreResult = await dokku.exec('restore', APP, snapshotId, '--force');
    expect(restoreResult.exitCode).toBe(0);

    // Verify everything restored
    const config = dokku.getAppConfig(APP);
    expect(config['MY_VAR']).toBe('hello');
    expect(config['OTHER_VAR']).toBe('world');

    const domains = dokku.getAppDomains(APP);
    expect(domains).toContain('mysite.com');
    expect(domains).toContain('api.mysite.com');

    const ports = dokku.getPortMap(APP);
    expect(ports).toContain('http:80:5000');
    expect(ports).toContain('https:443:5000');

    const dockerOpts = dokku.getDockerOptions(APP);
    expect(dockerOpts).toContain('--restart=always');

    const branch = dokku.getGitProperty(APP, 'deploy-branch');
    expect(branch).toBe('production');

    const proxyReport = dokku.runDokku('proxy:report', APP);
    expect(proxyReport).toContain('false');

    const builderReport = dokku.runDokku('builder:report', APP);
    expect(builderReport).toContain('dockerfile');

    const nginxVal = dokku.getNginxProperty(APP, 'client-max-body-size');
    expect(nginxVal).toBe('50m');
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

  it('handles v1 snapshot gracefully', async () => {
    const APP = 'snap-restore-v1';
    dokku.createTestApp(APP);
    dokku.setAppConfig(APP, { MY_VAR: 'test' });

    const createResult = await dokku.exec('create', APP);
    expect(createResult.exitCode).toBe(0);
    const match = createResult.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // Simulate v1 by removing newer files
    const snapshotDir = `/var/lib/dokku/data/snapshot/${APP}/${snapshotId}`;
    for (const file of ['ports.txt', 'ps-scale.txt', 'git.txt', 'checks.txt', 'resource.txt', 'builder.txt', 'buildpacks.txt', 'nginx.txt', 'scheduler.txt', 'registry.txt', 'cron.txt', 'app-json.txt']) {
      try {
        dokku.readFile(`${snapshotDir}/${file}`);
        const cmd = process.env.DOKKU_USE_SUDO === 'true' ? `sudo rm -f ${snapshotDir}/${file}` : `rm -f ${snapshotDir}/${file}`;
        require('child_process').execSync(cmd);
      } catch { /* file doesn't exist */ }
    }

    // Clear config
    dokku.runDokku('config:clear', '--no-restart', APP);

    // Restore should succeed
    const restoreResult = await dokku.exec('restore', APP, snapshotId, '--force');
    expect(restoreResult.exitCode).toBe(0);

    const config = dokku.getAppConfig(APP);
    expect(config['MY_VAR']).toBe('test');
  });
});
