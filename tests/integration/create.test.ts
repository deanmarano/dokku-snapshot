import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DokkuSnapshot } from '../helpers/dokku';

describe('snapshot:create', () => {
  let dokku: DokkuSnapshot;
  const PLUGIN_DATA_ROOT = '/var/lib/dokku/data/snapshot';
  const APP = 'snap-create-full';
  const PG_SVC = 'snap-create-pg';
  let snapshotId: string;
  let snapshotDir: string;

  beforeAll(async () => {
    dokku = new DokkuSnapshot();

    // Create one app with all settings configured
    dokku.createTestApp(APP);
    dokku.setAppConfig(APP, {
      DATABASE_URL: 'postgres://localhost/db',
      SECRET_KEY: 'mysecret123',
      APP_ENV: 'production',
    });
    dokku.runDokku('domains:add', APP, 'example.com');
    dokku.runDokku('domains:add', APP, 'www.example.com');
    dokku.setPortMap(APP, 'http:80:5000', 'https:443:5000');
    dokku.setGitProperty(APP, 'deploy-branch', 'production');
    dokku.setNginxProperty(APP, 'client-max-body-size', '50m');

    // Create and link postgres service
    dokku.createPostgresService(PG_SVC);
    dokku.linkPostgres(PG_SVC, APP);

    // Take one snapshot
    const result = await dokku.exec('create', APP);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Snapshot created');
    const match = result.stdout.match(/Snapshot created:\s*(\S+)/);
    expect(match).not.toBeNull();
    snapshotId = match![1];
    snapshotDir = `${PLUGIN_DATA_ROOT}/${APP}/${snapshotId}`;
  });

  afterAll(async () => {
    await dokku.cleanup();
  });

  it('creates snapshot directory with correct structure', () => {
    expect(dokku.pathExists(snapshotDir)).toBe(true);
    expect(dokku.pathExists(`${snapshotDir}/metadata.json`)).toBe(true);
    expect(dokku.pathExists(`${snapshotDir}/config.env`)).toBe(true);
    expect(dokku.pathExists(`${snapshotDir}/domains.txt`)).toBe(true);
    expect(dokku.pathExists(`${snapshotDir}/services`)).toBe(true);
  });

  it('captures v3 metadata with app name and timestamp', () => {
    const metadata = JSON.parse(
      dokku.readFile(`${snapshotDir}/metadata.json`)
    );
    expect(metadata.app).toBe(APP);
    expect(metadata.timestamp).toBe(snapshotId);
    expect(metadata.snapshot_version).toBe('3');
    expect(metadata.dokku_version).toBeTruthy();
  });

  it('captures all config vars', () => {
    const configEnv = dokku.readFile(`${snapshotDir}/config.env`);
    expect(configEnv).toContain('DATABASE_URL');
    expect(configEnv).toContain('postgres://localhost/db');
    expect(configEnv).toContain('SECRET_KEY');
    expect(configEnv).toContain('mysecret123');
    expect(configEnv).toContain('APP_ENV');
    expect(configEnv).toContain('production');
  });

  it('captures domain configuration', () => {
    const domains = dokku.readFile(`${snapshotDir}/domains.txt`);
    expect(domains).toContain('example.com');
    expect(domains).toContain('www.example.com');
  });

  it('captures port mappings', () => {
    const ports = dokku.readFile(`${snapshotDir}/ports.txt`);
    expect(ports).toContain('80');
    expect(ports).toContain('5000');
  });

  it('captures git settings', () => {
    const git = dokku.readFile(`${snapshotDir}/git.txt`);
    expect(git).toContain('production');
  });

  it('captures nginx settings', () => {
    const nginx = dokku.readFile(`${snapshotDir}/nginx.txt`);
    expect(nginx).toContain('50m');
  });

  it('captures extended report files', () => {
    expect(dokku.pathExists(`${snapshotDir}/scheduler.txt`)).toBe(true);
    expect(dokku.pathExists(`${snapshotDir}/registry.txt`)).toBe(true);
    expect(dokku.pathExists(`${snapshotDir}/cron.txt`)).toBe(true);
    expect(dokku.pathExists(`${snapshotDir}/app-json.txt`)).toBe(true);
  });

  it('exports linked postgres service dump and info', () => {
    const svcDir = `${snapshotDir}/services/postgres`;
    expect(dokku.pathExists(`${svcDir}/${PG_SVC}.dump`)).toBe(true);
    expect(dokku.pathExists(`${svcDir}/${PG_SVC}.info`)).toBe(true);

    const info = dokku.readFile(`${svcDir}/${PG_SVC}.info`);
    expect(info).toContain('Version');
  });

  it('fails gracefully for non-existent app', async () => {
    const result = await dokku.exec('create', 'snap-nonexistent-app');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('does not exist');
  });
});
