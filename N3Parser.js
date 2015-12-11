/**
 * Created by joachimvh on 8/12/2015.
 */

var N3Lexer = require('./N3Lexer');
var Util = require('./Util');
var uuid = require('node-uuid');
var _ = require('lodash');

function N3Parser () {}

N3Parser.prototype.toJSONLD = function (input)
{
    var lexer = new N3Lexer();
    var lex = lexer.parse(input);
    var jsonld = this._simplify(this._parse(lex));

    // do this before removing default graph so everything has at least 1 reference
    this._compact(jsonld);

    // default graph is not necessary if there is only 1 root node
    if (jsonld['@graph'] && jsonld['@graph'].length === 1 && _.every(jsonld, function (val, key) { return key === '@context' || key === '@graph'; }))
    {
        var child = jsonld['@graph'][0];
        delete jsonld['@graph'];
        jsonld = _.extend(jsonld, child);
    }

    return jsonld;
};

N3Parser.prototype._parse = function (lex, root, expand)
{
    if (Util.isLiteral(lex) || _.isArray(lex))
        throw 'Input should be an object.';

    var result, i;
    if (lex.type === 'Document' || lex.type === 'Formula')
    {
        result = {'@context': {}, '@graph': []};

        var unsafe = this._unsafePrefixes(lex, _.assign({}, expand || {}));
        if (expand && '' in expand)
            unsafe[''] = expand['']; // always expand base prefix

        for (i = 0; i < lex.val.length; ++i)
        {
            var statement = lex.val[i];
            if (statement.type === 'Prefix')
                result['@context'][statement.val[0]] = statement.val[1].substring(1, statement.val[1].length - 1);
            else
                result['@graph'].push(this._parse(statement, result, unsafe));
        }
        for (var key in unsafe)
            delete result['@context'][key]; // delete unsafe keys from context to prevent confusion
    }
    else if (lex.type === 'TripleData' || lex.type === 'BlankTripleData')
    {
        var predicateObjects;
        if (lex.type === 'TripleData')
        {
            predicateObjects = lex.val[1];
            result = this._parse(lex.val[0], root, expand);
        }
        else
        {
            predicateObjects = lex.val;
            result = {};
        }
        for (i = 0; i < predicateObjects.length; ++i)
        {
            var po = predicateObjects[i];
            var predicate = this._handlePredicate(po.val[0], root, expand);
            if (!_.isString(predicate))
            {
                if ('@id' in predicate)
                    throw "Predicate shouldn't have an ID yet.";
                predicate['@id'] = '_:b_' + uuid.v4();
                if (Object.keys(predicate).length > 1) // no use adding it if it's just a blank node
                    root['@graph'].push(predicate);
                predicate = predicate['@id'];
            }
            var objects = _.map(po.val[1], function (thingy) { return this._parse(thingy, root, expand); }.bind(this));
            if (!(predicate in result))
                result[predicate] = objects;
            else
                result[predicate].push.apply(result[predicate], objects);
        }
    }
    else if (lex.type === 'List')
        result = { '@list': _.map(lex.val, function (thingy) { return this._parse(thingy, root, expand); }.bind(this)) };
    else if (lex.type === 'RDFLiteral')
    {
        var str = lex.val[0];
        var type = lex.val[1];
        var lang = lex.val[2];

        var tick = str[0];
        str = str[1] === tick ? str.substring(3, str.length-3) : str.substring(1, str.length-1);
        str = this._numericEscape(this._stringEscape(str));
        result = { '@value': str };

        if (type) result['@type'] = [this._parse(type, root, expand)]; // array to stay consistent with rest of jsonld generation
        else if (lang) result['@language'] = lang;
    }
    else if (lex.type === 'BooleanLiteral')
        result = { '@value': lex.val == 'true' || lex.val === '@true' };
    else if (lex.type === 'NumericLiteral')
        result = { '@value': parseFloat(lex.val) };
    else if (lex.type === 'Variable')
        result = { '@id' : lex.val };
    else if (lex.type === 'ExplicitIRI')
        result = { '@id': this._numericEscape(lex.val.substring(1, lex.val.length-1)) }; // remove < >
    else if (lex.type === 'PrefixedIRI')
    {
        var prefixIdx = lex.val.indexOf(':');
        var prefix = lex.val.substring(0, prefixIdx);
        if (prefix in expand)
            result = { '@id': (expand[prefix]) + lex.val.substring(prefixIdx + 1) };
        else
            result = { '@id': lex.val };
    }
    else throw 'Unsupported type or should have been handled in one of the other cases: ' + lex.type;

    return result;
};

