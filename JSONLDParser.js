/**
 * Created by joachimvh on 30/06/2015.
 */

var _ = require('lodash');
var format = require('util').format;

function JSONLDParser () {}

// TODO: currently only focusing on JSON-LD that can be generated with N3Parser.js

JSONLDParser.prototype.parse = function (jsonld)
{
    // TODO: not sure if this will never give issues
    var ignoreGraph = _.every(jsonld, function (val, key) { return key === '@context' || key === '@graph'; });
    var graphList = [];
    var test = this._parse(jsonld, null, [], graphList, ignoreGraph);
    return test.join('\n');
};

JSONLDParser.prototype._parse = function (jsonld, context, graphList, root, ignoreGraph)
{
    // TODO: handle quotes(+escape)/language/datatype
    if (_.isString(jsonld) || _.isNumber(jsonld))
        return jsonld;

    // TODO: flatten might break things here
    if (_.isArray(jsonld))
        return _.flatten(jsonld.map(function (child) { return this._parse(child, context, graphList);}, this));

    if (Object.keys(jsonld).length === 0)
        return '[]';

    var strings = [];
    context = context || {'_':'_'}; // support for blank nodes
    var contextStrings = [];
    // TODO: what if there is context without a graph? (is this allowed?)
    if (jsonld['@context'])
    {
        context = _.extend({}, context);
        for (var key in jsonld['@context'])
        {
            var val = jsonld['@context'][key];
            if (key === '@vocab' || key === '@base') // TODO: not a problem for N3Parser output though ...
                key = '';
            contextStrings.push(format('PREFIX %s: <%s>', key, val));
            context[key] = val;
        }
    }
    // TODO: shouldn't overwrite id if it already has a value
    var id = jsonld['@id'] && this._URIfix(jsonld['@id'], context);
    if (jsonld['@graph'])
    {
        // TODO: how to handle prefixes? this would place dots after them
        var localList = [];
        this._parse(jsonld['@graph'], context, localList, true);
        id = format(ignoreGraph ? '%s' : '{ %s }', localList.join(' . '));
    }

    // TODO: this is wrong, list might contain triples that need to be put somewhere else
    if (jsonld['@list'])
        id = format('( %s )', jsonld['@list'].map(function (child) { return this._parse(child, context, graphList);}, this).join(' '));

    // TODO: context is being ignored here
    if (jsonld['@forAll'])
        return format('@forAll %s .', jsonld['@forAll'].map(function (child) { return this._parse(child, context, graphList);}, this).join(' , '));
    if (jsonld['@forSome'])
        return format('@forSome %s .', jsonld['@forAll'].map(function (child) { return this._parse(child, context, graphList);}, this).join(' , '));

    // TODO: @id, @type, @reverse (can only happen in specific cases when coming from parser), blank nodes with no @id
    // TODO: handle blank nodes generated for special predicates
    var predicateObjectList = [];
    var rest = [];
    for (var key in jsonld)
    {
        if (key !== '@id' && key !== '@graph' && key !== '@context' && key !== '@list')
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
                var object = this._parse(val[i], context, graphList);
                if (val[i]['@id'] && Object.keys(val[i]).length > 1)
                {
                    for (var j = 0; j < object.length; ++j)
                        graphList.push(object[j]);
                    object = this._URIfix(val[i]['@id'], context);
                }
                if (predicate === 'a')
                    object = this._URIfix(object, context);
                objects.push(object);
            }
            predicateObjectList.push(format('%s %s', predicate, objects.join(' , ')));
        }
    }
    // TODO: handle triples that only have a subject without predicate/object
    if (predicateObjectList.length > 0)
    {
        if (id)
            graphList.push(format('%s %s', id, predicateObjectList.join(' ; ')));
        else
            strings.push(format('[ %s ]', predicateObjectList.join(' ; '))); // TODO: find out when I need a dot here
    }
    strings.push(id);

    //if (root)
        //strings = [strings.join(' . ') + ' . '];

    // handle context after the joining
    //strings = contextStrings.concat(strings);

    return strings;
};

JSONLDParser.prototype._URIfix = function (id, context)
{
    var colonIdx = id.indexOf(':');
    if (colonIdx >= 0)
    {
        var prefix = id.substring(0, colonIdx);
        var suffix = id.substr(colonIdx+1);
        if ((context[prefix] || prefix === '_') && suffix.substr(0, 2) !== '//')
            return format('%s:%s', prefix, suffix);
    }
    else
        return format(':%s', id);

    return format('<%s>', id);
};

module.exports = JSONLDParser;