import * as fs from 'fs-extra'
import path from 'path'
import tempy from 'tempy'

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse#using_the_reviver_parameter
const revive = <T = any>(data: string): T => JSON.parse(data, (k, v) => {
  if (
    v !== null            &&
    typeof v === 'object' &&
    'type' in v           &&
    v.type === 'Buffer'   &&
    'data' in v           &&
    Array.isArray(v.data)) {
    return new Buffer(v.data);
  }
  return v;
});
const temp = tempy.directory()
const spawnOpts = { shell: true, maxBuffer: 128 * 1024 * 1024 }
const fixtures = path.resolve(__dirname, './fixtures')
const audit = revive(fs.readFileSync(path.resolve(fixtures, 'audit.json'), {encoding: 'utf-8'}))
const spawnSync = jest.fn(() => audit)

jest.mock('child_process', () => ({
  spawnSync
}))

import { run } from '../src'

// console.log('audit=', JSON.stringify(audit))

afterAll(() => {
  jest.clearAllMocks()
  fs.emptyDirSync(temp)
})

describe('run', () => {
  const yarnlockPath = path.resolve(temp, 'yarn.lock')

  fs.copySync(path.resolve(fixtures, 'yarn.lock.before'), yarnlockPath)

  it('patches yarn.lock with audit data', () => {
    run({ cwd: temp })
    fs.copySync(yarnlockPath, path.resolve(fixtures, 'yarn.lock'))

    expect(fs.readFileSync(path.resolve(fixtures, 'yarn.lock.after'), {encoding: 'utf-8'}))
      .toBe(fs.readFileSync(yarnlockPath, {encoding: 'utf-8'}))
    expect(spawnSync).toHaveBeenCalledTimes(2)
    expect(spawnSync).toHaveBeenCalledWith(`yarn audit --cwd ${temp} --json`, spawnOpts)
    expect(spawnSync).toHaveBeenCalledWith(`yarn --update-checksums --cwd ${temp}`, spawnOpts)
  })
})
