export default function PrefixHandler() {
  let prefixMap = {};
  return {
    // adds prefix with iri to the prefixes - peel off <...>, if present
    add(prefix, iri) {
      let uri = iri.toString();
      if (uri.length > 2 && uri[0] === '<') {
        uri = uri.substring(1, uri.length - 1);
      }
      prefixMap[prefix] = uri;
    },
    // if uri has a prefix, return prefix:suffix
    // returns uri shrinked by using prefix form for defined prefixes
    // if uri has the form <xxxyyy> then the prefixed form is prefix:yyy
    shrink(uri) {
      uri = peelUri(uri);
      let longestMatch = null;
      let longestMatchKey = null;
      for (let key in prefixMap) {
        let value = prefixMap[key];
        if (value === uri.substring(0, value.length)) {
          if (!longestMatch || longestMatch.length < value.length) {
            longestMatch = value;
            longestMatchKey = key;
          }
        }
      }
      if (longestMatch) {
        return longestMatchKey + ':' + uri.substring(longestMatch.length);
      } else {
        return uri;
      }
    },
    // if prefixUri has a prefix defined in this map, return the original uri
    expand(prefixUri) {
      let colonPos = prefixUri.indexOf(':');
      if (colonPos !== -1) {
        let prefix = prefixUri.substring(0, colonPos);
        let prefixValue = prefixMap[prefix];
        if (prefixValue) {
          return prefixValue + prefixUri.substring(colonPos + 1);
        }
      }
      return prefixUri;
    },
    // if iri has a known prefix, then return the prefix, else return the defaultValue parameter
    getPrefix(uri, defaultValue) {
      uri = peelUri(uri);
      if (uri.indexOf('http:') === 0) {
        let shrinked = this.shrink(uri.toString());
        if (shrinked !== uri) {
          return shrinked.substring(0, shrinked.indexOf(':'));
        } else {
          return defaultValue;
        }
      } else {
        let ci = uri.indexOf(':');
        if (ci !== -1) {
          return uri.substring(0, ci);
        } else {
          return uri;
        }
      }
    },
    // if uri has a known prefix, then return uri with the prefix removed
    removePrefix(iri) {
      let uri = peelUri(iri);
      if (uri.indexOf('http:') === 0) {
        let shrinked = this.shrink(uri.toString());
        if (shrinked !== uri) {
          return shrinked.substring(shrinked.indexOf(':') + 1);
        } else {
          return uri;
        }
      } else {
        let ci = uri.indexOf(':');
        if (ci !== -1) {
          return uri.substring(ci + 1);
        } else {
          return uri;
        }
      }
    }
  }
}

// removes < ... > from both ends of uri, if it starts with <
function peelUri(uri) {
  return (uri.length > 2 && uri[0] === '<') ? uri.substring(1, uri.length - 1) : uri;
}
