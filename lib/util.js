'use strict';

const callerURIre = /^(?:\+)?([^@]+)(?:@(.+))?$/

const addressParts = addr => {
    const m = addr.match(callerURIre)
    if (m !== null) {
        return [m[1], m[2]]
    } else {
        return [null, null]
    }
}

const addressUserPart = addr => {
    const m = addr.match(callerURIre)
    if (m !== null) {
        return m[1]
    } else {
        return null
    }
}

const telnumRe = /^[+]?[0-9]{11}$/

/**
 *
 * @param {string} addr
 * @returns
 */
const isTelnum = addr => telnumRe.test(addr)

exports.addressParts = addressParts
exports.addressUserPart = addressUserPart
exports.isTelnum = isTelnum