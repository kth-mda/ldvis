server
  http://localhost:8080/openrdf-sesame/repositories/bugzilla
query
  # list all oslc:PrefixDefinition
  PREFIX oslc: <http://open-services.net/ns/core#>
  select distinct ?prefix ?prefixBase
  where {
    ?pn a oslc:PrefixDefinition.
    ?pn oslc:prefix ?prefix.
    ?pn oslc:prefixBase ?prefixBase.
  }
mapto
  prefixes.add(?prefix, ?prefixBase);;
end
