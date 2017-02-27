var path = require('path');
var http = require('request');
var fs = require('fs');
var bodyParser = require('body-parser')
var express = require('express');
var app = express();

var port = 3015;
var useCache = false;

if (process.env.dev) {
  var webpackDevMiddleware = require("webpack-dev-middleware");
  var webpack = require("webpack");
  var config = require("./webpack.config.js");
  app.use(webpackDevMiddleware(webpack(config), {}));
}

app.use(bodyParser.json());

// return web application page
app.use('/diagrams/:id/edit', function(request, response, next) {
  if (request.method === 'GET') {
    if (acceptsWithParam('html', request) === 'html') {
      addAntiCacheHeaders(response);
      return express.static(path.resolve('./app'))(request, response, next);
    }
  }
  return next();
});

// diagram file read/update/delete
app.use('/diagrams/:id', function(request, response, next) {
  console.log("app.use('/diagrams/:id', ...");
  var id = request.params.id; // get diagram id from URL
  var getPath = () => 'specs/' + id + '.spec';

  if (request.method === 'GET') {
    if (acceptsWithParam('html', request) === 'html') {
      // return diagram web page
      console.log('return diagram web page');
      addAntiCacheHeaders(response);
      return express.static(path.resolve('./app'))(request, response, next);
    } else if (acceptsWithParam('png', request) === 'png') {
      // return diagram png image
      console.log('return diagram png image');
      response.status(404).end('png image not supported yet');
    } else if (acceptsWithParam('json', request) === 'json') {
      // return diagram metadata
      console.log('return diagram metadata');
      fs.readFile(getPath(), (err, data) => {
        if (err) {
          if (err.code && err.code === 'ENOENT') {
            response.status(404).send(err.message);
          } else {
            response.status(500).send(err.message);
          }
        } else {
          response.type('application/json');
          response.send(data.toString());
        }
      });
    }
  } else if (request.method === 'PUT') {
    // replace diagram file contents with post data
    if (isValidModel(request.body)) {
      fs.writeFile(getPath(), JSON.stringify(request.body, null, '  '), (err) => {
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

    }
  } else if (request.method === 'DELETE') {
    // delete diagram file
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

function isValidModel(model) {
  return model.title
    && typeof model.title === 'string'
    && model.title.length > 0
    && model.spec
    && typeof model.spec === 'string'
    && model.spec.length > 0;
}

// create a new diagram with a random id, and respond with the id
app.post('/diagrams', function(request, response) {
  // generate a random 5 char alphanumeric string
  console.log("app.post('/diagrams', ...");
  function getRandomId() {return (Math.random() + 1).toString(36).substring(7, 12)}
console.log('request.body', request.body);
  function createNew(maxTries) {
    var newId = getRandomId();
    fs.writeFile('specs/' + newId + '.spec', JSON.stringify(request.body), {flag: 'wx'}, (err) => {
      if (err) {
        if (err.code && err.code === 'EEXIST') { // generated filename already exists - try another id
          if (maxTries <= 0) {
            response.status(500).send('cannot find a unique spec file name');
          } else {
            createNew(maxTries - 1);
          }
        } else {
          response.status(500).send(err.message);
        }
      } else {
        response.type('application/json');
        response.send({id: newId});
      }
    });
  }

  createNew(100); // create a new diagram file - try at most 100 random names, to get an unused one
});


app.use('/diagrams', function(request, response, next) {
  console.log("app.use('/diagrams', ...");
  console.log('accept:', request.get('accept'));
  if (acceptsWithParam('html', request) === 'html') {
    // return diagram list page
    console.log('return diagram list page');
    addAntiCacheHeaders(response);
    return express.static(path.resolve('./app'))(request, response, next);
  } else if (acceptsWithParam('json', request) === 'json') {
    // return json list of all saved diagrams
    console.log('return json list of all saved diagrams');
    fs.readdir('specs', (err, filenames) => {
      if (err) {
        if (err.code && err.code === 'ENOENT') {
          response.status(404).send(err.message);
        } else {
          response.status(500).send(err.message);
        }
      } else {
        // read all files in order to get their title, and add object containing name and title to array
        Promise.all(filenames.map(filename => new Promise(function(fulfill, fail) {
          fs.readFile('specs/' + filename, function(err, data) {
            if (err) {
              console.error('read file err', err);
              fail(err);
            } else {
              var fileContent = JSON.parse(data);
              fulfill({id: filename.substring(0, filename.length - 5), filename: filename, title: fileContent.title});
            }
          })
        })))
        .then(function(fileInfoList) {
          // read file change date and add to info
          return Promise.all(fileInfoList.map(fileInfo => new Promise(function(fulfill, fail) {
            fs.stat('specs/' + fileInfo.filename, function(err, stats) {
              if (err) {
                console.error('stat err', err);
                fail(err);
              } else {
                fileInfo.mtime = stats.mtime.getTime();
                fulfill(fileInfo);
              }
            })
          })));
        })
        .then(function(fileInfoList) {
          console.log('fileInfoList', fileInfoList);
          response.send(fileInfoList);
        });
      }
    });
  }
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
  addAntiCacheHeaders(response);
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

app.use('/', function(request, response, next) {
  if (request.path === '/') {
    response.redirect('/diagrams');
  } else {
    next();
  }
});

app.use('/', function(request, response, next) {
  addAntiCacheHeaders(response);
  return express.static(path.resolve('./app'))(request, response, next);
});

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

// sets response headers to prevent caching of pages
function addAntiCacheHeaders(response) {
  response.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.header('Pragma', 'no-cache');
  response.header('Expires', '0');
}

// check if type is accepted by the request sender
// to simplify debugging, the query parameter accept=html, json or png etc can be used to simulate Accept header
function acceptsWithParam(type, request) {
  var acceptQParam = request.query.accept;
  console.log('query.accept:', acceptQParam);
  if (acceptQParam) {
    if (acceptQParam === type || (type.indexOf && type.indexOf(acceptQParam) !== -1)) {
      return type;
    }
  } else {
    return request.accepts(type);
  }
}
