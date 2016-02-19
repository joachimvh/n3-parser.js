/**
 * Created by joachimvh on 7/12/2015.
 */

var _ = require('lodash');
var uuid = require('node-uuid');

function N3Lexer () {}

// TODO: check up what reserved escapes are supposed to do http://www.w3.org/TR/turtle/#sec-escapes
// TODO: 32 bit unicode (use something like http://apps.timwhitlock.info/js/regex# ? or use xregexp with https://gist.github.com/slevithan/2630353 )
N3Lexer._PN_CHARS_BASE = /[A-Z_a-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c-\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]/;
N3Lexer._PN_CHARS_U = new RegExp('(?:' + N3Lexer._PN_CHARS_BASE.source + '|_)');
N3Lexer._PN_CHARS = new RegExp('(?:' + N3Lexer._PN_CHARS_U.source + '|' + /[-0-9\u00b7\u0300-\u036f\u203f-\u2040]/.source + ')');
N3Lexer._PLX = /(?:%[0-9a-fA-F]{2})|(?:\\[-_~.!$&'()*+,;=/?#@%])/;
// using _U instead of _BASE to also match blank nodes
N3Lexer._prefix = new RegExp(
    N3Lexer._PN_CHARS_U.source + '(?:(?:' + N3Lexer._PN_CHARS.source + '|\\.)*' + N3Lexer._PN_CHARS.source + ')?'
);
N3Lexer._suffix = new RegExp(
    '(?:' + N3Lexer._PN_CHARS_U.source + '|[:0-9]|' + N3Lexer._PLX.source + ')' +
    '(?:(?:' + N3Lexer._PN_CHARS.source + '|[.:]|' + N3Lexer._PLX.source + ')*(?:' + N3Lexer._PN_CHARS.source + '|:|' + N3Lexer._PLX.source + '))?'
);
N3Lexer._prefixIRI = new RegExp(
    '(?:' + N3Lexer._prefix.source + ')?:' + '(?:' + N3Lexer._suffix.source  + ')?'
);
N3Lexer._variableRegex = new RegExp(
    '\\?' + N3Lexer._prefix.source
);
N3Lexer._iriRegex = /<[^>]*>/;
N3Lexer._stringRegex = /("|')(\1\1)?(?:[^]*?[^\\])??(?:\\\\)*\2\1/;
N3Lexer._datatypeRegex = new RegExp(
    '\\^\\^(?:(?:' + N3Lexer._iriRegex.source + ')|(?:' + N3Lexer._prefixIRI.source + '))'
);
N3Lexer._langRegex = /@[a-z]+(-[a-z0-9]+)*/;
N3Lexer._literalRegex = new RegExp(
    N3Lexer._stringRegex.source +
    '((?:' + N3Lexer._datatypeRegex.source + ')|(?:' + N3Lexer._langRegex.source + '))?'
);
N3Lexer._numericalRegex = /[-+]?(?:(?:(?:(?:[0-9]+\.?[0-9]*)|(?:\.[0-9]+))[eE][-+]?[0-9]+)|(?:[0-9]*(\.[0-9]+))|(?:[0-9]+))/;

N3Lexer.prototype.parse = function (input)
{
    var state = new N3LexerState(input);
    return this._parse(state);
};

// TODO: comments and special data exceptions (e.g. \u)
N3Lexer.prototype._parse = function (state)
{
    var statements = [];
    while (!state.eof())
    {
        var first = state.firstWord(); // need this because PREFIX and BASE don't end on a dot
        statements.push(this._statement(state));
        if (first !== 'PREFIX' && first !== 'BASE') // TODO: should we check for newlines?
            state.move('.');
    }
    return { type: 'Document', val: statements };
};

N3Lexer.prototype._statement = function (state)
{
    var first = state.firstWord();
    var result;
    if (first === '@forAll') return; // TODO
    else if (first === '@forSome') return; // TODO
    else if (first === '@base' || first === 'BASE') return; // TODO
    else if (first === '@prefix' || first === 'PREFIX')
    {
        state.move(first);
        var prefix;
        if (state.firstChar() === ':')
            prefix = '';
        else
            prefix = state.extract(N3Lexer._prefix);
        state.move(':');
        var iri = state.extract(N3Lexer._iriRegex);
        result = { type: 'Prefix', val: [ prefix, iri ]};
    }
    else if (first === '@keywords') return; // TODO
    else
        result = { type: 'TripleData', val: [ this._subject(state), this._propertylist(state) ] };
    return result;
};

N3Lexer.prototype._subject = function (state)
{
    return this._expression(state);
};

N3Lexer.prototype._propertylist = function (state)
{
    // propertylist can be empty!
    var c = state.firstChar();
    if (/[.\]})]/.exec(c))
        return [];
    var propertyLists = [{ type: 'PredicateObject', val: [ this._predicate(state), this._objects(state) ] }];
    while (state.firstChar() === ';')
    {
        // you can have multiple semicolons...
        while (state.firstChar() === ';')
            state.move(';');
        // propertylist can end on a semicolon...
        if (/[.\]})]/.exec(state.firstChar()))
            break;
        propertyLists.push({ type: 'PredicateObject', val: [ this._predicate(state), this._objects(state) ] });
    }
    return propertyLists;
};

