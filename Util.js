
var _ = require('lodash');
var uuid = require('node-uuid');

function Util() {}

Util.BASE = '#base';

Util.isLiteral = function (thingy)
{
    return _.isString(thingy) || _.isNumber(thingy) || _.isBoolean(thingy);
};

Util.isNonStringLiteral = function (thingy)
{
    return Util.isLiteral(thingy) && !_.isString(thingy);
};

module.exports = Util;