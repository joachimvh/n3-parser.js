
var JSONLDParser = require('../../JSONLDParser');
var N3Parser = require('../../N3Parser');
var fs = require('fs');

describe('Timing', function ()
{
    var jParser = new JSONLDParser();
    var nParser = new N3Parser();
    var jsonld;
    var n3;
    jsonld = JSON.parse(fs.readFileSync('test/parsers/test1.jsonld'));
    it ('JSONLD parser should be fast', function ()
    {
        for (var i = 0; i < 10; ++i)
            n3 = jParser.toN3(jsonld);
    });
    it ('N3 parser should be fast', function ()
    {
        for (var i = 0; i < 10; ++i)
            jsonld = nParser.toJSONLD(n3);
    });

    n3 = fs.readFileSync('test/parsers/test2.n3');
    it ('N3 parser should be fast', function ()
    {
        for (var i = 0; i < 10; ++i)
            jsonld = nParser.toJSONLD(n3);
    });
    it ('JSONLD parser should be fast', function ()
    {
        for (var i = 0; i < 10; ++i)
            n3 = jParser.toN3(jsonld);
    });
});