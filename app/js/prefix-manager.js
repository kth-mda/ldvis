import {d3} from '../../../fomod';
import $ from 'jquery';
import _ from 'lodash';

export function getSparqlPrefixes(prefixes) {
  return _.map(Object.keys(prefixes), key => 'PREFIX ' + key + ': <' + prefixes[key] + '>').join('\n');
}

export function initPrefixDialog(prefixes, changedCallback) {
  // $("#add-prefix-dialog").dialog({
  //   autoOpen:false
  // });
  // setTimeout(function() {$("#add-prefix-dialog").dialog('close');}, 1000);

  $('#add-prefix-dialog-ok').on('click', function () {
    let prefixName = d3.select('#add-prefix-dialog-name').property('value');
    let prefixUri = d3.select('#add-prefix-dialog-uri').property('value');
    let originalUri = d3.select("#add-prefix-dialog").datum();
    console.log('originalUri', originalUri, 'prefixUri', prefixUri, originalUri.length, prefixUri.length);
    if (prefixName && !prefixes[prefixName] && originalUri.indexOf(prefixUri) === 0 && originalUri.length > prefixUri.length) {
      prefixes[prefixName] = prefixUri;
      console.log(prefixName, prefixUri);
      d3.select("#add-prefix-dialog").style('display', 'none');
      changedCallback && changedCallback();
    }
  });
  $('#add-prefix-dialog-cancel').on('click', function () {
    console.log(d3.select("#add-prefix-dialog").datum());
    d3.select("#add-prefix-dialog").style('display', 'none');
  });
}

function peelUri(uri) {
  return (uri.length > 2 && uri[0] === '<') ? uri.substring(1, uri.length - 1) : uri;
}

export function openAddPrefixDialog(uri) {
  d3.select('#add-prefix-dialog-name').property('value', '');
  d3.select('#add-prefix-dialog-uri').property('value', peelUri(uri));
  d3.select("#add-prefix-dialog").style('display', 'inherit').datum(peelUri(uri));
  d3.select('#add-prefix-dialog-name').node().focus();
}

export function loadPrefixes(prefixes, url='prefixes') {
  return new Promise(function(fulfill, reject) {
    d3.json(url, function(json) {
      if (json) {
        console.log(arguments);
        for (let key in json) {
          prefixes[key] = json[key];
        }
        fulfill(json);
      } else {
        reject();
      }
    });
  });
}

export function savePrefixes(prefixes, url='prefixes') {
  let obj = {};
  Object.keys(prefixes).forEach(function(key) {
    obj[key] = prefixes[key];
  });

  var xhr = new XMLHttpRequest();
  xhr.onload = function () {
    if (onReady != undefined) {
      console.log(this.responseText);
    }
  };
  xhr.open("post", url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(JSON.stringify(obj));
}
