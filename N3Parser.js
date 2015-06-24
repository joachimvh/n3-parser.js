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
N3Parser._prefixFirst = /[A-Z_a-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c-\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]/g;
N3Parser._prefixRest = /[-_0-9\u00b7\u0300-\u036f\u203f-\u2040]/g;
N3Parser._prefix = new RegExp(
    '(' + N3Parser._prefixFirst.source + '((' + N3Parser._prefixRest + '|\.)*' + N3Parser._prefixRest + ')?)?'
);
N3Parser._stringRegex = /("|')(\1\1)?(?:[^]*?[^\\])??(?:\\\\)*\2\1/g;
N3Parser._datatypeRegex = /\^\^((<[^>]*>)|([a-zA-Z0-9]*:[a-zA-Z0-9]+))/g;
N3Parser._langRegex = /@[a-z]+(-[a-z0-9]+)*/g;
N3Parser._literalRegex = new RegExp(
    N3Parser._stringRegex.source +
    "((" + N3Parser._datatypeRegex.source + ")|(" + N3Parser._langRegex.source + "))",
    "g"
);
N3Parser._numericalRegex = /[-+]?[0-9]+(\\.[0-9]*)?([eE][-+]?[0-9]+)?/g;
N3Parser._iriRegex = /<[^>]*>/g;
N3Parser._prefixIriRegex = /\W*:\W+/g; // TODO: needs correct characters, only works because all other things should have disappeared at this point

N3Parser.prototype.parse = function (n3String)
{
    var replacementMap = {idx: 0};
    n3String = this._replaceMatches(n3String, N3Parser._literalRegex, replacementMap);
    n3String = this._replaceMatches(n3String, N3Parser._iriRegex, replacementMap);
    n3String = this._replaceMatches(n3String, N3Parser._prefixIriRegex, replacementMap);

    var tokens = n3String.split(/\s+|([;.,{}[\]()])|(<?=>?)/).filter(Boolean); // splits and removes empty elements
    var jsonld = this._statementsOptional(tokens);
    jsonld = this._revertMatches(jsonld, _.invert(replacementMap));
    console.log(JSON.stringify(jsonld, null, 4));

    // TODO: update literals that are currently represented as URIs
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

N3Parser.prototype._statementsOptional = function (tokens)
{
    if (tokens.length === 0)
        return {};

    var dotExpected = tokens[0] !== 'PREFIX' && tokens[0] !== 'BASE';
    var statement = this._statement(tokens);

    if (dotExpected)
    {
        var dot = tokens.shift();
        if (dot !== '.')
            throw "Error: expected '.' but got " + dot; // TODO: better error reporting would be nice
    }

    // TODO: extend problem possible in deeper levels?
    var statements = this._statementsOptional(tokens);
    if (statement['@graph'] && statements['@graph'])
        statements['@graph'] = statement['@graph'].concat(statements['@graph']);
    return _.extend(statement, statements);
};


N3Parser.prototype._statement = function (tokens)
{
    if (tokens[0] === '@base' || tokens[0] === 'BASE' || tokens[0] === '@prefix' || tokens[0] === 'PREFIX' || tokens[0] === '@keywords')
        return this._declaration(tokens);

    if (tokens[0] === '@forAll' || tokens[0] === '@forSome')
        return this._quantification(tokens);

    return this._simpleStatement(tokens);
};

// TODO: uri validation and so on? (just run it through an n3 validator first?)
N3Parser.prototype._declaration = function (tokens)
{
    var declaration = tokens.shift(); // TODO: handle incorrect array lengths

    if (declaration === '@base' || declaration === 'BASE')
    {
        var uri = results.tokens.shift();
        return { '@context': { '@base': uri}};
    }
    else if (declaration === '@prefix' || declaration === 'PREFIX')
    {
        var prefix = tokens.shift();
        var uri = tokens.shift();
        if (prefix === ':')
            return { '@context': { '@vocab': uri}};
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
        while (tokens[0] !== '.')
        {
            keywords.push(tokens[0].shift());
            if (tokens[0] === ',')
                tokens[0].shift();
        }
    }
};

N3Parser.prototype._quantification = function (tokens)
{
    var quantifier = tokens.shift();
    var symbols = [];
    while (tokens[0] !== '.')
    {
        symbols.push(tokens[0].shift());
        if (tokens[0] === ',')
            tokens[0].shift();
    }
    var jsonld = {};
    jsonld[quantifier] = symbols;
    return {'@graph': [jsonld]};
};

N3Parser.prototype._simpleStatement = function (tokens)
{
    var subject = this._subject(tokens);
    var propertylist = this._propertylist(tokens);
    return {'@graph': [_.extend(subject, propertylist)]};
};

N3Parser.prototype._subject = function (tokens)
{
    return this._expression(tokens);
};

N3Parser.prototype._expression = function (tokens)
{
    var pathitem = this._pathitem(tokens); // x
    pathitem = _.isString(pathitem) ? { '@id': pathitem} : pathitem;
    // TODO: problem because there is a big difference between predicates and the rest?
    // TODO: should check out what the parser does with this
    if (tokens[0] === '!')
    {
        // x!p means [ is p of x ]
        tokens.shift(); // '!'
        var p = this._expression(tokens);
        return this._combinePredicateObjects({'@reverse': p}, [pathitem]);
    }
    else if (tokens[0] === '^')
    {
        // x^p means [ p x ]
        tokens.shift(); // '^'
        var p = this._expression(tokens);
        return this._combinePredicateObjects(p, [pathitem]);
    }
    return pathitem;
};

N3Parser.prototype._pathitem = function (tokens)
{
    if (tokens[0] === '{')
    {
        tokens.shift(); // {
        var result = this._formulacontent(tokens);
        tokens.shift(); // }
        return result;
    }
    else if (tokens[0] === '[')
    {
        // TODO: also do shifting here for the other parts
        tokens.shift(); // [
        var result = this._propertylist(tokens);
        tokens.shift(); // ]
        return result;
    }
    else if (tokens[0] === '(')
    {
        tokens.shift(); // (
        var result = this._pathlist(tokens);
        tokens.shift(); // )
        return result;
    }
    else
        return tokens.shift();
};

N3Parser.prototype._pathlist = function (tokens)
{
    var list = [];
    while (tokens[0] !== ')')
        list.push(this._expression(tokens));
    return {'@list': list};
};

// TODO: how do you do named graphs in N3?
N3Parser.prototype._formulacontent = function (tokens)
{
    var content = {};
    var start = true;
    while (tokens[0] !== '}')
    {
        if (!start)
            tokens.shift(); // '.'
        // difference with statements_optional: this one doesn't end with a dot
        // TODO: same problem as statementsOptional here
        var statement = this._statement(tokens);
        if (content['@graph'] && statement['@graph'])
            statement['@graph'] = content['@graph'].concat(statement['@graph']);
        _.extend(content, statement);
        start = false;
    }
    return content;
};

N3Parser.prototype._propertylist = function (tokens)
{
    // TODO: handle special cases such as formulas as predicate
    // TODO: use @type for type predicates?
    var predicate = this._predicate(tokens);

    var objects = [this._object(tokens)];
    while (tokens[0] === ',')
    {
        tokens.shift();
        objects.push(this._object(tokens));
    }
    var jsonld = this._combinePredicateObjects(predicate, objects);
    if (tokens[0] === ';')
    {
        tokens.shift();
        _.extend(jsonld, this._propertylist(tokens));
    }
    return jsonld;
};

N3Parser.prototype._combinePredicateObjects = function (predicate, objects)
{
    // simple URIs get converted to { @id: URI}, this needs to be changed for predicates
    // TODO: sort of ugly, maybe move the @id part to somewhere later? (might then give problems with subjects though
    var keys = Object.keys(predicate);
    if (keys.length === 1 && keys[0] === '@id')
        predicate = predicate['@id'];

    var jsonld = {};
    if (predicate['@reverse'])
    {
        jsonld['@reverse'] = {};
        jsonld['@reverse'][predicate['@reverse']] = objects;
    }
    else if (!_.isString(predicate))
    {
        // TODO: generate unique blank node id
        var blank = 'TODO1';
        // TODO: can we have a reverse problem here?
        // TODO: this tells the final parser to move this part up a level?
        jsonld['..'] = [_.extend({'@id': blank}, predicate)];
        jsonld[blank] = objects;
    }
    else
        jsonld[predicate] = objects;
    return jsonld;
};

// TODO: what to do with predicates with empty prefix?
N3Parser.prototype._predicate = function (tokens)
{
    if (tokens[0] === '@has')
    {
        tokens[0].shift(); // @has
        return this._expression(tokens);
    }
    else if (tokens[0] === '@is')
    {
        tokens[0].shift(); // @is
        var pred = this._expression(tokens);
        tokens[0].shift(); // @of
        return {'@reverse': pred};
    }
    else if (tokens === '@a')
    {
        tokens[0].shift(); // @a
        return 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
    }
    else if (tokens === '=')
    {
        tokens[0].shift(); // =
        return 'http://www.w3.org/2002/07/owl#equivalentTo';
    }
    else if (tokens === '=>')
    {
        tokens[0].shift(); // =>
        return 'http://www.w3.org/2000/10/swap/log#implies';
    }
    else if (tokens === '<=')
    {
        tokens[0].shift(); // <=
        return {'@reverse': 'http://www.w3.org/2000/10/swap/log#implies'};
    }
    else
        return this._expression(tokens);
};

N3Parser.prototype._object = function (tokens)
{
    return this._expression(tokens);
};

var parser = new N3Parser();
// parser.parse(':Plato :says { :Socrates :is :mortal }.');
parser.parse('[:A :b] :is :Socrates.');