# yarn-audit-fix-ng
Fixes your audit issues — the ones that can be automatically fixed

## Usage
```shell
npx yarn-audit-fix-ng [--verbose, --level=info|low|moderate|high|critical, --groups=dependencies|devDependencies, --cwd=/path/to/project --force]
```

### Options
| Flag | Description
|---|---
| cwd | Process directory, defaults to process.cwd()
| dry-run | Get an idea of what audit fix will do
| force | Ignore semver range limitations on patching
| groups | Limit the audit table to vulnerabilities of the corresponding dependency groups: dependencies, devDependencies, optionalDependencies, peerDependencies
| level | Limit the audit table to vulnerabilities of the corresponding level and above: info, low, moderate, high, critical
| verbose | Verbose/debug logging

## License
MIT
