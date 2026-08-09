# dokku-snapshot

Snapshot and restore for [Dokku](https://dokku.com) apps. Captures app configuration (via [dokkufile](https://github.com/deanmarano/dokkufile)), service database dumps, and storage volume contents. Restorable on a fresh server without the original git repo.

## Prerequisites

- [Dokku](https://dokku.com) 0.34+
- [dokkufile](https://github.com/deanmarano/dokkufile) plugin

## Installation

```bash
dokku plugin:install https://github.com/deanmarano/dokku-snapshot.git snapshot
```

## Quick Start

```bash
# Create a snapshot (captures config, service data, and volume contents)
dokku snapshot:create myapp

# List snapshots
dokku snapshot:list myapp

# Restore from a snapshot
dokku snapshot:restore myapp 2025-06-15_12-30-00 --force

# Export an encrypted snapshot
dokku snapshot:export myapp 2025-06-15_12-30-00 --password mysecret
```

## Commands

| Command | Description |
|---|---|
| `snapshot:create <app>` | Create a snapshot of an app |
| `snapshot:create-all [--keep <n>]` | Snapshot every app, keeping the newest n per app |
| `snapshot:list <app>` | List snapshots for an app |
| `snapshot:restore <app> <id> [--force]` | Restore an app from a snapshot |
| `snapshot:delete <app> <id>` | Delete a snapshot |
| `snapshot:export <app> <id> --password <pw>` | Export encrypted snapshot |
| `snapshot:import <app> <file> --password <pw>` | Import encrypted snapshot |
| `snapshot:import-all <dir> --password <pw>` | Import every exported snapshot in a directory |
| `snapshot:upload <app> <id> --password <pw>` | Encrypt and upload to provider |
| `snapshot:download <app> <id> --password <pw>` | Download and decrypt from provider |
| `snapshot:volume:exclude <app> <path>` | Exclude a volume from backup |
| `snapshot:volume:include <app> <path>` | Re-include an excluded volume |
| `snapshot:volume:list <app>` | Show volumes and their backup status |
| `snapshot:provider:add <name> --type <type>` | Create a storage provider profile |
| `snapshot:provider:set <name> <key> <value>` | Set a provider config key |
| `snapshot:provider:show <name>` | Show provider configuration |
| `snapshot:provider:list` | List all configured providers |
| `snapshot:provider:delete <name>` | Delete a provider profile |
| `snapshot:provider:test <name>` | Test provider connectivity |
| `snapshot:provider:set-default <app> <name>` | Set default provider for an app |
| `snapshot:provider:unset-default <app>` | Remove default provider for an app |

## What's Captured

Each snapshot includes:

- **Config** -- full app configuration via dokkufile (env vars, domains, ports, nginx, etc.)
- **Services** -- linked Postgres, Redis, MySQL, MongoDB, MariaDB, and Memcached data
- **Volumes** -- all storage mount contents (tar archives), with opt-out exclusion

## Storage Providers

Upload encrypted snapshots to remote storage for disaster recovery and server migration.

| Provider | Required Config | External Tool |
|---|---|---|
| **file** | PATH | cp |
| **s3** | BUCKET | `aws` CLI |
| **gcs** | BUCKET | `gsutil` |
| **azure** | CONTAINER, ACCOUNT | `az` CLI |
| **b2** | BUCKET, KEY_ID, APP_KEY | `b2` CLI |
| **rsync** | HOST, PATH | `rsync` |
| **scp** | HOST, PATH | `scp` |
| **ftp** | HOST, PATH, USER, PASSWORD | `curl` |
| **smb** | HOST, SHARE, USER, PASSWORD | `smbclient` |

```bash
# Create a provider profile
dokku snapshot:provider:add my-backups --type s3 --bucket my-dokku-backups --region us-east-1

# Test connectivity
dokku snapshot:provider:test my-backups

# Set as default for an app
dokku snapshot:provider:set-default myapp my-backups

# Upload a snapshot
dokku snapshot:upload myapp 2025-06-15_12-30-00 --password mysecret

# Download on another server
dokku snapshot:download myapp 2025-06-15_12-30-00 --password mysecret
```

## License

MIT
