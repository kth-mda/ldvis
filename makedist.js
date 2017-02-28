// removes dist, it present
// then copies to dist, all that is required to run this app independently from the development environment
// in addition webpack has to be run to put bundle.js into dist/app

var fs = require('fs-extra');

// if result is truthy, logs errorTitle and result and exits with code 1
function check(result, errorTitle) {
  if (result) {
    console.error(errorTitle, result);
    process.exit(1);
  }
}

fs.remove('dist', function(err) {
  check(err, 'remove dist');
  fs.mkdirp('dist/app', function(err) {
    check(err, 'make dir dist/app');
    fs.mkdirp('dist/specs', function(err) {
      check(err, 'make dir dist/specs');
      fs.copy('app', 'dist/app', function(err) {
        check(err, 'copy app to dist');
        fs.remove('dist/app/js', function(err) {
          check(err, 'remove dist/app/js');
          fs.copy('specs', 'dist/specs', function(err) {
            check(err, 'copy specs to dist');
            fs.copy('server.js', 'dist/server.js', function(err) {
              check(err, 'copy server.js to dist');
              process.exit(0);
            })
          })
        })
      })
    })
  })
})
