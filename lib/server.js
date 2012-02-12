(function() {
  'use strict';

  var util = require('util');
  var path = require('path');
  var fs = require('fs');
  var crypto = require('crypto');
  var url = require('url');
  var http = require('http');
  var IncomingForm = require('./incoming-form');

  var CONTENT_TYPES = {
    'css': 'text/css',
    'html': 'text/html',
    'js': 'application/javascript',
    'png': 'image/png'
  };

  function GyazoServer(options) {
    http.Server.call(this);
    options = options || {};
    this.upload_dir = options.upload_dir || '/tmp';
    this.required_id = options.required_id || null;
    this.on('request', this.receiveRequest);
    this.on('close', this.closeServer);
  }
  util.inherits(GyazoServer, http.Server);
  module.exports = GyazoServer;

  (function(proto) {
    var routes = {
      GET: {},
      POST: {}
    };
    routes.GET['/'] = function(request, response) {
      request.url = '/index.html';
      this.receiveRequest(request, response);
    };
    routes.GET['/402-payment-required'] = function(request, response) {
      response.statusCode = 402;
      response.setHeader('Content-type', 'text/plain');
      response.end(url.format({
        protocol: 'http',
        host: request.headers.host,
        pathname: '/'
      }));
    };
    routes.GET['/404-not-found'] = function(request, response) {
      response.statusCode = 404;
      response.setHeader('Content-type', 'text/plain');
      response.end('404 Not found.\n');
    };
    routes.POST['/upload.cgi'] = function(request, response) {
      var self = this;
      var form = new IncomingForm();
      form.parse(request, function(err, fields, files) {
        var id = fields.id || '';
        var imagedata = files.imagedata;
        var hash = crypto.createHash('md5').update(imagedata).digest('hex');
        var filename = hash + '.png';
        if (self.required_id && self.required_id !== id) {
          request.method = 'GET';
          request.url = '/402-payment-required';
          self.receiveRequest(request, response);
          return;
        };
        fs.writeFile(path.join(self.upload_dir, filename), imagedata, function(err) {
          response.setHeader('Content-type', 'text/plain');
          response.end(url.format({
            protocol: 'http',
            host: request.headers.host,
            pathname: '/' + filename
          }));
        });
      });
    };

    proto.receiveRequest = function(request, response) {
      var method = request.method.toUpperCase();
      var p = request.url;
      this._getFunction(method, p).call(this, request, response);
    };

    proto.closeServer = function() {
    };

    proto._getFunction = function(method, p) {
      return routes[method][p] ||
        this._getStaticFile(p) ||
        this._getImageFile(p) ||
        routes.GET['/404-not-found'];
    };

    proto._getStaticFile = function(p) {
      p = path.join(__dirname, 'public', p);
      return this._getFile(p);
    };

    proto._getImageFile = function(p) {
      if (path.extname(p) !== '.png') {
        return false;
      }
      p = path.join(this.upload_dir, p);
      return this._getFile(p);
    };

    proto._getFile = function(p) {
      if (!path.existsSync(p)) {
        return false;
      }
      return function(request, response) {
        fs.readFile(p, function(err, data) {
          var ext = path.extname(p).slice(1);
          response.setHeader('Content-type', CONTENT_TYPES[ext]);
          response.end(data);
        });
      };
    };
  })(GyazoServer.prototype);

  function main() {
    var env = process.env;
    var server = new GyazoServer({
      upload_dir: env.GYAZO_UPLOAD_DIR,
      required_id: env.GYAZO_REQUIRED_ID
    });
    server.on('listening', function() {
      util.puts('Run Server.');
    });
    server.on('request', function(request) {
      util.puts('Request: ' + request.url);
    });
    server.on('close', function() {
      util.puts('Close Server.');
    });
    server.listen(env.GYAZO_PORT || 8080);
  }

  if (require.main === module) {
    main();
  }
})();