N3Parser.prototype._handlePredicate = function (lex, root, expand)
{
    if (Util.isLiteral(lex) || _.isArray(lex))
        throw 'Input should be an object.';

    var result;
    if (lex.type === 'ExplicitIRI' || lex.type === 'PrefixedIRI')
        result = this._parse(lex, root, expand)['@id'];
    else if (lex.type === 'SymbolicIRI')
    {
        switch (lex.val)
        {
            case '=': result = 'http://www.w3.org/2002/07/owl#equivalentTo'; break;
            case '=>': result = 'http://www.w3.org/2000/10/swap/log#implies'; break;
            case '<=': result = { '@reverse': 'http://www.w3.org/2000/10/swap/log#implies' }; break;
            case '@a':
            case 'a': result = '@type'; break;
            default: throw 'Unsupported symbolic IRI: ' + lex.val;
        }
    }
    else
        result = this._parse(lex, root, expand);

    return result;
};

// http://www.w3.org/TR/turtle/#sec-escapes
N3Parser.prototype._stringEscape = function (str)
{
    var regex = /((?:\\\\)*)\\([tbnrf"'\\])/g;
    return str.replace(regex, function (match, p1, p2)
    {
        var slashes = p1.substr(0, p1.length/2);
        var c;
        switch (p2)
        {
            case 't': c = '\t'; break;
            case 'b': c = '\b'; break;
            case 'n': c = '\n'; break;
            case 'r': c = '\r'; break;
            case 'f': c = '\f'; break;
            case '"':
            case "'":
            case '\\': c = p2; break;
            default: c = '';
        }
        return slashes + c;
    });
};

N3Parser.prototype._numericEscape = function (str)
{
    var regex = /\\[uU]([A-fa-f0-9]{4,6})/g;
    return str.replace(regex, function (match, unicode)
    {
        return String.fromCharCode(unicode);
    });
};

// Warning: will modify the context object
N3Parser.prototype._unsafePrefixes = function (lex, context)
{
    if (Util.isLiteral(lex) || !lex) return {};
    if (_.isArray(lex)) return _.assign.apply(_, _.map(lex, function (thingy) { return this._unsafePrefixes(thingy, context); }.bind(this)));

    var prefixes = {};
    if (lex.type === 'Prefix')
    {
        context[lex.val[0]] = lex.val[1].substring(1, lex.val[1].length - 1);
        if (lex.val[0] === '') // always expand base prefix
            prefixes[''] = context[''];
    }

    _.assign(prefixes, this._unsafePrefixes(lex.val, context));
    if (lex.type === 'ExplicitIRI')
    {
        var prefixIdx = lex.val.indexOf(':');
        var prefix = lex.val.substring(1, prefixIdx); // 1, since '<' is still there
        if (prefix in context && lex.val.substr(prefixIdx, 3) !== '://')
            prefixes[prefix] = context[prefix];
    }
    return prefixes;
};

// TODO: reserved escape

N3Parser.prototype._simplify = function (jsonld)
{
    if (Util.isLiteral(jsonld))
        return jsonld;

    if (_.isArray(jsonld))
        return _.map(jsonld, this._simplify.bind(this));

    var keys = Object.keys(jsonld);
    if (keys.length === 1 && keys[0] === '@value')
        return jsonld['@value'];

    var result = {};
    for (var key in jsonld)
    {
        if (key === '@context')
        {
            if (Object.keys(jsonld[key]).length > 0)
                result[key] = this._simplify(jsonld[key]);
        }
        else
        {
            var objects = this._simplify(jsonld[key]);
            if (key === '@type')
                objects = _.pluck(objects, '@id');

            if (objects.length === 1 && key !== '@graph' && key !== '@list')
                objects = objects[0];
            result[key] = objects;
        }
    }
    // this is a special case where we have literals as triples without predicates in the graph root
    if ('@graph' in result)
        result['@graph'] = _.map(result['@graph'], function (thingy) { if (Util.isLiteral(thingy)) return { '@value': thingy}; return thingy; });

    return result;
};

N3Parser.prototype._compact = function (jsonld)
{
    if (Util.isLiteral(jsonld))
        return;
    if (!('@graph' in jsonld))
        return _.each(jsonld, function (thingy) { this._compact(thingy); }.bind(this));

    var nodes = {};
    this._findReferences(jsonld['@graph'], nodes);
    this._expand(jsonld['@graph'], nodes);
    jsonld['@graph'] = _.uniq(jsonld['@graph'], false, function (thingy) { return thingy['@id'] || uuid.v4(); });

    // elements don't have to be in the root of a graph if they are already referenced somewhere else in the graph
    var newGraph = [];
    for (var i = 0; i < jsonld['@graph'].length; ++i)
    {
        var thingy = jsonld['@graph'][i];
        var id = thingy['@id'];
        if (!id || nodes[id].references.length === 0)
            newGraph.push(thingy);
    }
    jsonld['@graph'] = newGraph;
    this._compact(newGraph);
};

N3Parser.prototype._findReferences = function (jsonld, nodes, parent)
{
    if (Util.isLiteral(jsonld))
        return;
    if (_.isArray(jsonld))
        return _.each(jsonld, function (thingy) { this._findReferences(thingy, nodes, parent); }.bind(this));

    if ('@id' in jsonld)
    {
        var id = jsonld['@id'];
        if (!(id in nodes))
            nodes[id] = { node: jsonld, references: [] };
        else
            nodes[id].node = this._mergeNodes(nodes[id].node, jsonld);
        if (parent && nodes[id].references.indexOf(parent) < 0)
            nodes[id].references.push(parent);
    }

    if ('@graph' in jsonld)
        return;

    // adding the predicates would only be necessary if we delete the blank node @ids
    for (var key in jsonld)
        this._findReferences(jsonld[key], nodes, ('@id' in jsonld) ? jsonld['@id'] : jsonld);
};

N3Parser.prototype._expand = function (jsonld, nodes)
{
    if (Util.isLiteral(jsonld))
        return;
    if ('@graph' in jsonld)
        return;

    _.each(jsonld, function (thingy) { this._expand(thingy, nodes); }.bind(this));
    if (_.isArray(jsonld))
        return;

    var id = jsonld['@id'];
    if (id && nodes[id])
        _.assign(jsonld, nodes[id].node);
};

N3Parser.prototype._deflate = function (jsonld, nodes)
{
    if (Util.isLiteral(jsonld))
        return;
    if ('@graph' in jsonld)
        return;

    _.each(jsonld, function (thingy) { this._deflate(thingy, nodes); }.bind(this));
    if (_.isArray(jsonld))
        return;

    var id = jsonld['@id'];
    if (id)
    {
        if (nodes[id])
            delete nodes[id];
        else
            for (var key in jsonld)
                if (key !== '@id')
                    delete jsonld[key];
    }
};

N3Parser.prototype._mergeNodes = function (objectA, objectB)
{
    var i;
    if (_.isString(objectA) && _.isString(objectB))
        return [objectA, objectB];

    if (_.isArray(objectA) !== _.isArray(objectB))
    {
        objectA = _.isArray(objectA) ? objectA : [objectA];
        objectB = _.isArray(objectB) ? objectB : [objectB];
    }

    if (_.isArray(objectA) && _.isArray(objectB))
        return objectA.concat(objectB);

    var idA = objectA['@id'];
    var idB = objectB['@id'];
    if (idA !== idB || (idA === undefined && idB === undefined))
        return [objectA, objectB];

    // 2 objects
    var result = {};
    var keys = _.union(Object.keys(objectA), Object.keys(objectB));
    for (i = 0; i < keys.length; ++i)
    {
        var key = keys[i];
        if (key === '@id')
        {
            if (objectA[key] !== objectB[key])
                throw "Unable to merge 2 objects with different IDs.";
            result[key] = objectA[key];
            continue;
        }

        if (objectA[key] !== undefined && objectB[key] !== undefined)
            result[key] = this._mergeNodes(objectA[key], objectB[key]);
        else if (objectA[key] !== undefined)
            result[key] = objectA[key];
        else if (objectB[key] !== undefined)
            result[key] = objectB[key];
    }
    return result;
};

module.exports = N3Parser;

// :a :b :c.a:a :b :c.
// :a :b :5.E3:a :b :c.
//var parser = new N3Parser();
//var jsonld = parser.toJSONLD('_:request http:methodName "GET"; tmpl:requestURI ("http://skillp.tho.f4w.l0g.in/api/operator_skills/" ?id); http:resp [ http:body _:body ]. _:body :contains {[ :name _:name; :desc _:desc; :role _:role; :skills {[ :machine _:m; :tool _:t; :computer _:c]} ]}. ?operator :machineSkills _:m; :toolSkills _:t; :computerSkills _:c. ?operator :name _:name; :desc _:desc; :role _:role.');
//var jsonld = parser.toJSONLD('() {() () ()} ().');
//var jsonld = parser.toJSONLD('@prefix : <http://f4w.restdesc.org/demo#>. @prefix tmpl: <http://purl.org/restdesc/http-template#> . @prefix http: <http://www.w3.org/2011/http#> ._:sk15_1 http:methodName "POST". _:sk15_1 tmpl:requestURI ("http://defects.tho.f4w.l0g.in/api/reports"). _:sk15_1 http:body {_:sk16_1 :event_id 174 .   _:sk16_1 :operator_id 3 .   _:sk16_1 :solution_id 3 .   _:sk16_1 :success false.   _:sk16_1 :comment "solved!"}. :firstTry :triedAndReported _:sk17_1. :firstTry :tryNewSolution true.');
//var jsonld = parser.toJSONLD('"a"^^<xsd:int> :a _:a.');
//var jsonld = parser.toJSONLD(':a :tolerances ( {[ :min :min1; :max :max1 ]} {[ :min :min2; :max :max2 ]} ).');
//var jsonld = parser.toJSONLD('{ :a }.');
//var jsonld = parser.toJSONLD(':a :b 0, 1.');
//var jsonld = parser.toJSONLD(':toJSONLDa :b :c. :c :b :a.');
//var jsonld = parser.toJSONLD('# comment " test \n <http://test#stuff> :b "str#ing". :a :b """line 1\n#line2\nline3""". # comment about this thing');
//var jsonld = parser.toJSONLD(':a :b "a\n\rb\\"c"@nl-de.');
//var jsonld = parser.toJSONLD(':Plato :says { :Socrates :is :mortal }.');
//var jsonld = parser.toJSONLD('{ :Plato :is :immortal } :says { :Socrates :is { :person :is :mortal } . :Donald a :Duck }.');
//var jsonld = parser.toJSONLD('[:a :b]^<test> [:c :d]!<test2> [:e :f]!<test3>.');
//var jsonld = parser.toJSONLD('[:a :b] :c [:e :f].');
//var jsonld = parser.toJSONLD(':a :b 5.E3.a:a :b :c.');
//var jsonld = parser.toJSONLD('@prefix gr: <http://purl.org/goodrelations/v1#> . <http://www.acme.com/#store> a gr:Location; gr:hasOpeningHoursSpecification [ a gr:OpeningHoursSpecification; gr:opens "08:00:00"; gr:closes "20:00:00"; gr:hasOpeningHoursDayOfWeek gr:Friday, gr:Monday, gr:Thursday, gr:Tuesday, gr:Wednesday ]; gr:name "Hepp\'s Happy Burger Restaurant" .');
//var jsonld = parser.toJSONLD('@prefix ex:<http://ex.org/>. <:a> <ex:b> ex:c.');
//console.log(JSON.stringify(jsonld, null, 4));

//var fs = require('fs');
//var data = fs.readFileSync('n3/secondUseCase/proof.n3', 'utf8');
//var jsonld = parser.parse(data);

//var JSONLDParser = require('./JSONLDParser');
//var jp = new JSONLDParser();
//console.log(jp.toN3(jsonld, 'http://www.example.org/'));