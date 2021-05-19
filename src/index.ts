#!/usr/bin/env node
import * as lf from "@yarnpkg/lockfile";
import * as process from "process";
import * as fs from "fs";
import * as cp from "child_process";
import { keyBy } from "lodash";
import * as sv from "semver";

type AuditEntry = {
  data: {
    advisory: {
      module_name: string;
      vulnerable_versions: string;
      patched_versions: string;
    };
  };
};

type LockfileObject = {
  [versionInfo: string]: {
    version: string;
    resolved: string;
    integrity: string;
    dependencies: string[];
  };
};

let data = lf.parse(fs.readFileSync("./yarn.lock", "utf-8"));

if (data.type != "success") {
  console.error("Merge conflict in yarn lockfile, aborting");
  process.exit(1);
}

console.log("Downloading audit...");
let audit = cp.spawnSync("yarn audit --json", {
  shell: true,
  maxBuffer: 128 * 1024 * 1024,
});

if (audit.error) {
  console.error("Error retreiving audit: ", audit.error.message);
  process.exit(1);
}

function attempt<T>(f: () => T): T | null {
  try {
    return f();
  } catch {
    return null;
  }
}

let auditDict = keyBy(
  audit.stdout
    .toString()
    .split("\n")
    .map((item) => attempt(() => JSON.parse(item)) as AuditEntry)
    .map((item) => item?.data?.advisory)
    .filter((item) => item != null)
    .map((item) => ({
      module_name: item.module_name,
      vulnerable_versions: item.vulnerable_versions,
      patched_versions: item.patched_versions,
    })),
  (item) => item.module_name
);

if (Object.keys(auditDict).length < 1) {
  console.log("Audit check found no issues");
  process.exit(0);
}

let lockfile = data.object as LockfileObject;

let upgradeVersions = [];

for (let depSpec of Object.keys(lockfile)) {
  // console.log("Testing depspec", depSpec);
  let [pkgName, desiredRange] = depSpec.split("@");
  let pkgAudit = auditDict[pkgName];
  if (!pkgAudit) continue;
  let pkgSpec = lockfile[depSpec];
  if (sv.satisfies(pkgSpec.version, pkgAudit.vulnerable_versions)) {
    let fix = sv.minVersion(pkgAudit.patched_versions)?.format();
    if (fix == null) {
      console.error(
        "Can't find satisfactory version for",
        pkgAudit.module_name,
        pkgAudit.patched_versions
      );
      continue;
    }
    if (!sv.satisfies(fix, desiredRange)) {
      console.error(
        "Cant find patched version that satisfies",
        depSpec,
        "in",
        pkgAudit.patched_versions
      );
      continue;
    }
    upgradeVersions.push(`${pkgName}@${fix}`);
    pkgSpec.version = fix;
    pkgSpec.dependencies = [];
    pkgSpec.integrity = "";
    pkgSpec.resolved = "";
  }
}

fs.writeFileSync("./yarn.lock", lf.stringify(lockfile));

console.log("Installing upgrades:", upgradeVersions.join(", "));
cp.spawnSync("yarn install", { shell: true });
