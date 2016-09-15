
var assert = require('assert');
var N3Lexer = require('../../N3Lexer');
var _ = require('lodash');

// note that some of these tests are too strict (since there are always multiple ways to describe content)

describe('N3Lexer', function ()
{
    var lexer = new N3Lexer();
    describe('handles explicit quantification', function ()
    {
        var expected = {"type":"Document","val":[{"type":"Universal","val":[{"type":"PrefixedIRI","val":":a"},{"type":"PrefixedIRI","val":":b"}]},{"type":"TripleData","val":[{"type":"PrefixedIRI","val":":a"},[{"type":"PredicateObject","val":[{"type":"PrefixedIRI","val":":b"},[{"type":"PrefixedIRI","val":":c"}]]}]]},{"type":"Existential","val":[{"type":"PrefixedIRI","val":":d"}]}]};
        assert.deepEqual(lexer.parse('@forAll :a, :b. :a :b :c. @forSome :d.'), expected);
    });
});