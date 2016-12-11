var express = require('express');
var webpackDevMiddleware = require("webpack-dev-middleware");
var webpack = require("webpack");
var config = require("./webpack.config.js");
var path = require('path');
var http = require('request');
var fs = require('fs');
var bodyParser = require('body-parser')

var port = 3015;
var useCache = false;

var app = express();
app.use(webpackDevMiddleware(webpack(config), {}));

app.use(bodyParser.json());

app.get('/list', function(request, response) {
  // returns a JSON list of metadata for all saved diagrams
  fs.readdir('specs', (err, files) => {
    if (err) {
      if (err.code && err.code === 'ENOENT') {
        response.status(404).send(err.message);
      } else {
        response.status(500).send(err.message);
      }
    } else {
      response.send(files.map(fileName => fileName.substring(0, fileName.length - 5)));
    }
  });
});

app.all('/:id/spec', function(request, response) {
  var id = request.params.id;
  var getPath = () => 'specs/' + id + '.spec';
  if (request.method === 'GET') {
    fs.readFile(getPath(), (err, data) => {
      if (err) {
        if (err.code && err.code === 'ENOENT') {
          response.status(404).send(err.message);
        } else {
          response.status(500).send(err.message);
        }
      } else {
        response.type('text/plain');
        response.send(data);
      }
    });
  } else if (request.method === 'PUT') {
    fs.writeFile(getPath(), request.body.specText, (err) => {
      if (err) {
        if (err.code && err.code === 'ENOENT') {
          response.status(404).send(err.message);
        } else {
          response.status(500).send(err.message);
        }
      } else {
        response.status(204).end();
      }
    });
  } else if (request.method === 'DELETE') {
    fs.unlink(getPath(), function(err) {
      if (err) {
        if (err.code && err.code === 'ENOENT') {
          response.status(404).send(err.message);
        } else {
          response.status(500).send(err.message);
        }
      }
      response.status(204).end();
    });
  } else {
    response.status(405).send('Method Not Allowed');
  }
});

app.post('/', function(request, response) {
  // generate a random 5 char alphanumeric string
  function getRandomId() {return (Math.random() + 1).toString(36).substring(7, 12)}

  function createNew(maxTries) {
    var newId = getRandomId();
    fs.writeFile('specs/' + newId + '.spec', request.body.specText, {flag: 'wx'}, (err) => {
      if (err) {
        if (err.code && err.code === 'EEXIST') {
          if (maxTries <= 0) {
            response.status(500).send('cannot find a unique spec file name');
          } else {
            createNew(maxTries - 1);
          }
        } else {
          response.status(500).send(err.message);
        }
      } else {
        response.send(newId);
      }
    });
  }

  createNew(100);
});

// respond with specifications json
app.get('/mappingspecs', function(request, response) {
  console.log('GET /mappingspecs');
  try {
    var text = fs.readFileSync('mappingspecs.json');
    var textJson = JSON.parse(text);
    response.send(text);
  } catch (e) {
    response.send(500, 'no valid mappingspecs.json found');
  }
});

// save posted mapingsspecs json object
app.post('/mappingspecs', function(request, response) {
  console.log('POST /mappingspecs');
  fs.writeFileSync('mappingspecs.json', JSON.stringify(request.body, null, '  '));
  response.sendStatus(200);
});

// respond with prefixes json
app.get('/prefixes', function(request, response) {
  try {
    var prefixesText = fs.readFileSync('prefixes.json');
    var prefixes = JSON.parse(prefixesText);
    response.send(prefixesText);
  } catch (e) {
    response.send(500, 'no valid prefixes found');
  }
});

// save posted prefixes json object
app.post('/prefixes', function(request, response) {
  fs.writeFileSync('prefixes.json', JSON.stringify(request.body, null, '  '));
});

// /proxy?url=<URL> makes a request to URL and forwards headers authorization
// and accept outgoing, and all headers incoming, which makes the proxy support
// basic authentication between browser and remote service.
app.get('/proxy', function (request, response) {
  console.log('get /proxy');
  response.header('Access-Control-Allow-Origin', '*');
  response.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.header('Pragma', 'no-cache');
  response.header('Expires', '0');
  if (useCache) {
    response.header('Content-Type', 'application/xml');
    response.send(getFromCache(request.query.url));
  } else {
    http.get({
      url: request.query.url,
      headers: copyHeaders(request.headers, ['authorization', 'accept'])
    }, function (error, resp, body) {
      if (error) {
        console.error(error);
      } else {
        // copy all headers from resp to response
        for (var key in resp.headers) {
          response.header(key, resp.headers[key]);
        }
        response.status(resp.statusCode).send(body);
      }
    });
  }
});

app.use('/', express.static(path.resolve('./app')));

// returns an object containing non-empty headers
// in headerNameList copied from srcHeaders
function copyHeaders(srcHeaders, headerNameList) {
  toHeaders = {};
  for (var namei in headerNameList) {
    var name = headerNameList[namei];
    if (srcHeaders[name]) {
      toHeaders[name] = srcHeaders[name];
    }
  }
  return toHeaders;
}

app.listen(port, function () {
  console.log('listening at localhost:' + port);
});

var cacheFolder = 'cache';
if (!fs.existsSync(cacheFolder)) {
  fs.mkdirSync(cacheFolder);
}

function saveToCache(url, result) {
  fs.writeFile(path.join(cacheFolder, encodeURIComponent(url)) + '.xml', result, 'utf8');
}
function getFromCache(url) {
  return fs.readFileSync(path.join(cacheFolder, encodeURIComponent(url)) + '.xml', 'utf8');
}
