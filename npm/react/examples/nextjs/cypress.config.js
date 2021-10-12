const { defineConfig } = require('cypress')

const devServer = require('@cypress/react/plugins/next')

module.exports = defineConfig({
  video: false,
  viewportWidth: 500,
  viewportHeight: 800,
  experimentalFetchPolyfill: true,
  env: {
    coverage: true,
  },
  component: {
    componentFolder: 'cypress/components',
    testFiles: '**/*.spec.{js,jsx}',
    setupNodeEvents (on, config) {
      devServer(on, config)

      return config
    },
  },
})
