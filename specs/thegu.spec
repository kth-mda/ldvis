{
  "title": "rels",
  "spec": "server\n    http://dbpedia.org/sparql\nquery\n    select ?s ?p ?o\n    where {\n      ?s ?p ?o.\n    }\n    limit 5\nmapto\n    node('parent').label('').layout('xy');\n    node(?s).parent('parent').label(?s.split('#')[1]).tooltip('qweqwe'); \n    node(?o).parent('parent').label(?o.split('#')[1]);\n    line(?s, ?p, ?o).label('type').tooltip('a line!');\nend\n"
}