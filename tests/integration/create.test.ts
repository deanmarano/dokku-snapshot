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

    // Create one app with a linked postgres service
    dokku.createTestApp(APP);
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
    expect(dokku.pathExists(`${snapshotDir}/services`)).toBe(true);
  });

  it('captures v4 metadata with app name and timestamp', () => {
    const metadata = JSON.parse(
      dokku.readFile(`${snapshotDir}/metadata.json`)
    );
    expect(metadata.app).toBe(APP);
    expect(metadata.timestamp).toBe(snapshotId);
    expect(metadata.snapshot_version).toBe('4');
    expect(metadata.dokku_version).toBeTruthy();
  });

  it('does not capture config files', () => {
    expect(dokku.pathExists(`${snapshotDir}/config.env`)).toBe(false);
    expect(dokku.pathExists(`${snapshotDir}/domains.txt`)).toBe(false);
    expect(dokku.pathExists(`${snapshotDir}/ports.txt`)).toBe(false);
    expect(dokku.pathExists(`${snapshotDir}/proxy.txt`)).toBe(false);
    expect(dokku.pathExists(`${snapshotDir}/network.txt`)).toBe(false);
    expect(dokku.pathExists(`${snapshotDir}/docker-options.txt`)).toBe(false);
    expect(dokku.pathExists(`${snapshotDir}/ps.txt`)).toBe(false);
    expect(dokku.pathExists(`${snapshotDir}/ps-scale.txt`)).toBe(false);
    expect(dokku.pathExists(`${snapshotDir}/storage.txt`)).toBe(false);
    expect(dokku.pathExists(`${snapshotDir}/git.txt`)).toBe(false);
    expect(dokku.pathExists(`${snapshotDir}/nginx.txt`)).toBe(false);
    expect(dokku.pathExists(`${snapshotDir}/scheduler.txt`)).toBe(false);
    expect(dokku.pathExists(`${snapshotDir}/registry.txt`)).toBe(false);
    expect(dokku.pathExists(`${snapshotDir}/cron.txt`)).toBe(false);
    expect(dokku.pathExists(`${snapshotDir}/app-json.txt`)).toBe(false);
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
