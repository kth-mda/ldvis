require('jquery-ui/themes/base/core.css');
require('jquery-ui/themes/base/menu.css');
// require('jquery-ui/themes/base/dialog.css');
require('jquery-ui/themes/base/theme.css');
import $ from 'jquery';
let draggable = require('jquery-ui/ui/widgets/draggable');
draggable();

import Split from 'split.js';
import RdfXmlParser from 'rdf-parser-rdfxml';
import _ from 'lodash';
import {  d3,  SvgComponent,  SimpleTextBoxComponent,  RelationComponent,  HierarchyComponent,  HBoxLayout,
  VBoxLayout,  XyLayout,  Manipulator,  MoveNodeTool,  CreateMoveRelationTool,  SelectTool,  utils, separateOverlappingRelations
} from '../../../fomod';
import {
  setTripleObject,  fetchGraph,  matchForEachTriple,  matchForEach, getOneObject,  getOneObjectString, getOneSubject,
  addTriple,  renderHtmlPropsTable,  getPropsProps,  tripleToString,  graphToString, RDF
} from './oslc-schema-utils';
import d3ctx from 'd3-context-menu';
import uuid from 'node-uuid';
import {
  loadPrefixes, getSparqlPrefixes, savePrefixes,  initPrefixDialog,  openAddPrefixDialog
} from './prefix-manager';
import debounce from 'debounce';
import {compileCode} from './compilecode';

let initialServerUrl = 'https://git.md.kth.se/fuseki/import-cpse/query';

var parser = new RdfXmlParser();

let contextMenu = d3ctx(d3);

// loadPrefixes(parser.rdf.prefixes).then(function() {
// });

// handle page layout
function adjustUISize() {
  $('#ui').height($(window).innerHeight());
}
$(window).resize(adjustUISize);
adjustUISize();

Split(['#leftcol', '#rightcol'], {
  sizes: [50, 50],
  minSize: 200,
  gutterSize: 5,
  snapOffset: 1
});

// init mapping spec field
let mappingspec = d3.select('#mappingspec');
d3.json('mappingspecs', function (data) {
  mappingspec.property('value', data[0].text);
});

function getAllTextOrSelection() {
  let from = mappingspec.node().selectionStart;
  let to = mappingspec.node().selectionEnd;
  if (from !== to) {
    return mappingspec.property('value').substring(from, to);
  }
  return mappingspec.property('value');
}

d3.select('body').on('keyup', function () {
  if (d3.event.ctrlKey && d3.event.key === 'r') {
    // ctrl-r  - run spec
    runSpec(getAllTextOrSelection());
  } else {
    // other key - save spec
    debouncedSpecChanged();
  }
});

d3.select('#runButton').on('click', function() {
  runSpec(getAllTextOrSelection());
});

let debouncedSpecChanged = debounce(specChanged, 5000);

