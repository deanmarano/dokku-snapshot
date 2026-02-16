.PHONY: test test-integration deps lint install help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

deps: ## Install test dependencies
	npm install

test: test-integration ## Run all tests

test-integration: ## Run integration tests (requires Dokku)
	npm run test:integration

lint: ## Run shellcheck on bash scripts
	shellcheck -x commands config install functions
	find subcommands -type f -exec shellcheck -x {} +

install: ## Install plugin into Dokku
	sudo mkdir -p /var/lib/dokku/plugins/available/snapshot
	sudo cp -r plugin.toml config commands install functions subcommands /var/lib/dokku/plugins/available/snapshot/
	sudo ln -sf /var/lib/dokku/plugins/available/snapshot /var/lib/dokku/plugins/enabled/snapshot
	sudo dokku plugin:install-dependencies snapshot || true
