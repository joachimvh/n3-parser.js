# N3 to JSON-LD converter

Parse N3 (not just turtle) and converts it to JSON-LD.
That JSON-LD can also be converted back to N3,
though not all JSON-LD features are supported in that conversion
(but everything that gets output by the parser can be converted back).

## Usage

```javascript
const N3Parser = require('n3parser').N3Parser;

let parser = new N3Parser();
let jsonld = parser.toJSONLD(`PREFIX dc: <http://purl.org/dc/elements/1.1/>
    <http://en.wikipedia.org/wiki/Tony_Benn>
    dc:title "Tony Benn";
    dc:publisher "Wikipedia".
`);
console.log(jsonld);

// Output:
// { '@context': { dc: 'http://purl.org/dc/elements/1.1/' },
//  '@id': 'http://en.wikipedia.org/wiki/Tony_Benn',
//  'dc:title': 'Tony Benn',
//  'dc:publisher': 'Wikipedia' }

const JSONLDParser = require('n3parser').JSONLDParser;
let jsonldParser = new JSONLDParser();
let n3 = jsonldParser.toN3(jsonld);
console.log(n3);

// Output:
// PREFIX dc: <http://purl.org/dc/elements/1.1/>
// <http://en.wikipedia.org/wiki/Tony_Benn> dc:title "Tony Benn" ;
// dc:publisher "Wikipedia" .
```

## N3 features
N3 has several features that are not covered by JSON-LD.
In those cases we made some adaptations to the JSON-LD syntax.
This also means that the output is not valid JSON-LD (but can still be converted back to N3 by our parser).

### Formulas
For N3 formulas we use JSON-LD graphs without an `@id`.
These do have semantic differences though, which should be taken into account.
(JSON-LD treats these as graphs with a blank node as identifier).

### =>
`=>` gets translated to its corresponding URI `log:implies`.

### Literal/formula subjects
JSON-LD only supports URIs in the subject position.
For literals we solve this by allowing JSON-LD `@value` objects to also have predicates:
```turtle
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
"Apple" rdfs:label "red" .
```
```json
{ "@context": { "rdfs": "http://www.w3.org/2000/01/rdf-schema#" },
  "@value": "Apple",
  "rdfs:label": "red" }
```

Similarly, for formulas we allow JSON-LD graphs to have predicates:
```turtle
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
{} rdfs:label "red" .
```
```json
{ "@context": { "rdfs": "http://www.w3.org/2000/01/rdf-schema#" },
  "@graph": [],
  "rdfs:label": "red" }
```

### Variables
JSON-LD has no variables. We use the same syntax as URIs for those, e.g.:
```json
{ "@id": "?b" }
```

### Literal/formula predicates
JSON-LD only supports URIs in the predicate position, while N3 allows all terms there.
The solution there is a bit more convoluted.
We replace the offending predicate by a newly generated blank node,
and also create a new object containing both the blank node and its corresponding value (or graph).

```turtle
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
?a "predicate" ?b .
```

```json
{
  "@context": {
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#"
  },
  "@graph": [
    {
      "@value": "predicate",
      "@id": "_:b_01a89c31-59be-4aef-a7f5-708f33917877"
    },
    {
      "@id": "?a",
      "_:b_01a89c31-59be-4aef-a7f5-708f33917877": {
        "@id": "?b"
      }
    }
  ]
}
```

### Base
JSON-LD has no good way to represent an empty prefix (e.g. `:a`).
We replace all such prefixes with `#base`,
which allows us to retain the empty prefix when converting back to N3.

```turtle
PREFIX : <http://example.com/>
:s :p ?o .
```

```json
{
  "@context": {
    "#base": "http://example.com/"
  },
  "@id": "#base:s",
  "#base:p": {
    "@id": "?o"
  }
}
```