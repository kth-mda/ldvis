require('jquery-ui/themes/base/core.css');
require('jquery-ui/themes/base/menu.css');
// require('jquery-ui/themes/base/theme.css');
import $ from 'jquery';
let draggable = require('jquery-ui/ui/widgets/draggable');
draggable();

import Split from 'split.js';
import RdfXmlParser from 'rdf-parser-rdfxml';
import _ from 'lodash';
import {
  d3, SvgComponent, SimpleTextBoxComponent, RelationComponent, HierarchyComponent, HBoxLayout, VBoxLayout, XyLayout, Manipulator,
  MoveNodeTool, CreateMoveRelationTool, SelectTool, utils
} from '../../../../../fomod-develop';
import {setTripleObject, fetchGraph, matchForEachTriple, getOneObject, getOneObjectString, addTriple, renderHtmlPropsTable, getPropsProps, tripleToString, graphToString} from './oslc-schema-utils';
import d3ctx from 'd3-context-menu';
import uuid from 'node-uuid';

// let initialServerUrl = 'https://vservices.offis.de/rtp/fuseki/v1.0/ldr/query';
let initialServerUrl = 'http://localhost:8080/openrdf-sesame/repositories/scania';

var parser = new RdfXmlParser();
parser.rdf.prefixes['rdf'] = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
parser.rdf.prefixes['oslc_rm'] = 'http://open-services.net/ns/rm#';
parser.rdf.prefixes['simulink'] = 'http://mathworks.com/simulink/rdf#';
parser.rdf.prefixes['oslc_cm'] = 'http://open-services.net/ns/cm#';
parser.rdf.prefixes['simulink_services'] = 'https://vservices.offis.de/rtp/simulink/v1.0/services';
parser.rdf.prefixes['foaf'] = 'http://xmlns.com/foaf/0.1/';
parser.rdf.prefixes['oslc_am'] = 'http://open-services.net/ns/am#';
//parser.rdf.prefixes['xxx'] = 'xxx';

let contextMenu = d3ctx(d3);

let menu = [
    {
        title: 'Item #1',
        action: function(elm, d, i) {
            console.log('Item #1 clicked!');
            console.log('The data for this circle is: ' + d);
        },
        disabled: false // optional, defaults to false
    },
    {
        title: 'Item #2',
        action: function(elm, d, i) {
            console.log('You have clicked the second item!');
            console.log('The data for this circle is: ' + d);
        }
    }
];

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

Split(['#type-list', '#object-list', '#object-details'], {
    direction: 'vertical',
    gutterSize: 5,
    minSize: 50,
    snapOffset: 1
});

// init url field
let urlField = d3.select('#urlField').node();
urlField.value = initialServerUrl;

// handle resource type list
loadSparqlTsv(initialServerUrl, `select (count(?a) as ?cnt) ?type
where {graph ?g {
    ?a <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?type.
    }
}
group by ?type
limit 1000`).then(function(data) {
  let tableRowEnter = d3.select('#type-list').selectAll('table').data(['table-dummy-data'])
    .enter().append('table').append('tr');
    tableRowEnter.append('th').text('Type');
    tableRowEnter.append('th').text('Objects');
  let tr = d3.select('#type-list table').selectAll('tr')
    .data(data);
  tr.exit().remove();
  let trEnter = tr.enter().append('tr').on('click', rowClickHandler('#type-list', showObjectsOfType));
  trEnter.append('td').text(d => shrinkResultUri(d['?type']));
  trEnter.append('td').text(d => d['?cnt']);
  trEnter.on('contextmenu', contextMenu(menu)).attr('title', d => d['?type']);
});

function getPositions(ev) {
  let result = {};
  for (let prefix of ['client', 'offset', 'page', 'screen']) {
    result[prefix] = [ev[prefix + 'X'], ev[prefix + 'Y']];
  }
  return result;
}

// handle object list
function showObjectsOfType(types) {
  if (types.length === 1) {
    let query = `select ?obj
    where {graph ?g {
        ?obj <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ${types[0]['?type']}.
        }
    }
    limit 1000`;
    loadSparqlTsv(initialServerUrl, query).then(function(data) {
      let tableRowEnter = d3.select('#object-list').selectAll('table').data(['table-dummy-data'])
        .enter().append('table').append('tr');
        tableRowEnter.append('th').text('URI');
      let tr = d3.select('#object-list table').selectAll('tr')
        .data(data, d => d['?obj']);
      tr.exit().remove();
      let trEnter = tr.enter().append('tr').on('click', rowClickHandler('#object-list', uri => showObjectDetails(uri[0]['?obj'])));
      trEnter.append('td').text(d => shrinkResultUri(d['?obj']));
      $('#object-list td').draggable({helper: "clone", stop: function( event, ui ) {
        addDiagramObject(d3.select(event.target).datum()['?obj'], event.clientX, event.clientY);
      }});
      trEnter.on('contextmenu', contextMenu(menu)).attr('title', d => d['?obj']);
    });
  }
}

