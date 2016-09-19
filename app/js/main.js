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
import {
  d3,
  SvgComponent,
  SimpleTextBoxComponent,
  RelationComponent,
  HierarchyComponent,
  HBoxLayout,
  VBoxLayout,
  XyLayout,
  Manipulator,
  MoveNodeTool,
  CreateMoveRelationTool,
  SelectTool,
  utils
} from '../../../../../fomod-develop';
import {
  setTripleObject,
  fetchGraph,
  matchForEachTriple,
  getOneObject,
  getOneObjectString,
  addTriple,
  renderHtmlPropsTable,
  getPropsProps,
  tripleToString,
  graphToString
} from './oslc-schema-utils';
import d3ctx from 'd3-context-menu';
import uuid from 'node-uuid';
import {
  loadPrefixes,
  savePrefixes,
  initPrefixDialog,
  openAddPrefixDialog
} from './prefix-manager';
import debounce from 'debounce';
import {compileCode} from './compilecode';

// let initialServerUrl = 'https://vservices.offis.de/rtp/fuseki/v1.0/ldr/query';
let initialServerUrl = 'http://localhost:8080/openrdf-sesame/repositories/scania';

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
d3.json('/mappingspecs', function (data) {
  mappingspec.property('value', data[0].text);
});
mappingspec.on('keyup', function () {
  if (d3.event.ctrlKey && d3.event.key === 'r') {
    runSpec(mappingspec.property('value'));
  } else {
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
  let pattern = /([\s\S]*)mapto([\s\S]*)end[\s\S]*/m;
  let match = pattern.exec(spec);
  if (match) {
    diagramData = parser.rdf.createGraph();
    let sparql = match[1];
    let mapTo = match[2];
    loadSparqlTsv(urlField.value, sparql).then(function (data) {
      // console.log(JSON.stringify(data, null, '  '));
      if (data && data.length > 0) {
        // replace ?x in mapTo with real variables
        _.forEach(Object.keys(data[0]), function(key) {
          mapTo = mapTo.replace(key, "obj['" + key + "']");
        });

        // compile and run
        let mapToCompiled = compileCode(mapTo);
        _.forEach(data, function(obj, i) {
          console.log(obj['?o'], i);
          mapToCompiled({node: addDiagramObject, obj: obj, i: i});
        })
      }
      renderAll();
    });
  }
}

// handle diagram
let OSLCKTH = suffix => 'http://oslc.kth.se/ldexplorer#' + suffix;

let diagramData = parser.rdf.createGraph();

let svgComponent = new SvgComponent('top').layout(new XyLayout()
  .dataX(d => +getOneObjectString(diagramData, d, OSLCKTH('posx')))
  .dataY(d => +getOneObjectString(diagramData, d, OSLCKTH('posy'))));
let nodeComponent = new SimpleTextBoxComponent('obj', d => [shrinkResultUri(d)])
  .dataId(d => d);
let relationComponent = new RelationComponent('relation', d => [shrinkResultUri(d.text)]);

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
  diagramData.toArray().forEach(function (triple) {
    if (visibleObjects.some(t => t.subject.toString() === triple.subject.toString()) &&
      visibleObjects.some(t => t.subject.toString() === triple.object.toString())) {
      // both subject and object of this relation is visible in diagram
      relations.push({
        id: uuid.v4(),
        from: triple.subject.toString(),
        to: triple.object.toString(),
        text: triple.predicate.toString()
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

// adds a new diagramobject with representing uri at document pos x, y
function addDiagramObject(uri, x, y) {
  let svgBounds = d3.select('svg').node().getBoundingClientRect();
  addTriple(diagramData, peelUri(uri), OSLCKTH('visible'), parser.rdf.createLiteral('true', null, 'http://www.w3.org/2001/XMLSchema#boolean'));
  addTriple(diagramData, peelUri(uri), OSLCKTH('posx'), parser.rdf.createLiteral(x.toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));
  addTriple(diagramData, peelUri(uri), OSLCKTH('posy'), parser.rdf.createLiteral(y.toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));
}

function addDiagramRelationObject(subjectUri, relationUri, objectUri, x, y) {
  addTriple(diagramData, peelUri(subjectUri), peelUri(relationUri), peelUri(objectUri));
  addTriple(diagramData, peelUri(subjectUri), OSLCKTH('visible'), parser.rdf.createLiteral('true', null, 'http://www.w3.org/2001/XMLSchema#boolean'));
  let svgBounds = d3.select('svg').node().getBoundingClientRect();
  addTriple(diagramData, peelUri(objectUri), OSLCKTH('visible'), parser.rdf.createLiteral('true', null, 'http://www.w3.org/2001/XMLSchema#boolean'));
  addTriple(diagramData, peelUri(objectUri), OSLCKTH('posx'), parser.rdf.createLiteral(x.toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));
  addTriple(diagramData, peelUri(objectUri), OSLCKTH('posy'), parser.rdf.createLiteral(y.toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));
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

    d3.tsv('http://localhost:3012/proxy?url=' + encodeURIComponent(url))
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
