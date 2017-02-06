import $ from 'jquery';

import Split from 'split.js';
import RdfXmlParser from 'rdf-parser-rdfxml';
import _ from 'lodash';
import {  d3,  SvgComponent,  SimpleTextBoxComponent,  RelationComponent,  HierarchyComponent,  HBoxLayout, ForceLayout,
  VBoxLayout,  XyLayout,  Manipulator,  MoveNodeTool,  CreateMoveRelationTool,  SelectTool,  utils, separateOverlappingRelations
} from '../../../fomod';
import {
  setTripleObject,  fetchGraph,  matchForEachTriple,  matchForEach, getOneObject,  getOneObjectString, getOneSubject,
  addTriple,  renderHtmlPropsTable,  getPropsProps,  tripleToString,  graphToString, RDF
} from './oslc-schema-utils';
import d3ctx from 'd3-context-menu';
import uuid from 'node-uuid';
import {
  loadPrefixes, getSparqlPrefixes, savePrefixes,  initPrefixDia,  openAddPrefixDia
} from './prefix-manager';
import debounce from 'debounce';
import {compileCode} from './compilecode';

var parser = new RdfXmlParser();
let prevSpecData = null;
let contextMenu = d3ctx(d3);
let titleInput = d3.select('#titleInput');
let mappingspec = d3.select('#mappingspec');

// handle page layout
function adjustUISize() {
  $('#ui').height($(window).innerHeight());
}
$(window).resize(adjustUISize);
adjustUISize();

// set adjustable splitter between spec editor and diagram
Split(['#leftcol', '#rightcol'], {
  sizes: [50, 50],
  minSize: 200,
  gutterSize: 5,
  snapOffset: 1
});

// returns the selected text, or the whole text if none selected
function getAllTextOrSelection() {
  let from = mappingspec.node().selectionStart;
  let to = mappingspec.node().selectionEnd;
  if (from !== to) {
    return mappingspec.property('value').substring(from, to);
  }
  return mappingspec.property('value');
}

// handle keyboard events
d3.select('body').on('keyup', function () {
  // other key - save spec to server
  debouncedSaveSpec({title: titleInput.property('value'), spec: mappingspec.property('value')});
});

// handle run button
d3.select('#runButton').on('click', function() {
  // run spec
  runSpec(getAllTextOrSelection());
});

let debouncedSaveSpec = debounce(saveSpecDataIfChanged, 300);

// send put request to server with title and spec as json
function saveSpecDataIfChanged(specData) {
  if (!(specData && specData.spec && typeof specData.spec === 'string' && specData.spec.trim().length > 0)) {
    return;
  }
  if (!prevSpecData || prevSpecData && prevSpecData.title !== specData.title || prevSpecData.spec !== specData.spec) {
    saveSpecData(specData);
    prevSpecData = _.clone(specData);
  }
}

function saveSpecData(specData) {
  var decodedLocation = decodeLocation();
  if (decodedLocation && decodedLocation.id) {
    console.log('saving mappingspec');
    var xhr = new XMLHttpRequest();
    xhr.onload = function () {
      if (xhr.onReady != undefined) {
        console.log(this.responseText);
      }
    };
    xhr.open("put", 'diagrams/' + decodedLocation.id, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(specData));
  }
}

// returns query with prefixes from parser.rdf.prefixes prepended
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

/* Executes spec by sending sparql query to server and map response to diagram objects.
 Spec has one or more:
   server
     <sparql server url>
   query
    <sparql select query>
   mapto
     <calls to node, line and functions on their results>
   end
*/
function runSpec(spec) {
  dd = {nodes: {}, lines: {}, topNodes: []};
  let parsedSpecs = parseSpec(spec);
  Promise.all(_.map(parsedSpecs, function(parsedSpec) {
    // return promises that have created nodes and lines in dd
    return loadSparqlTsv(parsedSpec.server, parsedSpec.query).then(function (data) {
      if (data && data.length > 0) {
        // remove comments
        parsedSpec.mapTo = parsedSpec.mapTo.replace(/^\/\/.*?$/gm, '');
        // replace ?x in mapTo with obj['?x']
        _.forEach(Object.keys(data[0]), function(key) {
          // fix result that uses keys without ? - dbpedia for example
          let patternKey = key;
          if (key[0] !== '?') {
            patternKey = '?' + key;
          }
          let pattern = '\\' + patternKey + '\\b';
          parsedSpec.mapTo = parsedSpec.mapTo.replace(new RegExp(pattern, 'mg'), "obj['" + key + "']");
        });
        mapDataToGraph(parsedSpec.mapTo, data);
      }
    });
  })).then(function() {
    prepareNodeTree();

    console.log('dd',dd);

    hierarchyComponent = new HierarchyComponent(getChildren, getComponent).layoutEnabled(false);
    renderAll(dd.topNodes);
  });
}

