import $ from 'jquery';
import Split from 'split.js';
import * as d3 from './d3';

let initialServerUrl = 'https://vservices.offis.de/rtp/fuseki/v1.0/ldr/query';

// handle page layout
function adjustUISize() {
  $('#ui').height($(window).innerHeight() - 2);
}
$(window).resize(adjustUISize);
adjustUISize();

Split(['#leftcol', '#rightcol'], {
    sizes: [25, 75],
    minSize: 200,
    gutterSize: 5,
    snapOffset: 1
});

Split(['#type-list', '#object-list', '#object-info'], {
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
  let trEnter = tr.enter().append('tr').on('click', rowClick);
  trEnter.append('td').text(d => d['?type']);
  trEnter.append('td').text(d => d['?cnt']);
});

function rowClick(d, i, trElements) {
  console.log('click', arguments);
  d3.select('#type-list').selectAll('tr').classed('selected', false);
  d3.select(trElements[i]).classed('selected', true);
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
