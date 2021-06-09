#!/usr/bin/env node
import * as lf from "@yarnpkg/lockfile";
import * as process from "process";
import * as path from "path";
import * as fs from "fs";
import * as cp from "child_process";
import { keyBy, pick } from "lodash";
import * as sv from "semver";
import { unparse } from "./argv";

export type AuditEntry = {
  data: {
    advisory: {
      module_name: string;
      vulnerable_versions: string;
      patched_versions: string;
    };
  };
};

export type LockfileObject = {
  [versionInfo: string]: {
    version: string;
    resolved: string;
    integrity: string;
    dependencies: string[];
  };
};

export type IFixOptions = {
  cwd?: string;
  force?: boolean;
  groups?: string | string[];
  level?: string;
  verbose?: boolean;
};

export const run = (opts: IFixOptions): void => {
  const { cwd = process.cwd() } = opts;
  const yarnlockPath = path.resolve(cwd, "yarn.lock");
  const yarnAuditAllowedOpts = ["cwd", "groups", "level", "verbose"];
  const yarnAuditCmd = unparse(
    { ...pick(opts, yarnAuditAllowedOpts), json: true, _: [] },
    { command: "yarn audit" }
  ).join(" ");
  const spawnOptions = {
    shell: true,
    maxBuffer: 128 * 1024 * 1024,
  };
  let data = lf.parse(fs.readFileSync(yarnlockPath, "utf-8"));

  if (data.type != "success") {
    console.error("Merge conflict in yarn lockfile, aborting");
    process.exit(1);
  }

  console.log("Downloading audit...");
  let audit = cp.spawnSync(yarnAuditCmd, spawnOptions);

  if (audit.error) {
    console.error("Error retrieving audit: ", audit.error.message);
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
      if (!sv.satisfies(fix, desiredRange) && !opts.force) {
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

  fs.writeFileSync(yarnlockPath, lf.stringify(lockfile));

  console.log("Installing upgrades:", upgradeVersions.join(", "));
  cp.spawnSync(`yarn install --update-checksums --cwd ${cwd}`, spawnOptions);
};
