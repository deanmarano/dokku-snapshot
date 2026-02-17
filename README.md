# dokku-snapshot

Snapshot and restore entire Dokku app stacks — config, domains, ports, services, and more.

## Installation

```bash
dokku plugin:install https://github.com/deanmarano/dokku-snapshot.git snapshot
```

## Commands

```
snapshot:create <app>                          create a snapshot of an app
snapshot:delete <app> <snapshot-id>             delete a snapshot
snapshot:inspect <app>                         show all current config for an app
snapshot:list <app>                            list snapshots for an app
snapshot:restore <app> <snapshot-id> [--force]  restore an app from a snapshot
```

## What's captured

Each snapshot includes:

- **Config** — environment variables
- **Domains** — app vhosts
- **Ports** — port mappings
- **Proxy** — proxy enable/disable
- **Network** — bind settings, attach networks
- **Docker options** — build/deploy/run options
- **PS** — restart policy, process scaling
- **Storage** — mount points
- **Git** — deploy branch, keep-git-dir
- **Checks** — disabled/skipped checks
- **Resources** — memory and CPU limits
- **Builder & Buildpacks** — selected builder, buildpack list
- **Nginx** — app-level overrides
- **Let's Encrypt** — email config
- **Certs** — certificate report
- **Scheduler, Registry, Cron, App-JSON** — app-level settings
- **Services** — linked Postgres, Redis, MySQL, MongoDB, MariaDB, and Memcached services (including data export/import)

## Usage

```bash
# Create a snapshot
dokku snapshot:create myapp

# List snapshots
dokku snapshot:list myapp

# Inspect current app config (without creating a snapshot)
dokku snapshot:inspect myapp

# Restore from a snapshot
dokku snapshot:restore myapp 2025-06-15_12-30-00 --force

# Delete a snapshot
dokku snapshot:delete myapp 2025-06-15_12-30-00
```

## License

MIT
