
const isStr = (x) => x && typeof x === 'string'

module.exports = {
    isStr,
    isUsername: (x) => isStr(x) && /^[a-z0-9_]{1,16}$/i.test(x),
    isDisplayName: (x) => isStr(x) && /^.{0,16}$/.test(x),

    isEmail: (x) => isStr(x) && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(x),
    isToken: (x) => isStr(x) && /^[a-f0-9]{8}$/i.test(x),
    isPassword: (x) => isStr(x) && /^(?=.*[a-z])(?=.*\d)(?=.*[^a-z0-9]).{8,32}$/i.test(x),
    isUUIDv4: (x) => isStr(x) && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

    isDate: (x) => x instanceof Date && !isNaN(x), // why not require('util/types').isDate ?
    isDateIn: (x, min, max) => x instanceof Date && !isNaN(x) && min.getTime() < x && max.getTime() > x,
}
