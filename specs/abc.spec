{
  "title": "First five wikipedia subjects",
  "spec": "server\n    http://dbpedia.org/sparql\nquery\n    select ?s ?p ?o\n    where {\n      ?s ?p ?o.\n    }\n    limit 1\nmapto\n    node(?s); \nend\n"
}