// handle object details
function showObjectDetails(uri) {
  let query = `select ?r ?o
  where {graph ?g {
      ${uri} ?r ?o.
      }
  }
  limit 1000`;
  loadSparqlTsv(initialServerUrl, query).then(function(data) {
    let tableRowEnter = d3.select('#object-details').selectAll('table').data(['table-dummy-data'])
      .enter().append('table').append('tr');
      tableRowEnter.append('th').text('Property');
      tableRowEnter.append('th').text('Value');
    let tr = d3.select('#object-details table').selectAll('tr')
      .data(data, d => d['?r']);
    tr.exit().remove();
    let trEnter = tr.enter().append('tr');
    trEnter.append('td').text(d => shrinkResultUri(d['?r'])).attr('title', d => d['?r']);
    trEnter.append('td').text(d => shrinkResultUri(d['?o'])).attr('title', d => d['?o']);
    $('#object-details td').draggable({helper: "clone", stop: function( event, ui ) {
      addDiagramRleationObject(uri, d3.select(event.target).datum()['?r'], d3.select(event.target).datum()['?o'], event.clientX, event.clientY);
    }});
  });
}

// handle diagram
let OSLCKTH = suffix => 'http://oslc.kth.se/ldexplorer#' + suffix;

let diagramData = parser.rdf.createGraph();

let svgComponent = new SvgComponent('top').layout(new XyLayout()
  .dataX(d => +getOneObjectString(diagramData, d, OSLCKTH('posx')))
  .dataY(d => +getOneObjectString(diagramData, d, OSLCKTH('posy'))));
let nodeComponent = new SimpleTextBoxComponent('obj', d => [shrinkResultUri(d)])
  .dataId(d => d);
let relationComponent = new RelationComponent('relation', d=>[shrinkResultUri(d.text)]);

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
  diagramData.toArray().forEach(function(triple) {
    if (visibleObjects.some(t => t.subject.toString() === triple.subject.toString())
        && visibleObjects.some(t => t.subject.toString() === triple.object.toString())) {
      // both subject and object of this relation is visible in diagram
      relations.push({id: uuid.v4(), from: triple.subject.toString(), to: triple.object.toString(), text: triple.predicate.toString()})
    }
  });
  console.log('rels', relations);
  return relations;
}

let hierarchyComponent = new HierarchyComponent(getChildren, getComponent);

let manipulator = new Manipulator()
.add(new MoveNodeTool()
  .on('end', (sourceEls, targetEl, targetRelPosList) => {
      sourceEls.each(function(d, i) {
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
  relsEls.each(function(d) {
      this.fomod.layout(d3.select(this));
  });

  d3.selectAll('#rightcol .obj')
    .on('contextmenu', contextMenu(menu))
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
  addTriple(diagramData, peelUri(uri), OSLCKTH('posx'), parser.rdf.createLiteral((x - svgBounds.left).toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));
  addTriple(diagramData, peelUri(uri), OSLCKTH('posy'), parser.rdf.createLiteral((y - svgBounds.top).toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));

  renderAll();
}

function addDiagramRleationObject(subjectUri, relationUri, objectUri, x, y) {
  addTriple(diagramData, peelUri(subjectUri), peelUri(relationUri), peelUri(objectUri));
  let svgBounds = d3.select('svg').node().getBoundingClientRect();
  addTriple(diagramData, peelUri(objectUri), OSLCKTH('visible'), parser.rdf.createLiteral('true', null, 'http://www.w3.org/2001/XMLSchema#boolean'));
  addTriple(diagramData, peelUri(objectUri), OSLCKTH('posx'), parser.rdf.createLiteral((x - svgBounds.left).toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));
  addTriple(diagramData, peelUri(objectUri), OSLCKTH('posy'), parser.rdf.createLiteral((y - svgBounds.top).toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));

  renderAll();
}




// deselect all elements inside parentElement
function deselectAll(parentElement) {
  parentElement.selectAll('.selected').classed('selected', false);
}

// get data elements for all selected elements inside parentElement
function getSelected(parentElement) {
  return parentElement.selectAll('.selected').data();
}

// click handler maker for selectting clicked elements
// usage: to make tr elements in #atable selectable, do
// d3.select(#atable).selectAll('tr').on('click', rowClickHandler('#atable', selectionChanged))
// and use css that makes tr.selected look selected
// now you can click table rows to select them, and shift/ctrl/cmd-click them to toggle selection state
// function selectionChanged(dataItems) will be called on any selection change, with data items of the selected elements
function rowClickHandler(tableSelector, selectionChanged) {
  return function rowClick(d, i, trElements) {
    let tableEl = d3.select(tableSelector);
    let el = d3.select(trElements[i]);
    if (d3.event.shiftKey || d3.event.metaKey || d3.event.ctrlKey) {
      el.classed('selected', !el.classed('selected'));
    } else {
      deselectAll(tableEl);
      el.classed('selected', true);
    }
    selectionChanged(getSelected(tableEl));
  }
}

// returns a promise with tsv data from result of sparql execution on server at serverUrl
function loadSparqlTsv(serverUrl, sparql) {
  return new Promise(function(fulfill, reject) {
    let url = fusekiUrl(sparql);

    d3.tsv('http://localhost:3012/proxy?url=' + encodeURIComponent(url))
    .mimeType('text/tab-separated-values')
    .get(function(error, data) {
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
