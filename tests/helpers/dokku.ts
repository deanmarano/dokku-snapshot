import { execSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DOKKU_HOST = process.env.DOKKU_HOST || 'local';
const DOKKU_SSH_PORT = process.env.DOKKU_SSH_PORT || '22';
const USE_SUDO = process.env.DOKKU_USE_SUDO === 'true';

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class DokkuSnapshot {
  private apps: string[] = [];
  private services: Array<{ type: string; name: string }> = [];

  private isRemote(): boolean {
    return DOKKU_HOST !== 'local' && DOKKU_HOST !== 'localhost' && DOKKU_HOST !== '127.0.0.1';
  }

  private buildCommand(args: string[]): string {
    const argsStr = args.join(' ');
    if (this.isRemote()) {
      return `ssh -o StrictHostKeyChecking=no -p ${DOKKU_SSH_PORT} dokku@${DOKKU_HOST} ${argsStr}`;
    }
    return USE_SUDO ? `sudo dokku ${argsStr}` : `dokku ${argsStr}`;
  }

  /** Execute a snapshot command and return exit code, stdout, stderr */
  async exec(...args: string[]): Promise<ExecResult> {
    const fullArgs = args[0]?.startsWith('snapshot:') ? args : ['snapshot:' + args[0], ...args.slice(1)];
    const cmd = this.buildCommand(fullArgs);

    try {
      const { stdout, stderr } = await execAsync(cmd);
      return { exitCode: 0, stdout, stderr };
    } catch (error: any) {
      return {
        exitCode: error.code || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
      };
    }
  }

  /** Run a dokku snapshot command synchronously */
  run(...args: string[]): string {
    const fullArgs = args[0]?.startsWith('snapshot:') ? args : ['snapshot:' + args[0], ...args.slice(1)];
    const cmd = this.buildCommand(fullArgs);
    return execSync(cmd, { encoding: 'utf-8' });
  }

  /** Run a generic dokku command */
  runDokku(...args: string[]): string {
    const cmd = this.buildCommand(args);
    return execSync(cmd, { encoding: 'utf-8' });
  }

  /** Run a generic dokku command async, returning ExecResult */
  async execDokku(...args: string[]): Promise<ExecResult> {
    const cmd = this.buildCommand(args);
    try {
      const { stdout, stderr } = await execAsync(cmd);
      return { exitCode: 0, stdout, stderr };
    } catch (error: any) {
      return {
        exitCode: error.code || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
      };
    }
  }

  /** Create a test app and track it for cleanup */
  createTestApp(name: string): void {
    this.runDokku('apps:create', name);
    this.apps.push(name);
  }

  /** Destroy a test app */
  destroyTestApp(name: string): void {
    try {
      this.runDokku('apps:destroy', name, '--force');
    } catch {
      // Already destroyed
    }
    this.apps = this.apps.filter(a => a !== name);
  }

  /** Set config vars on an app */
  setAppConfig(app: string, vars: Record<string, string>): void {
    const pairs = Object.entries(vars).map(([k, v]) => `${k}=${v}`);
    this.runDokku('config:set', '--no-restart', app, ...pairs);
  }

  /** Get config vars for an app as an object */
  getAppConfig(app: string): Record<string, string> {
    try {
      const output = this.runDokku('config:export', app);
      const config: Record<string, string> = {};
      for (const line of output.trim().split('\n')) {
        const match = line.match(/^export ([^=]+)='(.*)'/);
        if (match) config[match[1]] = match[2];
      }
      return config;
    } catch {
      return {};
    }
  }

  /** Get domains for an app */
  getAppDomains(app: string): string[] {
    try {
      const output = this.runDokku('domains:report', app);
      const match = output.match(/Domains app vhosts:\s*(.*)/);
      if (match && match[1].trim()) {
        return match[1].trim().split(/\s+/);
      }
      return [];
    } catch {
      return [];
    }
  }

  /** Create a postgres service and track for cleanup */
  createPostgresService(name: string): void {
    this.runDokku('postgres:create', name);
    this.services.push({ type: 'postgres', name });
  }

  /** Link a postgres service to an app */
  linkPostgres(service: string, app: string): void {
    this.runDokku('postgres:link', service, app);
  }

  /** Cleanup all created apps and services */
  async cleanup(): Promise<void> {
    for (const { type, name } of [...this.services].reverse()) {
      try {
        this.runDokku(`${type}:destroy`, name, '--force');
      } catch {
        // Already destroyed
      }
    }
    this.services = [];

    for (const app of [...this.apps].reverse()) {
      try {
        this.runDokku('apps:destroy', app, '--force');
      } catch {
        // Already destroyed
      }
    }
    this.apps = [];
  }

  /** Read a file from the Dokku host */
  readFile(path: string): string {
    if (this.isRemote()) {
      return execSync(
        `ssh -o StrictHostKeyChecking=no -p ${DOKKU_SSH_PORT} dokku@${DOKKU_HOST} cat ${path}`,
        { encoding: 'utf-8' }
      );
    }
    const cmd = USE_SUDO ? `sudo cat ${path}` : `cat ${path}`;
    return execSync(cmd, { encoding: 'utf-8' });
  }

  /** Check if a path exists on the Dokku host */
  pathExists(path: string): boolean {
    try {
      if (this.isRemote()) {
        execSync(
          `ssh -o StrictHostKeyChecking=no -p ${DOKKU_SSH_PORT} dokku@${DOKKU_HOST} test -e ${path}`,
        );
      } else {
        const cmd = USE_SUDO ? `sudo test -e ${path}` : `test -e ${path}`;
        execSync(cmd);
      }
      return true;
    } catch {
      return false;
    }
  }

  /** List files in a directory on the Dokku host */
  listFiles(path: string): string[] {
    try {
      let cmd: string;
      if (this.isRemote()) {
        cmd = `ssh -o StrictHostKeyChecking=no -p ${DOKKU_SSH_PORT} dokku@${DOKKU_HOST} ls ${path}`;
      } else {
        cmd = USE_SUDO ? `sudo ls ${path}` : `ls ${path}`;
      }
      return execSync(cmd, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}