// add each node to the children array of its parent
// and collect all top level nodes in array dd.topNodes
function prepareNodeTree() {
  dd.topNodes = [];
  for (let nodeId in dd.nodes) {
    let node = dd.nodes[nodeId];
    if (node.parent) {
      let parentNode = dd.nodes[node.parent];
      if (parentNode) {
        // node has an existing parent node
        if (parentNode.children) {
          parentNode.children.push(node);
        } else {
          parentNode.children = [node];
        }
      } else {
        console.error('missing parent', node.parent, 'of node', node.id);
      }
    } else {
      // node has no parent - its a top node
      dd.topNodes.push(node);
    }
  }
}

// separates each spec in text into {server, query and mapTo} and returns array of them
function parseSpec(text) {
  let parsedSpecs = [];
  let n = 0;
  let maxSpecs = 20;
  while (true) {
    text = text.substring(n);
    if (text.trim() === '' || maxSpecs-- <= 0) {
      break;
    }
    let pattern = /\s*server([\s\S]*?)\n\s*query([\s\S]*?)mapto([\s\S]*?)end\b/m;
    let match = pattern.exec(text);
    if (match) {
      parsedSpecs.push({server: match[1], query: match[2], mapTo: match[3]});
      n = match[0].length;
    } else {
      console.error('spec does not match: server ... query ... mapto ... end');
      break;
    }
  }
  return parsedSpecs;
}

// create graphical objects from data according to mapExpr
function mapDataToGraph(mapExpr, data) {
  // compile spec
  let compiledMapTo = compileCode(mapExpr);

  // run mapExpr to get
  // - a configured graphical component
  // - a function to run for each data item
  _.forEach(data, function(obj, i) {
    function node(id) {
      let no = dd.nodes[id];
      if (!no) {
        no = {id: id, x: 10, y: 10 + i * 40};
        dd.nodes[id] = no;
      }
      let chainObject = {
        label: function(...lines) {
          no.label = _.map(lines, d => d !== undefined ? shrinkResultUri(d) : '').join('\n');
          return chainObject;
        },
        cornerRadius: function(radius) {
          no.cornerRadius = radius;
          return chainObject;
        },
        padding: function(paddingSize) {
          no.padding = paddingSize;
          // addTriple(diagramData, peelUri(id), OSLCKTH('padding'), parser.rdf.createLiteral(paddingSize.toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));
          return chainObject;
        },
        margin: function(marginSize) {
          no.margin = marginSize;
          // addTriple(diagramData, peelUri(id), OSLCKTH('margin'), parser.rdf.createLiteral(radius.toString(), null, 'http://www.w3.org/2001/XMLSchema#float'));
          return chainObject;
        },
        color: function(value) {
          no.color = value;
          return chainObject;
        },
        borderColor: function(value) {
          no.borderColor = value;
          return chainObject;
        },
        parent: function(value) {
          no.parent = value;
          return chainObject;
        },
        tooltip: function(value) {
          // value is
          // string - show simple svg tooltip
          // node object - when hovering over no, create node from value and position it over no,
          //      when leaving no remove value node (or just make it invisible)
          //
          no.tooltip = value;
          return chainObject;
        },
        layout: function(value) {
          no.layout = value;
          return chainObject;
        },
        click: function(href, target) {
          no.href = href;
          no.target = target;
          return chainObject;
        }
      };
      return chainObject;
    }
    function lineId(s, p, o) {
      return s + '#' + p + '#' + o;
    }
    function line(s, p, o) {
      let id = lineId(s, p, o);
      let li = dd.lines[id];
      if (!li) {
        li = {id: id, from: s, relationUri: p, to: o};
        dd.lines[id] = li;
      }
      // let relationUri = addDiagramRelationObject(s, p, o, 10, 10 + i * 40);
      let chainObject = {
        label: function(...lines) {
          let nlSeparated = _.map(lines, shrinkResultUri).join('\n')
          li.label = nlSeparated;
          // addTriple(diagramData, relationUri, OSLCKTH('label'), parser.rdf.createLiteral(nlSeparated, null, 'http://www.w3.org/2001/XMLSchema#string'));
          return chainObject;
        },
        tooltip: function(value) {
          // value is
          // string - show simple svg tooltip
          // node object - when hovering over no, create node from value and position it over no,
          //      when leaving no remove value node (or just make it invisible)
          //
          li.tooltip = value;
          return chainObject;
        }
      };
      return chainObject;
    }
    let mapToResult = compiledMapTo({
      node, line, obj, i, console,
      prefixes: prefixHandler,
      params: parseQuery(document.location.search)});
  });
}

