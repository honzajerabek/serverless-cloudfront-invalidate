'use strict'

const BbPromise = require('bluebird')
const chalk = require('chalk')
const resolveStackOutput = require('./resolveStackOutput')
const getAwsOptions = require('./getAwsOptions')
const messagePrefix = 'CloudFront Invalidate: '

class ServerlessCloudfrontInvalidate {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options || {}
    this.servicePath = this.serverless.service.serverless.config.servicePath

    this.commands = {
      cloudFrontInvalidate: {
        usage: 'Invalidate Cloudfront distribution',
        lifecycleEvents: [
          'invalidate',
        ],
        commands: {
          invalidate: {
            options: {
            },
            lifecycleEvents: [
              'invalidate',
            ],
          },
        },
      },
    }


    this.hooks = {
      'after:deploy:deploy': () => BbPromise.bind(this).then(this.createInvalidation),
      'cloudFrontInvalidate:invalidate': () => BbPromise.bind(this).then(this.createInvalidation),
    }
  }

  isOffline() {
    return String(this.options.offline).toUpperCase() === 'TRUE' || process.env.IS_OFFLINE
  }

  getEndpoint() {
    return this.serverless.service.custom.cloudFrontInvalidation.hasOwnProperty('endpoint') ? this.serverless.service.custom.cloudFrontInvalidation.endpoint : null
  }

  client() {
    const provider = this.serverless.getProvider('aws')
    const awsOptions = getAwsOptions(provider)

    if (this.getEndpoint() && this.isOffline()) {
      awsOptions.endpoint = new provider.sdk.Endpoint(this.serverless.service.custom.cloudFrontInvalidation.endpoint)
    }
    return new provider.sdk.CloudFront(awsOptions)
  }

  createInvalidation() {
    let cloudFrontInvalidation = this.serverless.service.custom.cloudFrontInvalidation
    const cli = this.serverless.cli
    if (!cloudFrontInvalidation) {
      cli.consoleLog(`${messagePrefix}${chalk.red('No configuration found')}`)
      return Promise.resolve()
    }

    cli.consoleLog(`${messagePrefix}${chalk.yellow('Creating invalidation...')}`)

    const invalidate = () => this.getDistributionId(cloudFrontInvalidation)
      .then(distributionId => {
          if (!Array.isArray(cloudFrontInvalidation.paths)) {
            cli.consoleLog(`${messagePrefix}${chalk.red('No configuration found')}`)
            return Promise.reject()
          }

          const params = {
            DistributionId: distributionId,
            InvalidationBatch: {
              CallerReference: new Date().valueOf().toString(),
              Paths: {
                Quantity: cloudFrontInvalidation.paths.length,
                Items: cloudFrontInvalidation.paths,
              },
            },
          }

          return this.client().createInvalidation(params).promise()
      })

    return invalidate()
      .then(() => {
        cli.printDot()
        cli.consoleLog('')
        cli.consoleLog(`${messagePrefix}${chalk.yellow('Invalidation created.')}`)
      })
  }

  getDistributionId(config) {
    if (config.distributionId) {
      return Promise.resolve(config.distributionId)
    } else if (config.distributionIdKey) {
      return resolveStackOutput(this, config.distributionIdKey)
    } else {
      return Promise.reject('Unable to find distribution. Please provide a value for distributionId or distributionIdKey')
    }
  }
}

module.exports = ServerlessCloudfrontInvalidate
