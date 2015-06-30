/**
 * Created by joachimvh on 30/06/2015.
 */

var _ = require('lodash');
var format = require('util').format;

function JSONLDParser () {}

// TODO: currently only focusing on JSON-LD that can be generated with N3Parser.js

JSONLDParser.prototype.parse = function (jsonld, context)
{
    // TODO: handle quotes(+escape)/language/datatype
    if (_.isString(jsonld) || _.isNumber(jsonld))
        return jsonld;

    if (_.isArray(jsonld))
        return jsonld.map(function (child) { return this.parse(child, context);}, this).join('');

    if (Object.keys(jsonld).length === 0)
        return '[]';

    var strings = [];
    context = context || {};
    if (jsonld['@context'])
    {
        context = _.extend({}, context);
        for (var key in jsonld['@context'])
        {
            var val = jsonld['@context'][key];
            if (key === '@vocab' || key === '@base') // TODO: not a problem for N3Parser output though ...
                key = '';
            strings.push(format('PREFIX %s: <%s>\n', key, val));
            context[key] = val;
        }
    }
    if (jsonld['@graph'])
        strings.push(format('{\n%s}', this.parse(jsonld['@graph'], context)));

    // TODO: technically these can also have other properties such as type, let's assume they don't for now
    if (jsonld['@list'])
        return format('( %s )', jsonld['@list'].map(function (child) { return this.parse(child, context);}, this).join(' '));
    if (jsonld['@forAll'])
        return format('@forAll %s .\n', jsonld['@forAll'].map(function (child) { return this.parse(child, context);}, this).join(' , '));
    if (jsonld['@forSome'])
        return format('@forSome %s .\n', jsonld['@forAll'].map(function (child) { return this.parse(child, context);}, this).join(' , '));

    // TODO: @id, @type, @reverse (can only happen in specific cases when coming from parser), blank nodes with no @id
    var id = jsonld['@id'];
    // TODO: handle blank nodes generated for special predicates
    var uri = id && this._URIfix(id, context);
    var predicateObjectList = [];
    var rest = [];
    for (var key in jsonld)
    {
        if (key !== '@id' && key !== '@graph' && key !== '@context')
        {
            var val = jsonld[key];
            var predicate = this._URIfix(key, context);
            if (key === '@type')
                predicate = 'a';

            if (!_.isArray(val))
                val = [val];

            var objects = [];
            for (var i = 0; i < val.length; ++i)
            {
                var object = this.parse(val[i], context);
                if (val[i]['@id'])
                {
                    // TODO: should check for empty subresults
                    rest.push(object);
                    object = this._URIfix(val[i]['@id'], context);
                }
                objects.push(object);
            }
            predicateObjectList.push(format('%s %s', predicate, objects.join(' , ')));
        }
    }
    // TODO: handle triples that only have a subject without predicate/object
    if (predicateObjectList.length > 0)
    {
        if (id)
            strings.push(format('%s %s .\n', uri, predicateObjectList.join(' ; ')));
        else
            strings.push(format('[ %s ]\n', predicateObjectList.join(' ; '))); // TODO: find out when I need a dot here
    }
    strings = strings.concat(rest);

    return strings.join('');
};

JSONLDParser.prototype._URIfix = function (id, context)
{
    var colonIdx = id.indexOf(':');
    var prefix = null;
    var suffix = id;
    if (colonIdx >= 0 && context[id.substring(0, colonIdx)] && id.substr(colonIdx+1, 2) !== '//')
    {
        prefix = id.substring(0, colonIdx);
        suffix = id.substring(colonIdx + 1);
    }
    else if (colonIdx < 0)
        prefix = '';

    return prefix === null ? format('<%s>', id) : format('%s:%s', prefix, suffix);
};

module.exports = JSONLDParser;