// diagram rendering

function OSLCKTH(suffix) {return 'http://oslc.kth.se/ldexplorer#' + suffix;}

let dd = {nodes: {}, lines: {}, topNodes: []};

let svgComponent = new SvgComponent('top').layout(new XyLayout());
let nodeComponent = new SimpleTextBoxComponent('obj')
  .label(d => [d.label !== undefined ? d.label : d.id])
  .tooltip(getTooltip)
  .backgroundColor(d => d.color).foregroundColor(d => d.borderColor)
  .cornerRadius(d => d.cornerRadius);
let relationComponent = new RelationComponent('relation').label(getRelationLabel).tooltip(getTooltip);

let nodeComponentByLayout = {
  'xy': new SimpleTextBoxComponent('obj').layout(new XyLayout()),
  'hbox': new SimpleTextBoxComponent('obj').layout(new HBoxLayout()),
  'vbox': new SimpleTextBoxComponent('obj').layout(new VBoxLayout()),
  // 'force': new SimpleTextBoxComponent('obj').layout(new ForceLayout().on('tick', forceLayoutTick)
};

for (let c in nodeComponentByLayout) {
  let nodeComponent = nodeComponentByLayout[c];
  nodeComponent.label(getNodeLabel).backgroundColor(getNodeColor).tooltip(getTooltip)
    .minSize({width: 10, height: 10});
  nodeComponent.componentLayoutName = c;
}

// returns a label for node d - or node id if not specified
function getNodeLabel(d) {
  let result = d.label;
  return result !== undefined ? result.split('\n') : [parser.rdf.prefixes.shrink(d.id)];
}

// return a label for relation d, or relation id if not specified
function getRelationLabel(d) {
  let result = d.label;
  return result !== undefined ? result.split('\n') : [parser.rdf.prefixes.shrink(d.relationUri)];
}

// returns node color (fill), or white if not specified
function getNodeColor(d) {
  let result = d.color;
  return result ? result.toString() : 'white';
}

// get node foreground color (stroke), or black if not specified
function getNodeForegroundColor(d) {
  let result = d.borderColor;
  return result ? result.toString() : 'black';
}

function getTooltip(d) {
  let result = d.tooltip;
  return result ? result.toString() : d.id;
}

// returns numeric corner radius, or 0 if not specified
function getNodeCornerRadius(d) {
  let result = d.cornerRadius;
  return result ? +result.toString() : 0;
}

// data is
function getChildren(parent, data) {
  if (parent) {
    return parent.children;
  } else {
    return data.topNodes;
  }
}

function getComponent(d) {
  let nodeComponentResult = nodeComponentByLayout[d.layout];
  let component = nodeComponentResult || nodeComponent;
  return component;
}

function getRelations(data) {
  return _.map(data.lines, d => d);
}

let hierarchyComponent = new HierarchyComponent(getChildren, getComponent).layoutEnabled(false);

