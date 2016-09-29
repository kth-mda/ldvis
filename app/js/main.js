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
  VBoxLayout,  XyLayout,  Manipulator,  MoveNodeTool,  CreateMoveRelationTool,  SelectTool,  utils
} from '../../../fomod';
import {
  setTripleObject,  fetchGraph,  matchForEachTriple,  matchForEach, getOneObject,  getOneObjectString, getOneSubject,
  addTriple,  renderHtmlPropsTable,  getPropsProps,  tripleToString,  graphToString, RDF
} from './oslc-schema-utils';
import d3ctx from 'd3-context-menu';
import uuid from 'node-uuid';
import {
  loadPrefixes,  savePrefixes,  initPrefixDialog,  openAddPrefixDialog
} from './prefix-manager';
import debounce from 'debounce';
import {compileCode} from './compilecode';

let initialServerUrl = 'https://git.md.kth.se/fuseki/import-cpse/query';

var parser = new RdfXmlParser();

let contextMenu = d3ctx(d3);

// returns uri shrinked by using prefix form for defined prefixes
// if uri has the form <xxxyyy> then the prefixed form is prefix:yyy
function shrinkResultUri(uri) {
  if (uri.length > 2 && uri[0] === '<') {
    uri = uri.substring(1, uri.length - 1);
  }
  return parser.rdf.prefixes.shrink(uri);
}

// handle page layout
function adjustUISize() {
  $('#ui').height($(window).innerHeight() - 2);
}
$(window).resize(adjustUISize);
adjustUISize();

Split(['#leftcol', '#rightcol'], {
  sizes: [50, 50],
  minSize: 200,
  gutterSize: 5,
  snapOffset: 1
});


// init url field
let urlField = d3.select('#urlField').node();
urlField.value = initialServerUrl;
urlField.onchange = function () {
  initialServerUrl = urlField.value;
  console.log('changed url to', initialServerUrl);
};

// init mapping spec field
let mappingspec = d3.select('#mappingspec');
d3.json('mappingspecs', function (data) {
  mappingspec.property('value', data[0].text);
});

d3.select('body').on('keyup', function () {
  if (d3.event.ctrlKey && d3.event.key === 'r') {
    // ctrl-r  - run spec
    runSpec(mappingspec.property('value'));
  } else {
    // other key - save spec
    debouncedSpecChanged();
  }
});

let debouncedSpecChanged = debounce(specChanged, 1000);

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

// execute sparql query and map to diagram objects
function runSpec(spec) {
  let pattern = /query([\s\S]*?)mapto([\s\S]*?)end[\s\S]*/m;
  let type = '0';
  diagramData = parser.rdf.createGraph();
  let match = pattern.exec(spec);
  if (match) {
    let query = match[1];
    let mapTo = match[2];
    loadSparqlTsv(urlField.value, query).then(function (data) {
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
  }
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
        color: function(value) {
          addTriple(diagramData, peelUri(id), OSLCKTH('color'), parser.rdf.createLiteral(value, null, 'http://www.w3.org/2001/XMLSchema#string'));
          return chainObject;
        },
        parent: function(value) {
          addTriple(diagramData, peelUri(id), OSLCKTH('parent'), value);
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
          console.log('nlSeparated', relationUri, nlSeparated);
          addTriple(diagramData, relationUri, OSLCKTH('label'), parser.rdf.createLiteral(nlSeparated, null, 'http://www.w3.org/2001/XMLSchema#string'));
          return chainObject;
        }
      };
      return chainObject;
    }
    let mapToResult = compiledMapTo({node, line, obj, i, console});
  })
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

let svgComponent = new SvgComponent('top').layout(new XyLayout()
  .dataX(d => +getOneObjectString(diagramData, d, OSLCKTH('posx')))
  .dataY(d => +getOneObjectString(diagramData, d, OSLCKTH('posy'))));
let nodeComponent = new SimpleTextBoxComponent('obj').label(getNodeLabel).backgroundColor(getNodeColor).tooltip(d=>d)
  .dataId(d => d);
let relationComponent = new RelationComponent('relation').label(getRelationLabel).tooltip(d=>d.relationUri);

function getNodeLabel(d) {
  let result = getOneObject(diagramData, d, OSLCKTH('label'));
  return result ? result.toString().split('\n') : [d];
}

function getRelationLabel(d) {
  let result = getOneObject(diagramData, d.id, OSLCKTH('label'));
  return result ? result.toString().split('\n') : [d.relationUri];
}

function getNodeColor(d) {
  let result = getOneObject(diagramData, d, OSLCKTH('color'));
  return result ? result.toString() : 'white';
}

function getChildren(parent, data) {
  if (parent) {
    return [];
  } else {
    let visibleObjects = data.match(null, OSLCKTH('visible'), null).toArray();
    return _.map(visibleObjects, d => d.subject.toString());
  }
}

function getComponent(dataItem) {
  return nodeComponent;
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
