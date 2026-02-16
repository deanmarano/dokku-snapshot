import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DokkuSnapshot } from '../helpers/dokku';

describe('snapshot:create', () => {
  let dokku: DokkuSnapshot;
  const PLUGIN_DATA_ROOT = '/var/lib/dokku/data/snapshot';

  beforeAll(() => {
    dokku = new DokkuSnapshot();
  });

  afterAll(async () => {
    await dokku.cleanup();
  });

  it('creates snapshot directory with correct structure', async () => {
    dokku.createTestApp('snap-create-test');
    dokku.setAppConfig('snap-create-test', { FOO: 'bar' });

    const result = await dokku.exec('create', 'snap-create-test');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Snapshot created');

    // Get the snapshot id from output
    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    expect(match).not.toBeNull();
    const snapshotId = match![1];

    const snapshotDir = `${PLUGIN_DATA_ROOT}/snap-create-test/${snapshotId}`;
    expect(dokku.pathExists(snapshotDir)).toBe(true);
    expect(dokku.pathExists(`${snapshotDir}/metadata.json`)).toBe(true);
    expect(dokku.pathExists(`${snapshotDir}/config.env`)).toBe(true);
    expect(dokku.pathExists(`${snapshotDir}/domains.txt`)).toBe(true);
  });

  it('captures all config vars', async () => {
    dokku.createTestApp('snap-config-test');
    dokku.setAppConfig('snap-config-test', {
      DATABASE_URL: 'postgres://localhost/db',
      SECRET_KEY: 'mysecret123',
      APP_ENV: 'production',
    });

    const result = await dokku.exec('create', 'snap-config-test');
    expect(result.exitCode).toBe(0);

    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    const configEnv = dokku.readFile(
      `${PLUGIN_DATA_ROOT}/snap-config-test/${snapshotId}/config.env`
    );
    expect(configEnv).toContain('DATABASE_URL');
    expect(configEnv).toContain('postgres://localhost/db');
    expect(configEnv).toContain('SECRET_KEY');
    expect(configEnv).toContain('mysecret123');
    expect(configEnv).toContain('APP_ENV');
    expect(configEnv).toContain('production');
  });

  it('captures domain configuration', async () => {
    dokku.createTestApp('snap-domain-test');
    dokku.runDokku('domains:add', 'snap-domain-test', 'example.com');
    dokku.runDokku('domains:add', 'snap-domain-test', 'www.example.com');

    const result = await dokku.exec('create', 'snap-domain-test');
    expect(result.exitCode).toBe(0);

    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    const domains = dokku.readFile(
      `${PLUGIN_DATA_ROOT}/snap-domain-test/${snapshotId}/domains.txt`
    );
    expect(domains).toContain('example.com');
    expect(domains).toContain('www.example.com');
  });

  it('captures metadata with app name and timestamp', async () => {
    dokku.createTestApp('snap-meta-test');

    const result = await dokku.exec('create', 'snap-meta-test');
    expect(result.exitCode).toBe(0);

    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    const metadata = JSON.parse(
      dokku.readFile(`${PLUGIN_DATA_ROOT}/snap-meta-test/${snapshotId}/metadata.json`)
    );
    expect(metadata.app).toBe('snap-meta-test');
    expect(metadata.timestamp).toBe(snapshotId);
    expect(metadata.snapshot_version).toBe('3');
    expect(metadata.dokku_version).toBeTruthy();
  });

  it('handles app with no linked services', async () => {
    dokku.createTestApp('snap-nosvc-test');

    const result = await dokku.exec('create', 'snap-nosvc-test');
    expect(result.exitCode).toBe(0);

    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    // services dir should exist but be empty
    const servicesDir = `${PLUGIN_DATA_ROOT}/snap-nosvc-test/${snapshotId}/services`;
    expect(dokku.pathExists(servicesDir)).toBe(true);
  });

  it('fails gracefully for non-existent app', async () => {
    const result = await dokku.exec('create', 'snap-nonexistent-app');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('does not exist');
  });

  it('captures port mappings', async () => {
    dokku.createTestApp('snap-ports-test');
    dokku.setPortMap('snap-ports-test', 'http:80:5000', 'https:443:5000');

    const result = await dokku.exec('create', 'snap-ports-test');
    expect(result.exitCode).toBe(0);

    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    const ports = dokku.readFile(
      `${PLUGIN_DATA_ROOT}/snap-ports-test/${snapshotId}/ports.txt`
    );
    expect(ports).toContain('80');
    expect(ports).toContain('5000');
  });

  it('captures git settings', async () => {
    dokku.createTestApp('snap-git-test');
    dokku.setGitProperty('snap-git-test', 'deploy-branch', 'production');

    const result = await dokku.exec('create', 'snap-git-test');
    expect(result.exitCode).toBe(0);

    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    const git = dokku.readFile(
      `${PLUGIN_DATA_ROOT}/snap-git-test/${snapshotId}/git.txt`
    );
    expect(git).toContain('production');
  });

  it('captures v3 metadata with snapshot_version field', async () => {
    dokku.createTestApp('snap-v2-test');

    const result = await dokku.exec('create', 'snap-v2-test');
    expect(result.exitCode).toBe(0);

    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    const metadata = JSON.parse(
      dokku.readFile(`${PLUGIN_DATA_ROOT}/snap-v2-test/${snapshotId}/metadata.json`)
    );
    expect(metadata.snapshot_version).toBe('3');
  });

  it('handles missing optional plugins gracefully', async () => {
    dokku.createTestApp('snap-optional-test');

    const result = await dokku.exec('create', 'snap-optional-test');
    expect(result.exitCode).toBe(0);

    // letsencrypt plugin likely not installed - should not cause error
    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    expect(match).not.toBeNull();
  });

  it('captures nginx settings', async () => {
    dokku.createTestApp('snap-nginx-test');
    dokku.setNginxProperty('snap-nginx-test', 'client-max-body-size', '50m');

    const result = await dokku.exec('create', 'snap-nginx-test');
    expect(result.exitCode).toBe(0);

    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    const nginx = dokku.readFile(
      `${PLUGIN_DATA_ROOT}/snap-nginx-test/${snapshotId}/nginx.txt`
    );
    expect(nginx).toContain('50m');
  });

  it('captures scheduler settings', async () => {
    dokku.createTestApp('snap-sched-test');

    const result = await dokku.exec('create', 'snap-sched-test');
    expect(result.exitCode).toBe(0);

    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    expect(dokku.pathExists(`${PLUGIN_DATA_ROOT}/snap-sched-test/${snapshotId}/scheduler.txt`)).toBe(true);
    expect(dokku.pathExists(`${PLUGIN_DATA_ROOT}/snap-sched-test/${snapshotId}/registry.txt`)).toBe(true);
    expect(dokku.pathExists(`${PLUGIN_DATA_ROOT}/snap-sched-test/${snapshotId}/cron.txt`)).toBe(true);
    expect(dokku.pathExists(`${PLUGIN_DATA_ROOT}/snap-sched-test/${snapshotId}/app-json.txt`)).toBe(true);
  });

  it('detects and exports linked postgres service', async () => {
    dokku.createTestApp('snap-pg-test');
    dokku.createPostgresService('snap-pg-svc');
    dokku.linkPostgres('snap-pg-svc', 'snap-pg-test');

    const result = await dokku.exec('create', 'snap-pg-test');
    expect(result.exitCode).toBe(0);

    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    const dumpPath = `${PLUGIN_DATA_ROOT}/snap-pg-test/${snapshotId}/services/postgres/snap-pg-svc.dump`;
    expect(dokku.pathExists(dumpPath)).toBe(true);
  });

  it('captures service info alongside dump', async () => {
    dokku.createTestApp('snap-info-test');
    dokku.createPostgresService('snap-info-svc');
    dokku.linkPostgres('snap-info-svc', 'snap-info-test');

    const result = await dokku.exec('create', 'snap-info-test');
    expect(result.exitCode).toBe(0);

    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    const svcDir = `${PLUGIN_DATA_ROOT}/snap-info-test/${snapshotId}/services/postgres`;
    expect(dokku.pathExists(`${svcDir}/snap-info-svc.dump`)).toBe(true);
    expect(dokku.pathExists(`${svcDir}/snap-info-svc.info`)).toBe(true);

    const info = dokku.readFile(`${svcDir}/snap-info-svc.info`);
    expect(info).toContain('Version');
  });

  it('captures v3 metadata', async () => {
    dokku.createTestApp('snap-v3-test');

    const result = await dokku.exec('create', 'snap-v3-test');
    expect(result.exitCode).toBe(0);

    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    const snapshotId = match![1];

    const metadata = JSON.parse(
      dokku.readFile(`${PLUGIN_DATA_ROOT}/snap-v3-test/${snapshotId}/metadata.json`)
    );
    expect(metadata.snapshot_version).toBe('3');
  });
});
