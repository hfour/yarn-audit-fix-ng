import cp from "child_process";
import fs from "fs";
import fse from "fs-extra";
import path from "path";
import tempy from "tempy";
import "jest";

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse#using_the_reviver_parameter
const revive = <T = any>(data: string): T =>
  JSON.parse(data, (k, v) => {
    if (
      v !== null &&
      typeof v === "object" &&
      "type" in v &&
      v.type === "Buffer" &&
      "data" in v &&
      Array.isArray(v.data)
    ) {
      return new Buffer(v.data);
    }
    return v;
  });
const temp = tempy.directory();
const spawnOpts = { shell: true, maxBuffer: 128 * 1024 * 1024 };
const fixtures = path.resolve(__dirname, "./fixtures");
const audit = revive(fse.readFileSync(path.resolve(fixtures, "audit.json"), { encoding: "utf-8" }));

jest.mock("child_process", () => ({
  spawnSync: jest.fn(() => audit),
}));
jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  writeFileSync: jest.fn(() => undefined),
}));

import { run } from "../src";

afterAll(() => {
  jest.clearAllMocks();
  fse.emptyDirSync(temp);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("run", () => {
  const yarnlockPath = path.resolve(temp, "yarn.lock");

  it("patches yarn.lock with audit data", () => {
    fse.copySync(path.resolve(fixtures, "yarn.lock.before"), yarnlockPath);
    run({ cwd: temp });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      yarnlockPath,
      fs.readFileSync(path.resolve(fixtures, "yarn.lock.after"), { encoding: "utf-8" })
    );
    expect(cp.spawnSync).toHaveBeenCalledTimes(2);
    expect(cp.spawnSync).toHaveBeenCalledWith(`yarn audit --cwd ${temp} --json`, spawnOpts);
    expect(cp.spawnSync).toHaveBeenCalledWith(
      `yarn install --update-checksums --cwd ${temp}`,
      spawnOpts
    );
  });

  it("`--dry-run` does not apply changes to yarn.lock", () => {
    fse.copySync(path.resolve(fixtures, "yarn.lock.before"), yarnlockPath);
    run({ cwd: temp, dryRun: true });

    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(cp.spawnSync).toHaveBeenCalledTimes(2);
  });
});
