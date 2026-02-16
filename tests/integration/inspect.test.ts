import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DokkuSnapshot } from '../helpers/dokku';

describe('snapshot:inspect', () => {
  let dokku: DokkuSnapshot;

  beforeAll(() => {
    dokku = new DokkuSnapshot();
  });

  afterAll(async () => {
    await dokku.cleanup();
  });

  it('shows all config for an app', async () => {
    dokku.createTestApp('snap-inspect-test');
    dokku.setAppConfig('snap-inspect-test', { MY_VAR: 'hello' });
    dokku.runDokku('domains:add', 'snap-inspect-test', 'example.com');

    const result = await dokku.exec('inspect', 'snap-inspect-test');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Inspecting snap-inspect-test');
    expect(result.stdout).toContain('Config vars');
    expect(result.stdout).toContain('MY_VAR');
    expect(result.stdout).toContain('Domains');
    expect(result.stdout).toContain('example.com');
    expect(result.stdout).toContain('Linked services');
  });

  it('shows nginx overrides', async () => {
    dokku.createTestApp('snap-inspect-nginx');
    dokku.setNginxProperty('snap-inspect-nginx', 'client-max-body-size', '25m');

    const result = await dokku.exec('inspect', 'snap-inspect-nginx');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Nginx');
    expect(result.stdout).toContain('25m');
  });

  it('fails for non-existent app', async () => {
    const result = await dokku.exec('inspect', 'snap-nonexistent-app');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('does not exist');
  });
});
