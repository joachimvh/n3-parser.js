/**
 * Created by joachimvh on 18/06/2015.
 */

var _ = require('lodash');

function N3Parser ()
{

}

// TODO: no numeric literals yet
// TODO: should extend this to correct characters
// TODO: check this for more annoying examples
N3Parser._literalRegex = /("|')(.*?[^\\])?(\\\\)*\1((\^\^((<[^>]*>)|([a-zA-Z0-9]*:[a-zA-Z0-9]+)))|(@[a-z]+(-[a-z0-9]+)*))?/g;
N3Parser._iriRegex = /<[^\u0000-\u0020<>"{}|^`\\]*>/g;
N3Parser._prefixIriRegex = /[a-zA-Z0-9]*:[a-zA-Z0-9]+/g; // TODO: needs correct characters, only works because all other things should have disappeared at this point

N3Parser.prototype.parse = function (n3String)
{
    var replacementMap = {idx: 0};
    n3String = this._replaceMatches(n3String, N3Parser._literalRegex, replacementMap);
    n3String = this._replaceMatches(n3String, N3Parser._iriRegex, replacementMap);
    n3String = this._replaceMatches(n3String, N3Parser._prefixIriRegex, replacementMap);

    var tokens = n3String.split(/\s+|([;.,{}[\]()])|(<?=>?)/).filter(Boolean); // splits and removes empty elements
    var jsonld = this._statementsOptional({tokens: tokens});
    jsonld = this._revertMatches(jsonld, _.invert(replacementMap));
    console.log(JSON.stringify(jsonld, null, 4));
};

N3Parser.prototype._replaceMatches = function (string, regex, map)
{
    var matches = [];
    var match;
    while (match = regex.exec(string))
        matches.push({idx:match.index, length:match[0].length});

    var stringParts = [];
    for (var i = matches.length-1; i >= 0; --i)
    {
        match = matches[i];

        var matchString = string.substr(match.idx, match.length);
        if (!map[matchString])
            map[matchString] = '#' + ++map.idx;

        stringParts.push(string.substr(match.idx + match.length));
        stringParts.push(map[matchString]);
        string = string.substring(0, match.idx);
    }
    stringParts.push(string);
    stringParts.reverse();

    return stringParts.join('');
};

N3Parser.prototype._revertMatches = function (jsonld, invertedMap)
{
    if (_.isString(jsonld))
        return jsonld[0] === '#' ? invertedMap[jsonld] : jsonld;

    if (_.isArray(jsonld))
        return jsonld.map(function (thingy) { return this._revertMatches(thingy, invertedMap); }, this);

    var result = {};
    for (var key in jsonld)
    {
        var val = this._revertMatches(jsonld[key], invertedMap);
        key = this._revertMatches(key, invertedMap);
        result[key] = val;
    }
    return result;
};

N3Parser.prototype._statementsOptional = function (result)
{
    if (result.tokens.length === 0)
        return {};

    var statement = this._statement(result);

    var dot = result.tokens.shift(); // TODO: special case with PREFIX/BASE
    if (dot !== '.')
        throw "Error: expected '.' but got " + dot; // TODO: better error reporting would be nice

    // TODO: extend problem possible in deeper levels?
    var statements = this._statementsOptional(result);
    if (statement['@graph'] && statements['@graph'])
        statements['@graph'] = statement['@graph'].concat(statements['@graph']);
    return _.extend(statement, statements);
};


N3Parser.prototype._statement = function (result)
{
    if (result.tokens[0] === '@base' || result.tokens[0] === '@prefix' || result.tokens[0] === '@keywords')
        return this._declaration(result);

    if (result.tokens[0] === '@forAll')
        return this._universal(result);

    if (result.tokens[0] === '@forSome')
        return this._existential(result);

    return this._simpleStatement(result);
};

// TODO: uri validation and so on? (just run it through an n3 validator first?)
N3Parser.prototype._declaration = function (result)
{
    var declaration = result.tokens.shift(); // TODO: handle incorrect array lengths

    if (declaration === '@base')
    {
        var uri = results.tokens.shift();
        return { '@context': { '@base': uri}};
    }
    else if (declaration === '@prefix')
    {
        var prefix = result.tokens.shift();
        var uri = result.tokens.shift();
        if (prefix === ':')
            return result.jsonld, { '@context': { '@vocab': uri}};
        else
        {
            var key = prefix.slice(0, -1);
            var extension = { '@context': {}};
            extension['@context'][key] = uri;
            return extension;
        }
    }
    // TODO: use this later on
    else if (declaration === '@keywords')
    {
        var keywords = [];
        while (result.tokens[0] !== '.')
        {
            keywords.push(result.tokens[0].shift());
            if (result.tokens[0] === ',')
                result.tokens[0].shift();
        }
    }
};

// TODO: these are actually not supported JSON-LD, just adding them for completeness
N3Parser.prototype._universal = function (result)
{
    result.tokens.shift();
    var symbols = [];
    while (result.tokens[0] !== '.')
    {
        symbols.push(result.tokens[0].shift());
        if (result.tokens[0] === ',')
            result.tokens[0].shift();
    }
    var jsonld = {};
    jsonld['@forAll'] = symbols;
    return {'@graph': [jsonld]};
};
N3Parser.prototype._existential = function (result)
{
    result.tokens.shift();
    var symbols = [];
    while (result.tokens[0] !== '.')
    {
        symbols.push(result.tokens[0].shift());
        if (result.tokens[0] === ',')
            result.tokens[0].shift();
    }
    var jsonld = {};
    jsonld['@forSome'] = symbols;
    return {'@graph': [jsonld]};
};

N3Parser.prototype._simpleStatement = function (result)
{
    var subject = this._subject(result);
    var propertylist = this._propertylist(result);
    return {'@graph': [_.extend(subject, propertylist)]};
};

N3Parser.prototype._subject = function (result)
{
    // TODO: obviously not always correct
    return { '@id': this._expression(result) };
};

N3Parser.prototype._expression = function (result)
{
    return this._pathitem(result);
    // this._pathtail(result); // TODO: look into pathtail
};

N3Parser.prototype._pathitem = function (result)
{
    if (result.tokens[0] === '{')
        return this._formulacontent(result);
    else if (result.tokens[0] === '[')
        return this._propertylist(result);
    else if (result.tokens[0] === '(')
        return this._pathlist(result);
    else {
        // TODO: let's assume all literals have been mapped already
        // TODO: we're actually not differentiating between uri's and literals at this point? just assuming everything is uri at this point
        return result.tokens.shift();
    }
};

N3Parser.prototype._pathlist = function (result)
{
    var list = [];
    result.tokens.shift(); // '('
    while (result.tokens[0] !== ')')
        list.push(this._expression(result));
    result.tokens.shift(); // ')'
    return {'@list': list};
};

// TODO: how do you do named graphs in N3?
N3Parser.prototype._formulacontent = function (result)
{
    var content = {};
    result.tokens.shift(); // '{'
    var start = true;
    while (result.tokens[0] !== '}')
    {
        if (!start)
            result.tokens.shift(); // '.'
        // difference with statements_optional: this one doesn't end with a dot
        // TODO: same problem as statementsOptional here
        var statement = this._statement(result);
        if (content['@graph'] && statement['@graph'])
            statement['@graph'] = content['@graph'].concat(statement['@graph']);
        _.extend(content, statement);
        start = false;
    }
    result.tokens.shift(); // '}'
    return content;
};

N3Parser.prototype._propertylist = function (result)
{
    if (result.tokens[0] === '[')
        result.tokens.shift();
    // TODO: handle special cases such as formulas as predicate
    // TODO: use @type for type predicates?
    var predicate = this._predicate(result);
    var objects = [this._object(result)];
    while (result.tokens[0] === ',')
    {
        result.tokens.shift();
        objects.push(this._object(result));
    }
    var jsonld = {};
    jsonld[predicate] = objects;
    if (result.tokens[0] === ';')
    {
        result.tokens.shift();
        _.extend(jsonld, this._propertylist(result));
    }
    if (result.tokens[0] === ']')
        result.tokens.shift();
    return jsonld;
};

N3Parser.prototype._predicate = function (result)
{
    // TODO: all the other types of expressions possible
    return this._expression(result);
};

N3Parser.prototype._object = function (result)
{
    // TODO: check for literal/uri here or later?
    var object = this._expression(result);
    return _.isString(object) ? { '@id': object} : object;
};

var parser = new N3Parser();
parser.parse(':Plato :says { :Socrates :is :mortal }.');