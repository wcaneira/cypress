const _ = require('lodash')
const Promise = require('bluebird')
const path = require('path')
const os = require('os')
const cypressEx = require('@packages/example')
const { fs } = require('./util/fs')
const glob = require('./util/glob')
const cwd = require('./cwd')
const debug = require('debug')('cypress:server:scaffold')
const errors = require('./errors')
const { isEmpty } = require('ramda')
const { isDefault } = require('./util/config')

const getExampleSpecsFullPaths = cypressEx.getPathToExamples()
const getExampleFolderFullPaths = cypressEx.getPathToExampleFolders()

const getPathFromIntegrationFolder = (file) => {
  return file.substring(file.indexOf('integration/') + 'integration/'.length)
}

const isDifferentNumberOfFiles = (files, exampleSpecs) => {
  return files.length !== exampleSpecs.length
}

const getExampleSpecs = (foldersOnly = false) => {
  const paths = foldersOnly ? getExampleFolderFullPaths : getExampleSpecsFullPaths

  return paths
  .then((fullPaths) => {
    // short paths relative to integration folder (i.e. examples/actions.spec.js)
    const shortPaths = _.map(fullPaths, (file) => {
      return getPathFromIntegrationFolder(file)
    })

    // index for quick lookup and for getting full path from short path
    const index = _.transform(shortPaths, (memo, spec, i) => {
      return memo[spec] = fullPaths[i]
    }, {})

    return { fullPaths, shortPaths, index }
  })
}

const getIndexedExample = (file, index) => {
  // convert to using posix sep if on win
  if (os.platform() === 'win32') {
    file = file.split(path.sep).join(path.posix.sep)
  }

  return index[getPathFromIntegrationFolder(file)]
}

const filesNamesAreDifferent = (files, index) => {
  return _.some(files, (file) => {
    return !getIndexedExample(file, index)
  })
}

const getFileSize = (file) => {
  return fs.statAsync(file).get('size')
}

const fileSizeIsSame = (file, index) => {
  return Promise.join(
    getFileSize(file),
    getFileSize(getIndexedExample(file, index)),
  ).spread((fileSize, originalFileSize) => {
    return fileSize === originalFileSize
  }).catch((e) => {
    // if the file does not exist, return false
    return false
  })
}

const filesSizesAreSame = (files, index) => {
  return Promise.join(
    Promise.all(_.map(files, getFileSize)),
    Promise.all(_.map(files, (file) => {
      return getFileSize(getIndexedExample(file, index))
    })),
  )
  .spread((fileSizes, originalFileSizes) => {
    return _.every(fileSizes, (size, i) => {
      return size === originalFileSizes[i]
    })
  })
}

const componentTestingEnabled = (config) => {
  const componentTestingEnabled = _.get(config, 'resolved.testingType.value', 'e2e') === 'component'

  return componentTestingEnabled && !isDefault(config, 'componentFolder')
}

const isNewProject = (config) => {
  // logic to determine if new project
  // 1. 'integrationFolder' is still the default
  // 2. component testing is not enabled
  // 3. there are no files in 'integrationFolder'
  // 4. there is the same number of files in 'integrationFolder'
  // 5. the files are named the same as the example files
  // 6. the bytes of the files match the example files

  const { integrationFolder } = config

  debug('determine if new project by globbing files in %o', { integrationFolder })

  if (!isDefault(config, 'integrationFolder')) {
    return Promise.resolve(false)
  }

  // checks for file up to 3 levels deep
  return glob('{*,*/*,*/*/*}', { cwd: integrationFolder, realpath: true, nodir: true })
  .then((files) => {
    debug(`found ${files.length} files in folder ${integrationFolder}`)
    debug('determine if we should scaffold:')

    // TODO: add tests for this
    debug('- empty?', isEmpty(files))
    if (isEmpty(files)) {
      return true
    }

    return getExampleSpecs()
    .then((exampleSpecs) => {
      const numFilesDifferent = isDifferentNumberOfFiles(files, exampleSpecs.shortPaths)

      debug('- different number of files?', numFilesDifferent)
      if (numFilesDifferent) {
        return false
      }

      const filesNamesDifferent = filesNamesAreDifferent(files, exampleSpecs.index)

      debug('- different file names?', filesNamesDifferent)
      if (filesNamesDifferent) {
        return false
      }

      return filesSizesAreSame(files, exampleSpecs.index)
    })
  }).then((sameSizes) => {
    debug('- same sizes?', sameSizes)

    return sameSizes
  })
}

