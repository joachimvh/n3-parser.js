
var assert = require('assert');
var JSONLDParser = require('../../JSONLDParser');
var N3Parser = require('../../N3Parser');
var _ = require('lodash');

// note that some of these tests are too strict (since there are always multiple ways to describe content)

describe('JSONLDParser', function ()
{
    var parser = new JSONLDParser();
    var parserN3 = new N3Parser();

    describe('URIs', function ()
    {
        it('should be supported in all positions', function ()
        {
            var jsonld = { 'a': { '@id': 'b'}, '@id': 'c' };
            var n3 = parser.parse(jsonld);
            assert.deepEqual(n3, '<c> <a> <b> .');

            jsonld = { '@context': { 'ex': 'http://example.com/' }, 'ex:a': { '@id': 'ex:b'}, '@id': 'ex:c' };
            n3 = parser.parse(jsonld);
            assert.deepEqual(n3, 'PREFIX ex: <http://example.com/>\nex:c ex:a ex:b .');

            jsonld = { 'http://example.com/a': { '@id': 'http://example.com/b'}, '@id': 'http://example.com/c' };
            n3 = parser.parse(jsonld);
            assert.deepEqual(n3, '<http://example.com/c> <http://example.com/a> <http://example.com/b> .');

            jsonld = { 'http://example.com/a': { '@id': 'http://example.com/b'}, '@id': 'http://example.com/c' };
            n3 = parser.parse(jsonld, 'http://example.com/');
            assert.deepEqual(n3, 'PREFIX : <http://example.com/>\n:c :a :b .');
        });
    });

    describe('literals', function ()
    {
        it('should be supported in all positions', function ()
        {
            // TODO: this would be a lot easier if I had a set way to actually use subject/predicate literals, so just testing some subcases for now
            // TODO: no way to differentiate predicates for now
            var jsonld = { true: true, '@id': true };
            var n3 = parser.parse(jsonld);
            assert.deepEqual(n3, 'true <true> true .');

            jsonld = { '5': 6, '@id': 7};
            n3 = parser.parse(jsonld);
            assert.deepEqual(n3, '7 <5> 6 .');

            jsonld = { 'a': 'b', '@id': { '@value': 'c' }};
            n3 = parser.parse(jsonld);
            assert.deepEqual(n3, '"c" <a> "b" .');

            jsonld = { 'a': { '@value' : 'b', '@language': 'en-gb' }, '@id': { '@value': 'c', '@language': 'en-gb' }};
            n3 = parser.parse(jsonld);
            assert.deepEqual(n3, '"c"@en-gb <a> "b"@en-gb .');

            jsonld = { '@context': { 'xsd': 'http://www.w3.org/2001/XMLSchema#' }, 'a': { '@value' : 'b', '@type': 'xsd:string' }, '@id': { '@value': 'c', '@type': 'xsd:string' }};
            n3 = parser.parse(jsonld);
            assert.deepEqual(n3, 'PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\n"c"^^xsd:string <a> "b"^^xsd:string .');

            jsonld = { 'a': { '@value' : 'b', '@type': 'http://www.w3.org/2001/XMLSchema#string' }, '@id': { '@value': 'c', '@type': 'http://www.w3.org/2001/XMLSchema#string' }};
            n3 = parser.parse(jsonld);
            assert.deepEqual(n3, '"c"^^<http://www.w3.org/2001/XMLSchema#string> <a> "b"^^<http://www.w3.org/2001/XMLSchema#string> .');
        });
    });

    describe('lists', function ()
    {
        it('should be supported in all positions', function ()
        {
            var jsonld = { '@graph': [ { '@list': [], '_:b': { '@list': [] }}, { '@id': '_:b', '@list': [] } ]};
            var n3 = parser.parse(jsonld);
            // TODO: this isn't parsed correctly yet, might be hard to do
            //assert.deepEqual(n3, '() () () .');
        });
    });
});