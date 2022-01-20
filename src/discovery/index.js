let aws = require('aws-sdk')
let http = require('http')
/**
 * @param {string} type - events, queues, or tables
 * @returns {object} {name: value}
 */
module.exports = function lookup (callback) {
  let { ARC_APP: app, ARC_ENV: env } = process.env
  if (!app) return callback(ReferenceError('ARC_APP env var not found'))
  let Path = '/' + toLogicalID(`${app}-${env}`)
  let Recursive = true
  let values = []
  let local = env === 'testing'
  let config

  if (local) {
    // if running in sandbox, sandbox has an SSM mock, use that
    let port = process.env.ARC_INTERNAL_PORT
    if (!port) return callback(ReferenceError('ARC_INTERNAL_PORT env var not found'))
    let region = process.env.AWS_REGION || 'us-west-2'
    config = {
      endpoint: new aws.Endpoint(`http://localhost:${port}/_arc/ssm`),
      region,
      httpOptions: { agent: new http.Agent() }
    }
  }
  let ssm = new aws.SSM(config)

  function getParams (params) {
    ssm.getParametersByPath(params, function done (err, result) {
      if (err) {
        callback(err)
      }
      else if (result.NextToken) {
        values = values.concat(result.Parameters)
        getParams({ Path, Recursive, NextToken: result.NextToken })
      }
      else {
        values = values.concat(result.Parameters)
        let services = values.reduce((a, b) => {
          let hierarchy = b.Name.split('/')
          hierarchy.shift() // leading slash
          hierarchy.shift() // stack name
          let type = hierarchy.shift() // i.e. tables, events, queues, plugins
          if (!a[type]) a[type] = {}
          let parent = a[type]
          let child, lastChild, lastParent
          /* eslint-disable-next-line */
          while (child = hierarchy.shift()) {
            if (!parent[child]) parent[child] = {}
            lastParent = parent
            parent = parent[child]
            lastChild = child
          }
          lastParent[lastChild] = b.Value
          return a
        }, {})
        callback(null, services)
      }
    })
  }
  getParams({ Path, Recursive })
}

function toLogicalID (str) {
  str = str.replace(/([A-Z])/g, ' $1')
  if (str.length === 1) {
    return str.toUpperCase()
  }
  str = str.replace(/^[\W_]+|[\W_]+$/g, '').toLowerCase()
  str = str.charAt(0).toUpperCase() + str.slice(1)
  str = str.replace(/[\W_]+(\w|$)/g, (_, ch) => ch.toUpperCase())
  if (str === 'Get') {
    return 'GetIndex'
  }
  return str
}