module.exports = {
  isNewProject,

  integration (folder, config) {
    debug(`integration folder ${folder}`)

    // skip if user has explicitly set integrationFolder
    // or if user has set up component testing
    if (!isDefault(config, 'integrationFolder') || componentTestingEnabled(config)) {
      return Promise.resolve()
    }

    return this.verifyScaffolding(folder, () => {
      debug(`copying examples into ${folder}`)

      return getExampleSpecs()
      .then(({ fullPaths }) => {
        return Promise.all(_.map(fullPaths, (file) => {
          return this._copy(file, folder, config, true)
        }))
      })
    })
  },

  removeIntegration (folder, config) {
    debug(`integration folder ${folder}`)

    // skip if user has explicitly set integrationFolder
    // since we wouldn't have scaffolded anything
    if (!isDefault(config, 'integrationFolder')) {
      return Promise.resolve()
    }

    return getExampleSpecs()
    .then(({ shortPaths, index }) => {
      return Promise.all(_.map(shortPaths, (file) => {
        return this._removeFile(file, folder, index)
      }))
    }).then(() => {
      // remove folders after we've removed all files
      return getExampleSpecs(true).then(({ shortPaths }) => {
        return Promise.all(_.map(shortPaths, (folderPath) => {
          return this._removeFolder(folderPath, folder)
        }))
      })
    })
  },

  fixture (folder, config) {
    debug(`fixture folder ${folder}`)

    // skip if user has explicitly set fixturesFolder
    if (!config.fixturesFolder || !isDefault(config, 'fixturesFolder')) {
      return Promise.resolve()
    }

    return this.verifyScaffolding(folder, () => {
      debug(`copying example.json into ${folder}`)

      return this._copy(cypressEx.getPathToFixture(), folder, config)
    })
  },

  support (folder, config) {
    debug(`support folder ${folder}, support file ${config.supportFile}`)

    // skip if user has explicitly set supportFile
    if (!config.supportFile || !isDefault(config, 'supportFile')) {
      return Promise.resolve()
    }

    return this.verifyScaffolding(folder, () => {
      debug(`copying commands.js and index.js to ${folder}`)

      return cypressEx.getPathToSupportFiles()
      .then((supportFiles) => {
        return Promise.all(
          supportFiles.map((supportFilePath) => {
            return this._copy(supportFilePath, folder, config)
          }),
        )
      })
    })
  },

  plugins (folder, config) {
    debug(`plugins folder ${folder}`)
    // skip if user has explicitly set pluginsFile
    if (!config.pluginsFile || !isDefault(config, 'pluginsFile')) {
      return Promise.resolve()
    }

    return this.verifyScaffolding(folder, () => {
      debug(`copying index.js into ${folder}`)

      return this._copy(cypressEx.getPathToPlugins(), folder, config)
    })
  },

  _copy (file, folder, config, integration = false) {
    // allow file to be relative or absolute
    const src = path.resolve(cwd('lib', 'scaffold'), file)
    const destFile = integration ? getPathFromIntegrationFolder(file) : path.basename(file)
    const dest = path.join(folder, destFile)

    return this._assertInFileTree(dest, config)
    .then(() => {
      return fs.copyAsync(src, dest)
    }).catch((error) => {
      if (error.code === 'EACCES') {
        error = errors.get('ERROR_WRITING_FILE', dest, error)
      }

      throw error
    })
  },

  _removeFile (file, folder, index) {
    const dest = path.join(folder, file)

    return fileSizeIsSame(dest, index)
    .then((isSame) => {
      if (isSame) {
        // catch all errors since the user may have already removed
        // the file or changed permissions, etc.
        return fs.removeAsync(dest).catch(_.noop)
      }
    })
  },

  _removeFolder (folderPath, folder) {
    const dest = path.join(folder, folderPath)

    // catch all errors since the user may have already removed
    // the folder, changed permissions, added their own files to the folder, etc.
    return fs.rmdirAsync(dest).catch(_.noop)
  },

  verifyScaffolding (folder, fn) {
    // we want to build out the folder + and example files
    // but only create the example files if the folder doesn't
    // exist
    //
    // this allows us to automatically insert the folder on existing
    // projects (whenever they are booted) but allows the user to delete
    // the file and not have it re-generated each time
    //
    // this is ideal because users who are upgrading to newer cypress version
    // will still get the files scaffolded but existing users won't be
    // annoyed by new example files coming into their projects unnecessarily
    // console.debug('-- verify', folder)
    debug(`verify scaffolding in ${folder}`)

    return fs.statAsync(folder)
    .then(() => {
      return debug(`folder ${folder} already exists`)
    }).catch(() => {
      debug(`missing folder ${folder}`)

      return fn.call(this)
    })
  },

  fileTree (config = {}) {
    // returns a tree-like structure of what files are scaffolded.
    // this should be updated any time we add, remove, or update the name
    // of a scaffolded file

    const getFilePath = (dir, name) => {
      return path.relative(config.projectRoot, path.join(dir, name))
    }

    return getExampleSpecs()
    .then((specs) => {
      let files = []

      if (!componentTestingEnabled(config)) {
        files = _.map(specs.shortPaths, (file) => {
          return getFilePath(config.integrationFolder, file)
        })
      }

      if (config.fixturesFolder) {
        files = files.concat([
          getFilePath(config.fixturesFolder, 'example.json'),
        ])
      }

      if (config.supportFolder && (config.supportFile !== false)) {
        files = files.concat([
          getFilePath(config.supportFolder, 'commands.js'),
          getFilePath(config.supportFolder, 'index.js'),
        ])
      }

      if (config.pluginsFile) {
        files = files.concat([
          getFilePath(path.dirname(config.pluginsFile), 'index.js'),
        ])
      }

      debug('scaffolded files %j', files)

      return this._fileListToTree(files)
    })
  },

  _fileListToTree (files) {
    // turns a list of file paths into a tree-like structure where
    // each entry has a name and children if it's a directory

    return _.reduce(files, (tree, file) => {
      let placeholder = tree
      const parts = file.split('/')

      _.each(parts, (part, index) => {
        let entry = _.find(placeholder, { name: part })

        if (!entry) {
          entry = { name: part }
          if (index < (parts.length - 1)) {
            // if it's not the last, it's a directory
            entry.children = []
          }

          placeholder.push(entry)
        }

        placeholder = entry.children
      })

      return tree
    }, [])
  },

  _assertInFileTree (filePath, config) {
    const relativeFilePath = path.relative(config.projectRoot, filePath)

    return this.fileTree(config)
    .then((fileTree) => {
      if (!this._inFileTree(fileTree, relativeFilePath)) {
        throw new Error(`You attempted to scaffold a file, '${relativeFilePath}', that's not in the scaffolded file tree. This is because you added, removed, or changed a scaffolded file. Make sure to update scaffold#fileTree to match your changes.`)
      }
    })
  },

  _inFileTree (fileTree, filePath) {
    let branch = fileTree
    const parts = filePath.split('/')

    for (let part of parts) {
      let found = _.find(branch, { name: part })

      if (found) {
        branch = found.children
      } else {
        return false
      }
    }

    return true
  },
}
