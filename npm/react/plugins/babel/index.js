const returnInjectDevServerFunction = require('../utils/wrap-devserver')
const getBabelWebpackConfig = require('./getBabelWebpackConfig')
const { startDevServer } = require('@cypress/webpack-dev-server')

function startBabelDevServer (options, moduleOptions) {
  return startDevServer({ options, webpackConfig: getBabelWebpackConfig(options.config, moduleOptions) })
}

module.exports = returnInjectDevServerFunction(startBabelDevServer, (config) => {
  config.env.reactDevtools = true

  return config
})