N3Lexer.prototype._predicate = function (state)
{
    var c = state.firstChar();
    var c2 = state.firstChars(2);
    var first = state.firstWord();

    var result;
    if (first === '@has') return; // TODO
    else if (first === '@is') return; // TODO
    else if (first === '@a' || first === 'a')
    {
        result = { type: 'SymbolicIRI', val: first};
        state.move(first);
    }
    else if (c === '=' && c2 == '=>' || c2 === '<=')
    {
        result = { type: 'SymbolicIRI', val: c2};
        state.move(c2);
    }
    else if (c === '=')
    {
        result = { type: 'SymbolicIRI', val: c2};
        state.move(c);
    }
    else result = this._expression(state);

    return result;
};

N3Lexer.prototype._objects = function (state)
{
    var objects = [this._expression(state)];
    while (state.firstChar() === ',')
    {
        state.move(',');
        objects.push(this._expression(state));
    }
    return objects;
};

N3Lexer.prototype._expression = function (state)
{
    var c = state.firstChar();
    var first = state.firstWord();
    var result, match;
    if (c === '{')
    {
        state.move(c);
        var statements = [];
        while (state.firstChar() !== '}')
        {
            statements.push(this._statement(state));
            if (state.firstChar() === '}') // no final '.'
                break;
            state.move('.');
        }
        state.move('}');
        result = { type: 'Formula', val: statements };
    }
    else if (c === '[')
    {
        state.move(c);
        var propertyList;
        if (state.firstChar() === ']')
            propertyList = [];
        else
            propertyList = this._propertylist(state);
        state.move(']');
        result = { type: 'BlankTripleData', val: propertyList};
    }
    else if (c === '(')
    {
        state.move(c);
        var expressions = [];
        while (state.firstChar() !== ')')
            expressions.push(this._expression(state));
        state.move(')');
        result = { type: 'List', val: expressions };
    }
    else if (c === '?')
    {
        match = state.extract(N3Lexer._variableRegex);
        result = { type: 'Variable', val: match };
    }
    else if (c === '"' || c === "'")
    {
        match = state.extract(N3Lexer._literalRegex);

        var str = N3Lexer._stringRegex.exec(match);
        var type = N3Lexer._datatypeRegex.exec(match);
        var lang = N3Lexer._langRegex.exec(match);

        str = str[0];
        type = type && this._expression(new N3LexerState(type[0].substring(2))); // ExplicitIRI or PrefixedIRI
        lang = lang && lang[0].substring(1);

        result = { type: 'RDFLiteral', val: [str, type, lang] };
    }
    else if (first === 'true' || first === 'false' || first === '@true' || first === '@false')
    {
        result = { type: 'BooleanLiteral', val: first };
        state.move(first);
    }
    else if (c >= '0' && c <= '9' || c === '-' || c === '+' || c === '.')
    {
        match = state.extract(N3Lexer._numericalRegex);
        result = { type: 'NumericLiteral', val: match };
    }
    else if (c === '<')
    {
        match = state.extract(N3Lexer._iriRegex);
        result = { type: 'ExplicitIRI', val: match };
    }
    else
    {
        match = state.extract(N3Lexer._prefixIRI);
        result = { type: 'PrefixedIRI', val: match };
    }

    c = state.firstChar();
    if (c === '!') return; // TODO
    else if (c === '^') return; // TODO

    return result;
};

function N3LexerState (input){ this.input = input; this.trimLeft(); }

N3LexerState.prototype.trimLeft = function () { this.input = this.input.replace(/^(?:\s*(?:#.*))*\s*/, ''); };
N3LexerState.prototype.firstChar = function () { return this.input[0]; };
N3LexerState.prototype.firstChars = function (count) { if (!count || count === 1) return this.input[0]; return this.input.substr(0, count); };
N3LexerState.prototype.firstWord = function () { return this.input.split(/\s+|([;.,{}[\]()!^])|(<?=>?)/, 1).filter(Boolean)[0]; };
N3LexerState.prototype.move = function (part)
{
    if (!_.startsWith(this.input, part))
        throw "Unexpected input " + part;
    this.input = this.input.substring(part.length);
    this.trimLeft();
};
N3LexerState.prototype.eof = function () { return this.input.length === 0; };
N3LexerState.prototype.extract = function (regex)
{
    var match = (new RegExp('^' + regex.source)).exec(this.input);
    if (!match)
        throw "Input didn't match the regex.";
    this.move(match[0]);
    return match[0];
};

module.exports = N3Lexer;