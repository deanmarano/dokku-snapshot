import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DokkuSnapshot } from '../helpers/dokku';

describe('snapshot:inspect', () => {
  let dokku: DokkuSnapshot;
  const APP = 'snap-inspect-full';
  const PG_SVC = 'snap-inspect-pg';
  let inspectOutput: string;

  beforeAll(async () => {
    dokku = new DokkuSnapshot();

    // Create one app with config, domains, nginx, and postgres
    dokku.createTestApp(APP);
    dokku.setAppConfig(APP, { MY_VAR: 'hello' });
    dokku.runDokku('domains:add', APP, 'example.com');
    dokku.setNginxProperty(APP, 'client-max-body-size', '25m');
    dokku.createPostgresService(PG_SVC);
    dokku.linkPostgres(PG_SVC, APP);

    // Run inspect once
    const result = await dokku.exec('inspect', APP);
    expect(result.exitCode).toBe(0);
    inspectOutput = result.stdout;
  });

  afterAll(async () => {
    await dokku.cleanup();
  });

  it('shows app config, domains, and nginx settings', () => {
    expect(inspectOutput).toContain('Inspecting snap-inspect-full');
    expect(inspectOutput).toContain('Config vars');
    expect(inspectOutput).toContain('MY_VAR');
    expect(inspectOutput).toContain('Domains');
    expect(inspectOutput).toContain('example.com');
    expect(inspectOutput).toContain('Nginx');
    expect(inspectOutput).toContain('25m');
  });

  it('shows linked service with version and status', () => {
    expect(inspectOutput).toContain('Linked services');
    expect(inspectOutput).toContain(`postgres: ${PG_SVC}`);
    expect(inspectOutput).toContain('Version:');
  });

  it('fails for non-existent app', async () => {
    const result = await dokku.exec('inspect', 'snap-nonexistent-app');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('does not exist');
  });
});
