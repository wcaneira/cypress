import fs from 'fs-extra'
import path from 'path'
import systemTests, { expect } from '../lib/system-tests'
import Fixtures from '../lib/fixtures'

const e2ePath = Fixtures.projectPath('e2e')

const outputPath = path.join(e2ePath, 'output.json')

describe('testConfigOverrides', () => {
  systemTests.setup()

  systemTests.it('fails when passing invalid config value browser', {
    spec: 'testConfigOverrides-invalid-browser.js',
    snapshot: true,
    expectedExitCode: 1,

  })

  systemTests.it('has originalTitle when skip due to browser config', {
    spec: 'testConfigOverrides-skip-browser.js',
    snapshot: true,
    outputPath,
    browser: 'electron',
    async onRun (exec) {
      await exec()
      const results = await fs.readJson(outputPath)

      // make sure we've respected test.originalTitle
      expect(results.runs[0].tests[0].title).deep.eq(['suite', 'has invalid testConfigOverrides'])
    },
  })
})
