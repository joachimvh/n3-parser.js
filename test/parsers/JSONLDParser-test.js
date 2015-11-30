
var assert = require('assert');
var JSONLDParser = require('../../JSONLDParser');
var N3Parser = require('../../N3Parser');
var _ = require('lodash');

// note that some of these tests are too strict (since there are always multiple ways to describe content)

describe('JSONLDParser', function ()
{
    var parser = new JSONLDParser();
    var N3Parser = new N3Parser();

    describe('URIs', function ()
    {
        it('should be supported in all positions', function ()
        {
            
        });
    });
});