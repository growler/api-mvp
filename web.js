'use strict';

const {info, warn,error, debug} = require("./lib/log.js")

const redirectRe = /^(.*)?(\/(([^./]+)|([^/]+\.(html)))?)$/

const staticFiles = [
    '/client.js',
    '/favicon.ico'
]

function Main() {
    const reqPath = RequestPath()
    const req = RequestData()
    info(`${reqPath} ${JSON.stringify(req)}`)
    if (reqPath === '/') {
        StartResponse(200, 'OK', {})
        SendFile(`client/client.html`)
    } else if (staticFiles.includes(reqPath)) {
        StartResponse(200, 'OK', {})
        SendFile(`client${reqPath}`)
    } else if (reqPath.match(redirectRe)) {
        StartResponse(301, 'Page Moved', {})
        SendFile('client/301.html')
    } else {
        StartResponse(404, 'Page Not Found', {})
        SendFile('client/404.html')
    }

}

function SysMain() {
    Main()
}

/**
 *
 * @param {{Path: string, Error: string, Domain: string}} param
 */
function ErrorMain(param) {
    error(`${param.Domain} ${param.Path}: ${param.Error} ${param.Error}`)
    if (param.Error.Error() == 'Domain does not exist (4)') {
        StartResponse(301, 'Moved Permanently', {
            'Location': `http://${DefaultDomain()}`
        })
    } else {
        StartResponse(404, 'Page Not Found', {})
        SendFile('client/404.html')
    }
}

exports.Main = Main
exports.Error = ErrorMain
exports.SysMain = SysMain