function specChanged() {
  console.log('saving mappingspec');
  var xhr = new XMLHttpRequest();
  xhr.onload = function () {
    if (xhr.onReady != undefined) {
      console.log(this.responseText);
    }
  };
  xhr.open("post", 'mappingspecs', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(JSON.stringify([{
    text: mappingspec.property('value')
  }]));
}

function addPrefixes(query) {
  return getSparqlPrefixes(parser.rdf.prefixes) + '\n' + query;
}

// returns the text on the first line of s
function getLineWord(s) {
  let wordText = /^\s*[^\n]*/.exec(s);
  if (wordText) {
    return wordText[0];
  }
  return null;
}

let prefixHandler = new PrefixHandler();

// for each spec in text, calls specHandler(server, query, mapTo)
function getSpecs(text, specHandler) {
  let isGroup = false;
  let n = 0;
  let word = getLineWord(text);
  if (word.trim() === 'group') {
    isGroup = true;
    n += word.length;
  }
  let maxSpecs = 10;
  while (true) {
    text = text.substring(n);
    if (getLineWord(text).trim() === 'end' || maxSpecs-- <= 0) {
      break;
    }
    let pattern = /\s+server([\s\S]*?)\n\s*query([\s\S]*?)mapto([\s\S]*?)end\b/m;
    let match = pattern.exec(text);
    if (match) {
      let server = match[1];
      let query = match[2];
      let mapTo = match[3];
      specHandler(server, query, mapTo);
    }
    n = match[0].length;
  }
}

// execute sparql query and map to diagram objects
function runSpec(spec) {
  let type = '0';
  diagramData = parser.rdf.createGraph();
  getSpecs(spec, function(server, query, mapTo) {
//    query = addPrefixes(query);
    loadSparqlTsv(server, query).then(function (data) {
      if (data && data.length > 0) {
        // remove comments
        mapTo = mapTo.replace(/^\/\/.*?$/gm, '');
        // replace ?x in mapTo with obj['?x']
        _.forEach(Object.keys(data[0]), function(key) {
          let pattern = '\\' + key + '\\b';
          mapTo = mapTo.replace(new RegExp(pattern, 'mg'), "obj['" + key + "']");
        });
        mapDataToGraph(mapTo, data, type);
      }
    });
    type = (+type + 1).toString();
  });
}

// create graphical objects from data according to mapExpr
function mapDataToGraph(mapExpr, data, type) {
  // compile spec
  let compiledMapTo = compileCode(mapExpr);

  // run mapExpr to get
  // - a configured graphical component
  // - a function to run for each data item
  _.forEach(data, function(obj, i) {
    function node(id) {
      addDiagramObject(id, 10, 10 + i * 40);
      let chainObject = {
        label: function(...lines) {
          let nlSeparated = _.map(lines, shrinkResultUri).join('\n')
          addTriple(diagramData, peelUri(id), OSLCKTH('label'), parser.rdf.createLiteral(nlSeparated, null, 'http://www.w3.org/2001/XMLSchema#string'));
          return chainObject;
        },
        cornerRadius: function(radius) {
          addTriple(diagramData, peelUri(id), OSLCKTH('cornerRadius'), parser.rdf.createLiteral(radius.toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));
          return chainObject;
        },
        padding: function(radius) {
          addTriple(diagramData, peelUri(id), OSLCKTH('padding'), parser.rdf.createLiteral(radius.toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));
          return chainObject;
        },
        margin: function(radius) {
          addTriple(diagramData, peelUri(id), OSLCKTH('margin'), parser.rdf.createLiteral(radius.toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));
          return chainObject;
        },
        color: function(value) {
          addTriple(diagramData, peelUri(id), OSLCKTH('color'), parser.rdf.createLiteral(value, null, 'http://www.w3.org/2001/XMLSchema#string'));
          return chainObject;
        },
        borderColor: function(value) {
          addTriple(diagramData, peelUri(id), OSLCKTH('borderColor'), parser.rdf.createLiteral(value, null, 'http://www.w3.org/2001/XMLSchema#string'));
          return chainObject;
        },
        parent: function(value) {
          addTriple(diagramData, peelUri(id), OSLCKTH('parent'), peelUri(value));
          return chainObject;
        },
        tooltip: function(value) {
          console.log('node tooltip', value);
          addTriple(diagramData, peelUri(id), OSLCKTH('tooltip'), peelUri(value));
          return chainObject;
        },
        layout: function(value) {
          addTriple(diagramData, peelUri(id), OSLCKTH('layout'), peelUri(value));
          return chainObject;
        }
      };
      return chainObject;
    }
    function line(s, p, o) {
      let relationUri = addDiagramRelationObject(s, p, o, 10, 10 + i * 40);
      let chainObject = {
        label: function(...lines) {
          let nlSeparated = _.map(lines, shrinkResultUri).join('\n')
          addTriple(diagramData, relationUri, OSLCKTH('label'), parser.rdf.createLiteral(nlSeparated, null, 'http://www.w3.org/2001/XMLSchema#string'));
          return chainObject;
        }
      };
      return chainObject;
    }
    let mapToResult = compiledMapTo({node, line, obj, i, console, prefixes: prefixHandler});
  });

  d3.select('svg').selectAll('.node').remove();
  hierarchyComponent = new HierarchyComponent(getChildren, getComponent);
  renderAll();
}

// adds a new diagramobject of type with representing uri at document pos x, y
function addDiagramObject(uri, x, y) {
  addTriple(diagramData, peelUri(uri), OSLCKTH('visible'), parser.rdf.createLiteral('true', null, 'http://www.w3.org/2001/XMLSchema#boolean'));
  addTriple(diagramData, peelUri(uri), OSLCKTH('posx'), parser.rdf.createLiteral(x.toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));
  addTriple(diagramData, peelUri(uri), OSLCKTH('posy'), parser.rdf.createLiteral(y.toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));

  return uri;
}

function addDiagramRelationObject(subjectUri, relationUri, objectUri) {
  let relationSubject = parser.rdf.createBlankNode();
  addTriple(diagramData, relationSubject, RDF('type'), OSLCKTH('relation'));
  addTriple(diagramData, relationSubject, OSLCKTH('from'), peelUri(subjectUri));
  addTriple(diagramData, relationSubject, OSLCKTH('relationUri'), peelUri(relationUri));
  addTriple(diagramData, relationSubject, OSLCKTH('to'), peelUri(objectUri));

  addTriple(diagramData, peelUri(subjectUri), OSLCKTH('visible'), parser.rdf.createLiteral('true', null, 'http://www.w3.org/2001/XMLSchema#boolean'));
  addTriple(diagramData, peelUri(objectUri), OSLCKTH('visible'), parser.rdf.createLiteral('true', null, 'http://www.w3.org/2001/XMLSchema#boolean'));

  return relationSubject;
}

// handle diagram
let OSLCKTH = suffix => 'http://oslc.kth.se/ldexplorer#' + suffix;

let diagramData = parser.rdf.createGraph();

// make id usable as a valid part of a d3.select expression, by replacing some chars by -
function simplifyId(id) {
    return id.replace(/[:/.]/g, '-');
}

let svgComponent = new SvgComponent('top').layout(new XyLayout()
  .dataX(d => +getOneObjectString(diagramData, d, OSLCKTH('posx')))
  .dataY(d => +getOneObjectString(diagramData, d, OSLCKTH('posy'))));
let nodeComponent = new SimpleTextBoxComponent('obj')
  .dataId(d => simplifyId(d)).label(getNodeLabel).tooltip(d=>d)
  .backgroundColor(getNodeColor).foregroundColor(getNodeForegroundColor)
  .cornerRadius(getNodeCornerRadius);
let relationComponent = new RelationComponent('relation').label(getRelationLabel).tooltip(d=>d.relationUri);



let nodeComponentByLayout = {
  'xy': new SimpleTextBoxComponent('obj').label(getNodeLabel).backgroundColor(getNodeColor).tooltip(d=>d)
    .dataId(d => simplifyId(d)).layout(new XyLayout()).minSize({width: 10, height: 10}),
  'hbox': new SimpleTextBoxComponent('obj').label(getNodeLabel).backgroundColor(getNodeColor).tooltip(d=>d)
    .dataId(d => simplifyId(d)).layout(new HBoxLayout()).minSize({width: 10, height: 10}),
  'vbox': new SimpleTextBoxComponent('obj').label(getNodeLabel).backgroundColor(getNodeColor).tooltip(d=>d)
    .dataId(d => simplifyId(d)).layout(new VBoxLayout()).minSize({width: 10, height: 10})
};
for (let c in nodeComponentByLayout) {
  nodeComponentByLayout[c].componentLayoutName = c;
}

function getNodeLabel(d) {
  let result = getOneObject(diagramData, d, OSLCKTH('label'));
  return result ? result.toString().split('\n') : [parser.rdf.prefixes.shrink(d)];
}

function getRelationLabel(d) {
  let result = getOneObject(diagramData, d.id, OSLCKTH('label'));
  return result ? result.toString().split('\n') : [parser.rdf.prefixes.shrink(d.relationUri)];
}

function getNodeColor(d) {
  let result = getOneObject(diagramData, d, OSLCKTH('color'));
  return result ? result.toString() : 'white';
}

function getNodeForegroundColor(d) {
  let result = getOneObject(diagramData, d, OSLCKTH('borderColor'));
  return result ? result.toString() : 'black';
}

function getTooltip(d) {
  let result = getOneObject(diagramData, d, OSLCKTH('tooltip'));
  console.log('tooltip', result);
  return result ? result.toString() : d;
}

function getNodeCornerRadius(d) {
  let result = getOneObject(diagramData, d, OSLCKTH('cornerRadius'));
  return result ? +result.toString() : 0;
}

function getChildren(parent, data) {
  let parentLessSubject = triple => data.match(triple.subject, OSLCKTH('parent'), null).length == 0;
  if (parent) {
    let children = data.match(null, OSLCKTH('parent'), parent).toArray();
    return _.map(children, d => d.subject.toString());
  } else {
    let visibleObjects = data.match(null, OSLCKTH('visible'), null)
      .filter(parentLessSubject).toArray();
    return _.map(visibleObjects, d => d.subject.toString());
  }
}

function getComponent(d) {
  let layoutName = getOneObjectString(diagramData, d, OSLCKTH('layout'));
  let nodeComponentResult = nodeComponentByLayout[layoutName];
  let component = nodeComponentResult || nodeComponent;
  return component;
}

function getRelations() {
  let relations = [];
  let visibleObjects = diagramData.filter(t => t.predicate.toString() === OSLCKTH('visible'));
  matchForEachTriple(diagramData, null, RDF('type'), OSLCKTH('relation'), function (relationTypeTriple) {
    let from = getOneObject(diagramData, relationTypeTriple.subject, OSLCKTH('from'))
    let relationUri = getOneObject(diagramData, relationTypeTriple.subject, OSLCKTH('relationUri'))
    let to = getOneObject(diagramData, relationTypeTriple.subject, OSLCKTH('to'))
    if (visibleObjects.some(t => t.subject.toString() === from.toString()) &&
      visibleObjects.some(t => t.subject.toString() === to.toString())) {
      // both subject and object of this relation is visible in diagram
      relations.push({
        id: relationTypeTriple.subject,
        from: from.toString(),
        to: to.toString(),
        relationUri: relationUri.toString()
      })
    }
  });
  return relations;
}

let hierarchyComponent = new HierarchyComponent(getChildren, getComponent);

let manipulator = new Manipulator()
  .add(new MoveNodeTool()
    .on('end', (sourceEls, targetEl, targetRelPosList) => {
      sourceEls.each(function (d, i) {
        setTripleObject(diagramData, d, OSLCKTH('posx'), parser.rdf.createLiteral(targetRelPosList[i].x.toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));
        setTripleObject(diagramData, d, OSLCKTH('posy'), parser.rdf.createLiteral(targetRelPosList[i].y.toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));
      });
      renderAll();
    }))
  .add(new SelectTool());

function renderAll() {
  let svg = svgComponent(d3.select('#rightcol'));
  hierarchyComponent(svg, diagramData);
  svgComponent.layout()(d3.select('#rightcol svg'));
  let rels = getRelations();
  let relsEls = relationComponent(svg, rels);
  relsEls.each(function (d) {
    this.fomod.layout(d3.select(this));
  });
  separateOverlappingRelations(relsEls);

  d3.selectAll('#rightcol .obj')
    .call(manipulator);
}
renderAll();

function peelUri(uri) {
  return (uri.length > 2 && uri[0] === '<') ? uri.substring(1, uri.length - 1) : uri;
}

// deselect all elements inside parentElement
function deselectAll(parentElement) {
  parentElement.selectAll('.selected').classed('selected', false);
}

// get data elements for all selected elements inside parentElement
function getSelected(parentElement) {
  return parentElement.selectAll('.selected').data();
}

// returns a promise with tsv data from result of sparql execution on server at serverUrl
function loadSparqlTsv(serverUrl, sparql) {
  return new Promise(function (fulfill, reject) {
    let url = fusekiUrl(sparql);

    d3.tsv('proxy?url=' + encodeURIComponent(url))
      .mimeType('text/tab-separated-values')
      .get(function (error, data) {
        if (error) {
          reject(error);
        } else {
          fulfill(data);
        }
      });

    function fusekiUrl(sparql) {
      return serverUrl + '?query=' + encodeURIComponent(sparql);
    }
  });
}
// returns uri shrinked by using prefix form for defined prefixes
// if uri has the form <xxxyyy> then the prefixed form is prefix:yyy
function shrinkResultUri(uri) {
  return parser.rdf.prefixes.shrink(peelUri(uri));
}

function peelUri(uri) {
  if (uri.length > 2 && uri[0] === '<') {
    uri = uri.substring(1, uri.length - 1);
  }
  return uri;
}

function PrefixHandler() {
  return {
    // adds prefix with iri to the prefixes
    add: function(prefix, iri) {
      let uri = iri.toString();
      if (uri.length > 2 && uri[0] === '<') {
        uri = uri.substring(1, uri.length - 1);
      }
      if (!parser.rdf.prefixes[prefix]){
        parser.rdf.prefixes[prefix] = uri;
      }
    },
    // if iri has a known prefix, then return the prefix, else return the defaultValue parameter
    getPrefix: function(uri, defaultValue) {
      uri = peelUri(uri);
      if (uri.indexOf('http:') === 0) {
        let shrinked = parser.rdf.prefixes.shrink(uri.toString());
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
    removePrefix: function(iri) {
      let uri = peelUri(iri);
      if (uri.indexOf('http:') === 0) {
        let shrinked = parser.rdf.prefixes.shrink(uri.toString());
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
    },
    shrink: function(uri) {
      return shrinkResultUri(uri);
    }
  }
}