let manipulator = new Manipulator()
  .add(new MoveNodeTool()
    .on('end', (sourceEls, targetEl, targetRelPosList) => {
      setManualLayout(sourceEls);
      sourceEls.each(function (d, i) {
        d.x = targetRelPosList[i].x;
        d.y = targetRelPosList[i].y;
      });
      minorRenderAll();
    }).reparent(false)
  )
  .add(new SelectTool().on('select', function(d) {
    console.log('click', d);
    if (d && d.href) {
      window.open(d.href, d.target);
    }
  }));

// set node positions manually, and make sure the layout manager leaves the nodes in the manually set positions.
// - sets x, y of all nodes in sourceEl parent node, if not manual layout
// - changes layout manager to xyLayout
// - marks the of sourceEl parent node as manually layouted
function setManualLayout(sourceEls) {
  let parentNode = utils.classedParent('node', sourceEls.node().parentElement);
  if (!parentNode.fomod.manual) {
    // - sets x, y of all nodes in sourceEl parent node
    let realChildNodes = _.filter(parentNode.childNodes, el => d3.select(el).classed('node'));
    realChildNodes.forEach(el => {
      let d3el = d3.select(el),
        d = d3el.datum();
        let pos = utils.getTranslation(d3el.attr('transform'));
        let margin = parentNode.fomod.layout && parentNode.fomod.layout.margin && parentNode.fomod.layout.margin() || 0;
        d.x = pos.x - margin;
        d.y = pos.y - margin;
    });

    // - marks the of sourceEl parent node as manually layouted
    // - changes layout manager to xyLayout
    if (parentNode) {
      parentNode.fomod.originalLayout = parentNode.fomod.layout;
      parentNode.fomod.layout = new XyLayout();
      parentNode.fomod.manual = true;
    }
  }
}

function resetLayoutManagers() {
  d3.select('#rightcol').selectAll('.node').each(function(d) {
      if (this.fomod.manual) {
        this.fomod.layout = this.fomod.originalLayout;
        this.fomod.manual = false;
      }
  })
}

function renderAll() {
  resetLayoutManagers();
  minorRenderAll();
}

function minorRenderAll() {
  var parent = '#diagramGraph';
  if (document.location.pathname.split('/')[3] === 'edit') {
    parent = '#rightcol';
  }

  let svg = svgComponent(d3.select(parent));
  hierarchyComponent(svg, dd);

  let relDataArray = getRelations(dd);
  let relsEls = relationComponent(svg, relDataArray);

  layoutAll();
  separateOverlappingRelations(relsEls);

  d3.selectAll(parent + ' .obj').call(manipulator);
}

function simulate(data) {
  let simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id(function(d) { return d.id; }))
    .force("charge", d3.forceManyBody())
    .force("center", d3.forceCenter(size.width / 2, size.height / 2))
    .nodes(Object.values(data.nodes))
    .on("tick", tick)
    .on('end', end)
    .alphaMin(0.01)
    .force("link", d3.forceLink(Object.values(data.lines)).distance(150).strength(1));
}

function tick(d) {
  console.log('tick', d);
}

function end(d) {
  console.log('end', d);
}

function layoutAll () {
  let svg = d3.select('svg');
  layoutTree(svg.node(), 'node');
  layoutTree(svg.node(), 'relation');
}

function layoutTree (el, clazz) {
  if (el && el.nodeType === Node.ELEMENT_NODE) {
    let childNodes = el.childNodes;
    for (let i in childNodes) {
      layoutTree(childNodes[i], clazz);
    }
    let d3el = d3.select(el);
    if (d3el.classed(clazz)) {
      el.fomod.layout && el.fomod.layout(d3.select(el));
    }
  }
}

// removes < ... > from both ends of uri, if it starts with <
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

// returns an object if URL matches diagrams[/id], with the id attribute set only if id is present
function decodeLocation() {
  var parts = document.location.pathname.split('/');
  var isDiagram = parts[1] === 'diagrams';
  var id = parts[2];
  var isEdit = parts[3] === 'edit';
  if (isDiagram) {
    if (id) {
      return {id: id, edit: isEdit};
    } else {
      return {};
    }
  } else {
    return null;
  }
}

