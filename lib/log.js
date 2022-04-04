'use strict';

const logger = (logfunc, level) => (string, ...arg) => logfunc("[" + global.moduleName + "." + global.entryName + "]" + level + (string || ""), ...arg)

const debug = logger(SysLogDebugf, " ", string, obj)
const error = logger(SysLogf, "[ERROR]", string, obj)
const warn  = logger(SysLogf, "[WARN]", string, obj)
const info  = logger(SysLogf, "[INFO]", string, obj)

exports.debug = debug
exports.error = error
exports.warn = warn
exports.info = info
