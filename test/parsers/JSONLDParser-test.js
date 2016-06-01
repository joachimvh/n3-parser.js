
var assert = require('assert');
var JSONLDParser = require('../../JSONLDParser');
var N3Parser = require('../../N3Parser');
var _ = require('lodash');

// note that some of these tests are too strict (since there are always multiple ways to describe content)

describe('JSONLDParser', function ()
{
    var parser = new JSONLDParser();

    describe('URIs', function ()
    {
        it('should be supported in all positions', function ()
        {
            var jsonld = { 'a': { '@id': 'b'}, '@id': 'c' };
            var n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, '<c> <a> <b> .');

            jsonld = { '@context': { 'ex': 'http://example.com/' }, 'ex:a': { '@id': 'ex:b'}, '@id': 'ex:c' };
            n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, 'PREFIX ex: <http://example.com/>\nex:c ex:a ex:b .');

            jsonld = { 'http://example.com/a': { '@id': 'http://example.com/b'}, '@id': 'http://example.com/c' };
            n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, '<http://example.com/c> <http://example.com/a> <http://example.com/b> .');

            jsonld = { '@context': {}, '@id': N3Parser.BASE + ':c' };
            jsonld['@context'][N3Parser.BASE] = 'http://example.com/';
            jsonld[N3Parser.BASE + ':a'] = { '@id': N3Parser.BASE + ':b'};
            n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, 'PREFIX : <http://example.com/>\n:c :a :b .');
        });
    });

    describe('literals', function ()
    {
        it('should be supported in all positions', function ()
        {
            // TODO: this would be a lot easier if I had a set way to actually use subject/predicate literals, so just testing some subcases for now
            // TODO: no way to differentiate predicates for now
            var jsonld = { '@graph': [{ '@id': '_:b1', '@value': false}, { '_:b1': true, '@value': true }] };
            var n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, 'true false true .');

            jsonld = { '@graph': [{ '@id': '_:b1', '@value': 6}, { '_:b1': 7, '@value': 5 }] };
            n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, '5 6 7 .');

            jsonld = { '@graph': [{ '@id': '_:b1', '@value': 'b'}, { '_:b1': 'c', '@value': 'a' }] };
            n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, '"a" "b" "c" .');

            jsonld = { '@graph': [{ '@id': '_:b1', '@value': 'b', '@language': 'en-gb'}, { '_:b1': { '@value' : 'c', '@language': 'en-gc' }, '@value': 'a', '@language': 'en-ga'}]};
            n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, '"a"@en-ga "b"@en-gb "c"@en-gc .');

            jsonld = { '@context': { 'xsd': 'http://www.w3.org/2001/XMLSchema#' },
                       '@graph': [{ '@id': '_:b1', '@value': 'b', '@type': 'xsd:string'}, { '_:b1': { '@value' : 'c', '@type': 'xsd:string' }, '@value': 'a', '@type': 'xsd:string'}]};
            n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, 'PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\n"a"^^xsd:string "b"^^xsd:string "c"^^xsd:string .');

            jsonld = { '@graph': [{ '@id': '_:b1', '@value': 'b', '@type': 'http://www.w3.org/2001/XMLSchema#string'},
                                  { '_:b1': { '@value' : 'c', '@type': 'http://www.w3.org/2001/XMLSchema#string' },
                                    '@value': 'a',
                                    '@type': 'http://www.w3.org/2001/XMLSchema#string'}]};
            n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, '"a"^^<http://www.w3.org/2001/XMLSchema#string> "b"^^<http://www.w3.org/2001/XMLSchema#string> "c"^^<http://www.w3.org/2001/XMLSchema#string> .');
        });
    });

    describe('lists', function ()
    {
        it('should be supported in all positions', function ()
        {
            var jsonld = { '@graph': [ { '@list': [], '_:b': { '@list': [] }}, { '@id': '_:b', '@list': [] } ]};
            var n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, '() () () .');
        });

        it('should support all kinds of content', function ()
        {
            var jsonld = { '@id': 'a', b: { '@list': [ true, 1, 'c', { '@id': 'c' } ] }};
            var n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, '<a> <b> ( true 1 "c" <c> ) .');
        });
    });

    describe('formulas', function ()
    {
        it('should be supported in all positions', function ()
        {
            var jsonld = { '@graph': [ { '@graph': [], '_:b': { '@graph': [] }}, { '@id': '_:b', '@graph': [] } ]};
            var n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, '{} {} {} .');
        });
    });

    describe('subjects', function ()
    {
        it("don't need no predicates", function ()
        {
            var jsonld = { '@graph': [] };
            var n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, '{} .');

            // TODO: what does '[] .' look like? and {[]}?
            jsonld = {};
            n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, '[] .');

            jsonld = { '@value': 5 };
            n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, '5 .');

            jsonld = { '@id': 'a' };
            n3 = parser.toN3(jsonld);
            assert.deepEqual(n3, '<a> .');
        })
    })
});