server
    http://dbpedia.org/sparql
query
    select ?s ?p ?o
    where {
      ?s ?p ?o.
    }
    limit 5
mapto
    node(?s);
end
