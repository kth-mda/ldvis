import $ from 'jquery';
import Split from 'split.js';
import * as d3 from './d3';
import RdfXmlParser from 'rdf-parser-rdfxml';
import _ from 'lodash';

let initialServerUrl = 'https://vservices.offis.de/rtp/fuseki/v1.0/ldr/query';

var parser = new RdfXmlParser();
parser.rdf.prefixes['rdf'] = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
parser.rdf.prefixes['oslc_rm'] = 'http://open-services.net/ns/rm#';
parser.rdf.prefixes['simulink'] = 'http://mathworks.com/simulink/rdf#';
parser.rdf.prefixes['oslc_cm'] = 'http://open-services.net/ns/cm#';
parser.rdf.prefixes['simulink_services'] = 'https://vservices.offis.de/rtp/simulink/v1.0/services';
parser.rdf.prefixes['foaf'] = 'http://xmlns.com/foaf/0.1/';
parser.rdf.prefixes['oslc_am'] = 'http://open-services.net/ns/am#';
//parser.rdf.prefixes['xxx'] = 'xxx';

// returns uri shrinked by using prefix form for defined prefixes
// if uri has the form <xxxyyy> then the prefixed form is prefix:yyy
function shrinkResultUri(uri) {
  if (uri.length > 2 && uri[0] === '<') {
    let peeledUri = uri.substring(1, uri.length - 1);
    let result = parser.rdf.prefixes.shrink(peeledUri);
    if (result !== peeledUri) {
      return result;
    }
  }
  return uri;
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
});

// handle object list
function showObjectsOfType(types) {
  console.log('showObjectsOfType(',types,')');
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
        console.log('tr',tr);
      let trEnter = tr.enter().append('tr').on('click', rowClickHandler('#object-list', uri => showObjectDetails(uri[0]['?obj'])));
      trEnter.append('td').text(d => shrinkResultUri(d['?obj']));
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
      console.log('tr',tr);
    let trEnter = tr.enter().append('tr');
    trEnter.append('td').text(d => shrinkResultUri(d['?r']));
    trEnter.append('td').text(d => shrinkResultUri(d['?o']));
  });
}

// deselect all elements nside
function deselectAll(parentElement) {
  parentElement.selectAll('.selected').classed('selected', false);
}

// get data elements for all selected elements inside d3 selection parentElement
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

// import * as d3 from './modeling/d3';
// import {
//   SvgComponent, HBoxLayout, VBoxLayout, HierarchyComponent, Manipulator,
//   MoveNodeTool, CreateMoveRelationTool, SelectTool, utils
// } from './modeling/index.js';
// import {OSLCSchemaConnector, getOSLCSchemaChildren, getOSLCSchemaComponent, getRelations, getRelationComponent, getRdfType, renderHtml} from './oslc-schema-connector.js';
//
// let connector = new OSLCSchemaConnector();
//
// // set up and listen to url field
// let urlField = d3.select('#urlField').node();
// urlField.value = 'https://vservices.offis.de/rtp/bugzilla/v1.0/services/catalog/singleton';
// urlField.onchange = function() {connector.open(urlField.value);};
//
// let svgComponent = new SvgComponent('top').layout(new HBoxLayout().margin(10));
// let nodeHierarchyComponent = new HierarchyComponent(getOSLCSchemaChildren, getOSLCSchemaComponent);
// let relationHierarchyComponent = new HierarchyComponent(getRelations, getRelationComponent);
//
// function renderModel() {
//   svgComponent(d3.select('#graph'), [{id: 'ws'}]);
//   nodeHierarchyComponent(d3.select('#graph svg'));
//   svgComponent.layout()(d3.select('#graph svg'));
//   relationHierarchyComponent(d3.select('#graph svg'));
//
//   d3.selectAll('.node').call(nodeManipulator);
// }
//
// connector.on(function(eventType) {
//   if (eventType === 'read-end') {
//     renderModel();
//   }
// });
//
// var nodeManipulator = new Manipulator()
//   .add(new SelectTool()
//     .on('select', (el, deselectEls) => {
//       console.log('selection event');
//     })
//   );
//
// connector.open(urlField.value);
