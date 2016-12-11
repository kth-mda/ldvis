# The mapping specification in detail

## General form

server
   <sparql server url>
query
  <sparql query>
mapto
  <mapto script>
end

or, if multiple specifications is needed:

group
  <mapping specification 1>
  <mapping specification 2>
  ...
end

### Sparql server url

This URL must refer to a server supporting the SPARQL 1.1 Graph Store HTTP Protocol (see https://www.w3.org/TR/sparql11-http-rdf-update/). That is the URL should accept a query of the form ?query=<URL encoded sparql query>, and an 'Accept: text/tab-separated-values' http header. It should then execure the sparql query and respond with a result in text/tab-separated-values format.

### Sparql query

This must be a sparql select query, with a list of variables in the select part, or a * in otder to produce all used variable values in the result.

### mapto script

This is JavaScript code, that will be executed for each of the result rows of the sparql query.
Any of the sparql select variables can be used as values in the code.

## The mapto script semantics

The basic graphical objects are nodes and lines.
The call node(id) creates and returns a rectangular node that has the specified id. The id is displayed as the lablel inside the node rectangle. If there is already a node with the provided id, then nothing is created and the existing node is returned.

The node object has methods that configure the node in various aspects.

```
Node(id).label('a node');
```

creates a node with the label 'a node'.
