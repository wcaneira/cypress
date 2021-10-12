This is an example project created using [CRACO](https://github.com/gsoft-inc/craco) (Create React App Configuration Override). 

Use the plugin:

```js
// cypress/cypress.config.js
const { defineConfig } = require('cypress')
const { devServer, defineDevServerConfig } = require('@cypress/react/plugins/craco')

// import your craco.config.js
const cracoConfig = require('./craco.config.js')

module.exports = defineConfig({
  component: {
		setupNodeEvents(on, config) {
      devServer(on, config, cracoConfig)

      return config
		}
  }
})
```
