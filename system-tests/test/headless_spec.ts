import systemTests from '../lib/system-tests'
import Fixtures from '../lib/fixtures'

describe('e2e headless', function () {
  systemTests.setup()

  describe('ELECTRON_RUN_AS_NODE', () => {
    const baseSpec = {
      spec: 'headless_spec.js',
      config: {
        env: {
          'CI': process.env.CI,
          'EXPECT_HEADLESS': '1',
        },
      },
      headed: false,
      processEnv: {
        // Ensure that electron is spawned as a node process.
        ELECTRON_RUN_AS_NODE: 1,
        // Ensure that the current xserver is not passed to the test.
        DISPLAY: '',
        // Debug cypress:server:run to look for a message that electron/xvfb were not spawned.
        DEBUG: 'cypress:server:run',
      },
    }

    systemTests.it('pass for browsers that do not need xvfb', {
      ...baseSpec,
      browser: ['chrome', 'chrome-beta', 'firefox'],
      expectedExitCode: 0,
      onRun (exec) {
        return exec().then(({ stderr }) => {
          expect(stderr).to.include('running electron as a node process without xvfb')
        })
      },
    })

    systemTests.it('fails for browsers that do need xvfb', {
      ...baseSpec,
      expectedExitCode: 1,
      browser: ['electron'],
    })
  })

  // cypress run --headless
  systemTests.it('tests in headless mode pass', {
    spec: 'headless_spec.js',
    config: {
      env: {
        'CI': process.env.CI,
        'EXPECT_HEADLESS': '1',
      },
      video: false,
    },
    headed: false,
    snapshot: true,
  })

  // NOTE: cypress run --headed
  // currently, Electron differs because it displays a
  // "can not record video in headed mode" error
  // this trick allows us to have 1 snapshot for electron
  // and 1 for every other browser
  ;[
    'electron',
    '!electron',
  ].map((b) => {
    systemTests.it(`tests in headed mode pass in ${b}`, {
      spec: 'headless_spec.js',
      config: {
        env: {
          'CI': process.env.CI,
        },
      },
      expectedExitCode: 0,
      headed: true,
      snapshot: true,
      browser: b,
    })
  })

  systemTests.it('launches maximized by default in headless mode (1920x1080)', {
    headed: false,
    project: Fixtures.projectPath('screen-size'),
    spec: 'default_size.spec.js',
  })

  systemTests.it('launches at DPR 1x', {
    headed: false,
    project: Fixtures.projectPath('screen-size'),
    spec: 'device_pixel_ratio.spec.js',
  })
})
