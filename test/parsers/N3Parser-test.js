
var assert = require('assert');
var N3Parser = require('../../N3Parser');
var _ = require('lodash');

// note that some of these tests are too strict (since there are always multiple ways to describe content)

describe('N3Parser', function ()
{
    var parser = new N3Parser();
    describe('URIs', function ()
    {
        it('should be extended for base prefixes', function ()
        {
            var jsonld = parser.parse('PREFIX : <http://example.org/>\n:a :b :c.');
            var expected = { '@id': 'http://example.org/a', 'http://example.org/b' : { '@id': 'http://example.org/c' } };
            assert.deepEqual(jsonld, expected);
        });

        it('should not change when not prefixed', function ()
        {
            var jsonld = parser.parse('<:a> <#b> <.c>.');
            var expected = { '@id': ':a', '#b': { '@id': '.c'} };
            assert.deepEqual(jsonld, expected);
        });

        it('should be extended when there could be prefix confusion', function ()
        {
            var jsonld = parser.parse('PREFIX ex: <http://example.org/>\n<ex:a> ex:b "c".');
            var expected = { '@id': 'ex:a', 'http://example.org/b': 'c' };
            assert.deepEqual(jsonld, expected);
        });

        it('should not be extended when prefixes can be used', function ()
        {
            var jsonld = parser.parse('PREFIX ex: <http://example.org/>\nex:a ex:b ex:c.');
            var expected = { '@context': { ex: 'http://example.org/'}, '@id': 'ex:a', 'ex:b': { '@id': 'ex:c'} };
            assert.deepEqual(jsonld, expected);
        });

        it('should not change blank node URIs', function ()
        {
            var jsonld = parser.parse('_:a _:b _:c.');
            var expected = { '@id': '_:a', '_:b': { '@id': '_:c'} };
            assert.deepEqual(jsonld, expected);
        });

        it('should handle empty blank nodes', function ()
        {
            var jsonld = parser.parse('[] [] [].');
            var keys = Object.keys(jsonld);
            assert.strictEqual(keys.length, 1);
            assert.strictEqual(keys[0].substring(0, 2), '_:');
            var expected = {};
            expected[keys[0]] = {};
            assert.deepEqual(jsonld, expected);
        });

        it('should handle recursive blank nodes', function ()
        {
            var jsonld = parser.parse('[ <a> "b" ] [ <c> "d" ] [ <e> "f" ].');
            var graph = jsonld['@graph'];
            // predicate blank node block
            assert(graph[0]['@id']);
            assert.strictEqual(graph[0]['@id'].substring(0, 2), '_:');
            assert.deepEqual(graph[0], { '@id': graph[0]['@id'], c: 'd' });

            var expected = {'@graph': [ { '@id': graph[0]['@id'], c: 'd' }, { a: 'b'} ]};
            expected['@graph'][1][graph[0]['@id']] = {e: 'f'};
            assert.deepEqual(jsonld, expected);
        });
    });

    describe('literals', function ()
    {
        it('should be supported in all positions', function ()
        {
            var jsonld = parser.parse('true false true.');
            // TODO: or should it be { '@value': true } for the subject?
            var expected = { '@id': true, false: true };
            assert.deepEqual(jsonld, expected);

            jsonld = parser.parse('1 0 1.');
            // TODO: can't have numbers as predicates..., also, same question as above
            expected = { '0': 1, '@id': 1 };
            assert.deepEqual(jsonld, expected);

            jsonld = parser.parse('"true" "false" "true".');
            // TODO: this predicate obviously can't be correct if the previous ones are correct
            expected = { '@id': { '@value': 'true' }, false: 'true' };
            assert.deepEqual(jsonld, expected);
        });

        it('should support both type and language for strings', function ()
        {
            var jsonld = parser.parse('<a> <b> "c"^^xsd:integer.');
            var expected = { '@id': 'a', b: { '@value': 'c', '@type': 'xsd:integer' } };
            assert.deepEqual(jsonld, expected);

            jsonld = parser.parse('<a> <b> "c"@en-gb.');
            expected = { '@id': 'a', b: { '@value': 'c', '@language': 'en-gb' } };
            assert.deepEqual(jsonld, expected);
        });

        it('should support all number formats', function ()
        {
            var jsonld = parser.parse('<a> <b> 5.');
            var expected = { "@id":"a", "b": 5 };
            assert.deepEqual(jsonld, expected);

            jsonld = parser.parse('<a> <b> 5.5.');
            expected = { "@id":"a", "b": 5.5 };
            assert.deepEqual(jsonld, expected);

            jsonld = parser.parse('<a> <b> 5E5.');
            expected = { "@id":"a", "b": 5E5 };
            assert.deepEqual(jsonld, expected);

            jsonld = parser.parse('x:a x:b 5.E3.a:a x:b x:c.');
            expected = { "@graph": [ { "@id": "x:a", "x:b": 5 },
                                     {  "@id": "E3.a:a", "x:b": { "@id": "x:c" } }]} ;
            assert.deepEqual(jsonld, expected);
        });
    });

    describe('lists', function ()
    {
        it('should be supported in all positions', function ()
        {
            var jsonld = parser.parse('() () ().');
            // need to reconstruct jsonld with same blank node
            var blank = jsonld['@graph'][0]['@id'];
            var expected = { "@graph": [ { "@id": blank,"@list": [] }, { "@list": [] } ] };
            expected['@graph'][1][blank] = { "@list": [] };
            assert.deepEqual(jsonld, expected);
        });

        it('should handle all sorts of content', function ()
        {
            var jsonld = parser.parse('<a> <b> ( "c" 0 0.1 <c> c:c () {} true ).');
            var expected = {"@id":"a","b":{"@list":["c",0,0.1,{"@id":"c"},{"@id":"c:c"},{"@list":[]},{"@graph":[]},true]}};
            assert.deepEqual(jsonld, expected);
        });
    });

    describe('formulas', function ()
    {
        it('should be supported in all positions', function ()
        {
            var jsonld = parser.parse('{} {} {}.');
            // need to reconstruct jsonld with same blank node
            var blank = jsonld['@graph'][0]['@id'];
            var expected = { "@graph": [ { "@id": blank, "@graph": [] }, { "@graph": [] } ] };
            expected['@graph'][1][blank] = { "@graph": [] };
            assert.deepEqual(jsonld, expected);
        });

        it('should be supported when nested', function ()
        {
            var jsonld = parser.parse('<a> <b> { <c> <d> { <e> <f> "g" }}.');
            var expected = {"@id":"a","b":{"@graph":[{"@id":"c","d":{"@graph":[{"@id":"e","f":"g"}]}}]}};
            assert.deepEqual(jsonld, expected);
        });
    });

    // TODO: simplification/complex paths/etc.
});