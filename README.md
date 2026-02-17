# dokku-snapshot

Snapshot and restore Dokku app **data** — service databases and storage volumes.

App configuration (env vars, domains, ports, nginx, etc.) is managed by [dokkufile](https://github.com/deanmarano/dokkufile) as infrastructure-as-code. This plugin focuses on the data that dokkufile can't capture.

## Installation

```bash
dokku plugin:install https://github.com/deanmarano/dokku-snapshot.git snapshot
```

## Commands

```
snapshot:create <app>                              create a snapshot of an app
snapshot:delete <app> <snapshot-id>                 delete a snapshot
snapshot:export <app> <id> --password <pw>          export encrypted snapshot
snapshot:import <app> <file> --password <pw>        import encrypted snapshot
snapshot:list <app>                                list snapshots for an app
snapshot:restore <app> <snapshot-id> [--force]      restore an app from a snapshot
snapshot:upload <app> <id> --password <pw>          encrypt and upload snapshot to provider
snapshot:download <app> <id> --password <pw>        download and decrypt snapshot from provider
snapshot:volume:exclude <app> <host-path>           exclude a volume from backup
snapshot:volume:include <app> <host-path>           re-include a previously excluded volume
snapshot:volume:list <app>                          show all volumes and their backup status
snapshot:provider:add <name> --type <type>          create a storage provider profile
snapshot:provider:set <name> <key> <value>          set a provider config key
snapshot:provider:show <name>                       show provider configuration
snapshot:provider:list                              list all configured providers
snapshot:provider:delete <name>                     delete a provider profile
snapshot:provider:test <name>                       test provider connectivity
snapshot:provider:set-default <app> <name>          set default provider for an app
snapshot:provider:unset-default <app>                remove default provider for an app
```

## What's captured

Each snapshot includes:

- **Services** — linked Postgres, Redis, MySQL, MongoDB, MariaDB, and Memcached service data (export/import)
- **Volumes** — all storage mount contents (tar archives), with opt-out exclusion

## Usage

```bash
# Create a snapshot (captures service data + volume contents)
dokku snapshot:create myapp

# List snapshots
dokku snapshot:list myapp

# Restore from a snapshot
dokku snapshot:restore myapp 2025-06-15_12-30-00 --force

# Export an encrypted snapshot
dokku snapshot:export myapp 2025-06-15_12-30-00 --password mysecret

# Import an encrypted snapshot
dokku snapshot:import myapp myapp-2025-06-15_12-30-00.tar.gz.enc --password mysecret

# Delete a snapshot
dokku snapshot:delete myapp 2025-06-15_12-30-00
```

## Volume backup

All storage mounts are backed up by default. To exclude large or unnecessary volumes:

```bash
# Exclude a volume from backup
dokku snapshot:volume:exclude myapp /var/lib/dokku/data/storage/myapp-media

# Re-include a previously excluded volume
dokku snapshot:volume:include myapp /var/lib/dokku/data/storage/myapp-media

# List all volumes and their backup status
dokku snapshot:volume:list myapp
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