// for all immediate children of element cardsId having class 'card', display only the element with id cardId
function showCard(cardsId, cardId) {
  d3.selectAll('#' + cardsId + ' > .card').each(function(d) {
    this.style.display = (this.id === cardId ? 'block' : 'none');
  })
}

// handle the whole web page according to URL in document.location.pathname:
//   diagrams - show list and update it from server
//   diagrams/<id> - read diagram info from server, run and show diagram
//   diagrams/<id>/edit - read diagram info from server, open editor without running diagram
function showAccordingToUrl() {
  var decodedLocation = decodeLocation();
  if (decodedLocation) {
    if (decodedLocation.id) {
      // get spec by id and set editor to it
      getJson('diagrams/' + decodedLocation.id, function (data) {
        prevSpecData = data;
        mappingspec.property('value', data.spec);
        titleInput.property('value', data.title);
        if (decodedLocation.edit) {
          showCard('ui', 'editorCard');
          document.title = 'Edit ' + data.title + ' - LDVis';
          renderAll();
        } else {
          showCard('ui', 'diagramCard');
          document.title = data.title + ' - LDVis';
          runSpec(data.spec);
        }
      });
    } else {
      // no id - show diagram list
      showCard('ui', 'listCard');
      document.title = 'Diagram List - LDVis';
      renderList();
    }
  }
}
showAccordingToUrl();

// make window update according to url after browser back button click
window.onpopstate = showAccordingToUrl;

// render diagram list
function renderList() {
  getJson('diagrams', function(diagrams) {
    let mtimeComparator = (a, b) => a.mtime - b.mtime;
    let tr = d3.select('#listCard table').selectAll('tr').data(diagrams.sort(mtimeComparator), d => d.id);
    let trEnter = tr.enter().append('tr');
    let trEnterTd = trEnter.append('td');
    trEnterTd.append('span').text(d => d.title).on('click', showDiagram);
    trEnterTd.append('button').text('Edit').on('click', editDiagram);
    trEnterTd.append('button').text('Delete').on('click', deleteDiagram);
    tr.exit().remove();
  });

  d3.select('#addDiagramButton').on('click', addDiagram);
}

function showDiagram(d) {
  window.history.pushState(d.id, d.title, 'diagrams/' + d.id);
  showAccordingToUrl();
}

function editDiagram(d) {
  window.history.pushState(d.id, '', 'diagrams/' + d.id + '/edit');
  showAccordingToUrl();
}

function deleteDiagram(d) {
  d3.request('diagrams/' + d.id)
      .on('error', function(err) { console.error(err); })
      .on('load', function(err) { showAccordingToUrl(); })
      .send('delete');
}

function addDiagram(d) {
  postJson('diagrams', function(newDiagramMetadata) {
    window.history.pushState(newDiagramMetadata.id, '', 'diagrams/' + newDiagramMetadata.id + '/edit');
    showAccordingToUrl();
  });
}

function getJson(url, f) {
  d3.request(url)
  .header("Accept", "application/json")
  .header('Content-Type', 'application/json')
  .response(function(xhr) { return JSON.parse(xhr.responseText); })
  .get(f);
}

function postJson(url, f) {
  d3.request(url)
  .header("Accept", "application/json")
  .response(function(xhr) { return JSON.parse(xhr.responseText); })
  .header('Content-Type', 'application/json')
  .send('post', JSON.stringify({title: 'New Diagram', spec: 'server\n    http://dbpedia.org/sparql\nquery\n    select ?s ?p ?o\n    where {\n      ?s ?p ?o.\n    }\n    limit 5\nmapto\n    node(?s); \nend\n'}), f);
}

function parseQuery(qstr) {
  var params = {};
  var a = (qstr[0] === '?' ? qstr.substr(1) : qstr).split('&');
  for (var i = 0; i < a.length; i++) {
    var b = a[i].split('=');
    params[decodeURIComponent(b[0])] = decodeURIComponent(b[1] || '');
  }
  return params;
}
