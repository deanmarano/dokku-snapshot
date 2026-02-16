import { execSync, spawn, spawnSync } from 'child_process';

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

  /**
   * Check if an error is just a harmless Dokku basher/nginx warning.
   * After plugin installs, Dokku can emit "main: command not found"
   * or "Checking nginx status" warnings on stderr. These are harmless
   * when the command's stdout indicates it actually ran.
   */
  private isHarmlessWarning(stderr: string): boolean {
    const stderrLines = stderr.split('\n').filter(l => l.trim());
    return stderrLines.length > 0 && stderrLines.every(
      l => l.includes('main: command not found') ||
           l.includes('Checking nginx status is not possible') ||
           l.trim() === ''
    );
  }

  /**
   * Run a command asynchronously with inherited stdin.
   * Uses spawn with inherited stdin to avoid basher dispatch failures.
   */
  private spawnAsync(cmd: string): Promise<ExecResult> {
    return new Promise((resolve) => {
      const parts = cmd.split(/\s+/);
      const child = spawn(parts[0], parts.slice(1), {
        stdio: ['inherit', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

      child.on('close', (code) => {
        const exitCode = code ?? 1;
        if (exitCode === 0) {
          resolve({ exitCode: 0, stdout, stderr });
        } else if (stdout.length > 0 && this.isHarmlessWarning(stderr)) {
          resolve({ exitCode: 0, stdout, stderr });
        } else {
          resolve({ exitCode, stdout, stderr });
        }
      });
    });
  }

  /** Execute a snapshot command and return exit code, stdout, stderr */
  async exec(...args: string[]): Promise<ExecResult> {
    const fullArgs = args[0]?.startsWith('snapshot:') ? args : ['snapshot:' + args[0], ...args.slice(1)];
    const cmd = this.buildCommand(fullArgs);
    return this.spawnAsync(cmd);
  }

  /** Run a dokku snapshot command synchronously */
  run(...args: string[]): string {
    const fullArgs = args[0]?.startsWith('snapshot:') ? args : ['snapshot:' + args[0], ...args.slice(1)];
    const cmd = this.buildCommand(fullArgs);
    return this.execSyncTolerant(cmd);
  }

  /** Run a generic dokku command */
  runDokku(...args: string[]): string {
    const cmd = this.buildCommand(args);
    return this.execSyncTolerant(cmd);
  }

  /** Run a generic dokku command async, returning ExecResult */
  async execDokku(...args: string[]): Promise<ExecResult> {
    const cmd = this.buildCommand(args);
    return this.spawnAsync(cmd);
  }

  /**
   * Run a command synchronously with inherited stdin.
   * Dokku plugin commands (e.g. postgres:create) fail with basher dispatch
   * errors when stdin is piped (Node.js default). Inheriting stdin from the
   * parent process avoids this issue.
   */
  private execSyncTolerant(cmd: string): string {
    // Split command for spawnSync - first word is the command, rest are args
    const parts = cmd.split(/\s+/);
    const result = spawnSync(parts[0], parts.slice(1), {
      encoding: 'utf-8',
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    if (result.status === 0) {
      return result.stdout;
    }

    const stderr = result.stderr || '';
    if (this.isHarmlessWarning(stderr)) {
      return result.stdout;
    }

    const error: any = new Error(`Command failed: ${cmd}\n${stderr}`);
    error.status = result.status;
    error.stdout = result.stdout;
    error.stderr = stderr;
    throw error;
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

  /** Set port mappings on an app */
  setPortMap(app: string, ...mappings: string[]): void {
    this.runDokku('ports:set', app, ...mappings);
  }

  /** Get port mappings for an app */
  getPortMap(app: string): string[] {
    try {
      const output = this.runDokku('ports:list', app);
      const lines = output.trim().split('\n');
      const ports: string[] = [];
      for (const line of lines) {
        // Skip header lines (Dokku output may have leading spaces and -----> prefixes)
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('----->') || trimmed.startsWith('scheme')) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          ports.push(`${parts[0]}:${parts[1]}:${parts[2]}`);
        }
      }
      return ports;
    } catch {
      return [];
    }
  }

  /** Add a docker option for a phase */
  setDockerOption(app: string, phase: string, option: string): void {
    this.runDokku('docker-options:add', app, phase, option);
  }

  /** Get docker options report for an app */
  getDockerOptions(app: string): string {
    try {
      return this.runDokku('docker-options:report', app);
    } catch {
      return '';
    }
  }

  /** Set a git property on an app */
  setGitProperty(app: string, key: string, value: string): void {
    this.runDokku('git:set', app, key, value);
  }

  /** Get a git property from an app */
  getGitProperty(app: string, key: string): string {
    try {
      const output = this.runDokku('git:report', app);
      const fieldMap: Record<string, string> = {
        'deploy-branch': 'Git deploy branch',
        'keep-git-dir': 'Git keep git dir',
      };
      const field = fieldMap[key] || key;
      const match = output.match(new RegExp(`${field}:\\s*(.*)`));
      return match ? match[1].trim() : '';
    } catch {
      return '';
    }
  }

  /** Set ps scale for a process type */
  setPsScale(app: string, proctype: string, count: number): void {
    this.runDokku('ps:scale', app, `${proctype}=${count}`);
  }

  /** Set a resource limit on an app */
  setResourceLimit(app: string, resource: string, value: string): void {
    this.runDokku('resource:limit', app, `--${resource}`, value);
  }

  /** Set a network property on an app */
  setNetworkProperty(app: string, key: string, value: string): void {
    this.runDokku('network:set', app, key, value);
  }

  /** Enable or disable proxy for an app */
  setProxyEnabled(app: string, enabled: boolean): void {
    this.runDokku(enabled ? 'proxy:enable' : 'proxy:disable', app);
  }

  /** Set the builder for an app */
  setBuilder(app: string, builder: string): void {
    this.runDokku('builder:set', app, 'selected', builder);
  }

  /** Set a storage mount on an app */
  setStorageMount(app: string, mount: string): void {
    this.runDokku('storage:mount', app, mount);
  }

  /** Set an nginx property on an app */
  setNginxProperty(app: string, key: string, value: string): void {
    this.runDokku('nginx:set', app, key, value);
  }

  /** Get an nginx property from an app (app-level override only) */
  getNginxProperty(app: string, key: string): string {
    try {
      const output = this.runDokku('nginx:report', app);
      // Build field name: "client-max-body-size" -> "Nginx client max body size"
      const fieldName = 'Nginx ' + key.replace(/-/g, ' ');
      // Match app-level line (not computed/global)
      for (const line of output.split('\n')) {
        if (line.includes('computed') || line.includes('global')) continue;
        const match = line.match(new RegExp(`${fieldName}:\\s*(.*)`));
        if (match) return match[1].trim();
      }
      return '';
    } catch {
      return '';
    }
  }

  /** Set the scheduler for an app */
  setScheduler(app: string, scheduler: string): void {
    this.runDokku('scheduler:set', app, 'selected', scheduler);
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
