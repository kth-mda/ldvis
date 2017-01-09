{
  "title": "Five first wikipedia subjects",
  "spec": "server\n    http://dbpedia.org/sparql\nquery\n    select ?s ?p ?o\n    where {\n      ?s ?p ?o.\n    }\n    limit 5\nmapto\n    node(?s).click('http://localhost:3015/diagrams/cde', 'qwe'); \nend\n"
}