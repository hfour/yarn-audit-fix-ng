import * as lf from "@yarnpkg/lockfile";
import * as process from "process";
import * as fs from "fs";
import * as cp from "child_process";
import { keyBy } from "lodash";
import * as sv from "semver";

let data = lf.parse(fs.readFileSync("./yarn.lock", "utf-8"));

if (data.type != "success") {
  console.error("Merge conflict in yarn lockfile, aborting");
  process.exit(1);
}

let audit = cp.spawnSync("yarn audit --json", {
  shell: true,
});

if (audit.error) {
  console.error("Error retreiving audit: ", audit.error.message);
  process.exit(1);
}

type AuditEntry = {
  data: {
    advisory: {
      module_name: string;
      vulnerable_versions: string;
      patched_versions: string;
    };
  };
};

let auditDict = keyBy(
  audit.stdout
    .toString()
    .split("\n")
    .map((item) => JSON.parse(item) as AuditEntry)
    .map((item) => item?.data?.advisory)
    .filter((item) => item)
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

type LockfileObject = {
  [versionInfo: string]: {
    version: string;
  };
};

let lockfile = data.object as LockfileObject;

for (let depSpec of Object.keys(lockfile)) {
  let pkgName = depSpec.split("@")[0];
  let pkgAudit = auditDict[pkgName];
  if (!pkgAudit) continue;
  let pkgSpec = lockfile[depSpec];
  if (sv.satisfies(pkgSpec.version, pkgAudit.vulnerable_versions)) {
    let fix = sv.minVersion(pkgAudit.patched_versions);
    if (fix == null) {
      console.error("minVersion broken on", pkgAudit.patched_versions);
    }
    if (sv.satisfies(fix!.format(), depSpec)) {
      pkgSpec.version = fix!.format();
    } else {
      console.log("Cant find minVersion of", pkgAudit.patched_versions, "that satisfies", depSpec);
    }
  }
}
