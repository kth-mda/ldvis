{
  "title": "parent ex",
  "spec": "server\n    http://dbpedia.org/sparql\nquery\n    select ?s ?p ?o \n    where {\n      ?s ?p ?o.\n    }\n    limit 5\nmapto\n    node('a parent').color('lightgray').cornerRadius(5);\n    node(?s).parent('a parent');\nend\n"
}