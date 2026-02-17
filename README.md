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
snapshot:export <app> <id> --password <pw>      export encrypted snapshot
snapshot:import <app> <file> --password <pw>    import encrypted snapshot
snapshot:inspect <app>                         show all current config for an app
snapshot:list <app>                            list snapshots for an app
snapshot:restore <app> <snapshot-id> [--force]  restore an app from a snapshot
snapshot:upload <app> <id> --password <pw>      encrypt and upload snapshot to provider
snapshot:download <app> <id> --password <pw>    download and decrypt snapshot from provider
snapshot:provider:add <name> --type <type>      create a storage provider profile
snapshot:provider:set <name> <key> <value>      set a provider config key
snapshot:provider:show <name>                   show provider configuration
snapshot:provider:list                          list all configured providers
snapshot:provider:delete <name>                 delete a provider profile
snapshot:provider:test <name>                   test provider connectivity
snapshot:provider:set-default <app> <name>      set default provider for an app
snapshot:provider:unset-default <app>            remove default provider for an app
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

# Export an encrypted snapshot
dokku snapshot:export myapp 2025-06-15_12-30-00 --password mysecret

# Import an encrypted snapshot
dokku snapshot:import myapp myapp-2025-06-15_12-30-00.tar.gz.enc --password mysecret

# Delete a snapshot
dokku snapshot:delete myapp 2025-06-15_12-30-00
```

## Storage Providers

Upload encrypted snapshots to remote storage for disaster recovery and server migration.

### Supported providers

| Provider | Required config | External tool |
|----------|----------------|---------------|
| **file** | PATH | cp |
| **s3** | BUCKET | `aws` CLI |
| **gcs** | BUCKET | `gsutil` |
| **azure** | CONTAINER, ACCOUNT | `az` CLI |
| **b2** | BUCKET, KEY_ID, APP_KEY | `b2` CLI |
| **rsync** | HOST, PATH | `rsync` |
| **scp** | HOST, PATH | `scp` |
| **ftp** | HOST, PATH, USER, PASSWORD | `curl` |
| **smb** | HOST, SHARE, USER, PASSWORD | `smbclient` |

### Setup

```bash
# Create a provider profile
dokku snapshot:provider:add my-backups --type s3 --bucket my-dokku-backups --region us-east-1

# Or use the file provider for local/NFS backups
dokku snapshot:provider:add local-backup --type file --path /mnt/backups/dokku

# Set additional config
dokku snapshot:provider:set my-backups PREFIX dokku-snapshots

# Test connectivity
dokku snapshot:provider:test my-backups

# Set as default for an app
dokku snapshot:provider:set-default myapp my-backups

# Upload a snapshot
dokku snapshot:upload myapp 2025-06-15_12-30-00 --password mysecret

# Download on another server
dokku snapshot:download myapp 2025-06-15_12-30-00 --password mysecret

# Or specify provider explicitly
dokku snapshot:upload myapp 2025-06-15_12-30-00 --password mysecret --provider my-backups
```

## License

MIT
