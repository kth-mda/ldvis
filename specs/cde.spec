{
  "title": "Domain specification diagram",
  "spec": "  server\n    http://localhost:8180/openrdf-sesame/repositories/bugzilla\n  query\n    # list all oslc:PrefixDefinition\n    PREFIX oslc: <http://open-services.net/ns/core#>\n    select distinct ?prefix ?prefixBase\n    where {\n      ?pn a oslc:PrefixDefinition.\n      ?pn oslc:prefix ?prefix.\n      ?pn oslc:prefixBase ?prefixBase.\n    }\n  mapto\n    prefixes.add(?prefix, ?prefixBase);\n  end\n\n  server\n    http://localhost:8180/openrdf-sesame/repositories/bugzilla\n  query\n    # where ?range is ?prefix:?rangeName ?prefixBase\n    PREFIX oslc: <http://open-services.net/ns/core#>\n    select distinct ?range ?prefix ?rangeName\n    where {\n      ?sp a oslc:ServiceProvider.\n      ?sp oslc:service/(oslc:queryCapability|oslc:creationFactory) ?cap.\n      ?cap oslc:resourceShape/oslc:property/oslc:range ?range.\n\n      ?pn a oslc:PrefixDefinition.\n      ?pn oslc:prefix ?prefix.\n      ?pn oslc:prefixBase ?prefixBase.\n      filter( regex(str(?range), str(?prefixBase))).\n      bind(substr(str(?range), strlen(str(?prefixBase)) + 1) as ?rangeName).\n    }\n    order by ?rangeName\n  mapto\n    node('DomainSpecification').color('none').borderColor('none').label('').layout('hbox');\n    node(?prefix).parent('DomainSpecification').color('lightgray');\n    node(?range).label(?rangeName).parent(?prefix).color('#F3F393').cornerRadius(5);\n  end\n\n server\n    http://localhost:8180/openrdf-sesame/repositories/bugzilla\n  query\n    # where ?range is ?prefix:?rangeName\n    PREFIX oslc: <http://open-services.net/ns/core#>\n    select distinct ?rt ?prefix ?rtName ?prefixBase\n    where {\n      ?sp a oslc:ServiceProvider.\n      ?sp   oslc:service/(oslc:queryCapability|oslc:creationFactory)\n          /oslc:resourceType ?rt.\n\n      ?pn a oslc:PrefixDefinition.\n      ?pn oslc:prefix ?prefix.\n      ?pn oslc:prefixBase ?prefixBase.\n      filter( regex(str(?rt), str(?prefixBase))).\n      bind(substr(str(?rt), strlen(str(?prefixBase)) + 1) as ?rtName).\n    }\n  mapto\n    node('DomainSpecification').label('');\n    node(?prefix).parent('DomainSpecification').color('lightgray');\n    node(?rt).label(?rtName).parent(?prefix).color('white');\n  end\n\n  server\n    http://localhost:8180/openrdf-sesame/repositories/bugzilla\n  query\n    PREFIX oslc: <http://open-services.net/ns/core#>\n    select distinct ?rt ?prefix ?pr ?prName ?prDef ?prRange ?prValueType\n    where {\n      ?sp a oslc:ServiceProvider.\n      ?sp   oslc:service/(oslc:queryCapability|oslc:creationFactory) ?cap.\n      ?cap oslc:resourceType ?rt.\n\n      ?cap oslc:resourceShape/oslc:property ?pr.\n      ?pr oslc:name ?prName.\n      ?pr oslc:propertyDefinition ?prDef.\n      optional {?pr oslc:range ?prRange}.\n      ?pr oslc:valueType ?prValueType.\n    }\n    order by ?prName\n  mapto\n    if (?prRange) {\n       line(?rt, prefixes.shrink(?prDef), ?prRange);\n    } else {\n      node(?prDef).label(prefixes.shrink(?prDef).replace(prefixes.getPrefix(?rt) + ':', '') + ': ' + prefixes.shrink(?prValueType))\n        .borderColor('none').color('none').parent(?rt);\n    }\n  end\n"
}