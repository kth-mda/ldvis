import PrefixHandler from '../app/js/prefix-handler';
import assert from 'assert';

describe('PrefixHandler', function() {
  describe('create', function() {
    let ph = new PrefixHandler();
    it('should return an object with new', function() {
      assert.ok(ph);
    });
    it('new object should have a shrink method', function() {
      assert.ok(ph.shrink);
    });
  });

  describe('methods', function() {
    let ph = new PrefixHandler();
    ph.add('dbo', 'http://dbpedia.org/ontology/');
    ph.add('dbc', 'http://dbpedia.org/resource/Category/');
    ph.add('dcterms', 'http://purl.org/dc/terms/');
    ph.add('dbp', 'http://dbpedia.org/property/');
    ph.add('dbl', 'http://dbpedia.org/property/more/');

    it('expand should obtain the full uri', function() {
      assert.equal(ph.expand('dbc:qwe/asd'), 'http://dbpedia.org/resource/Category/qwe/asd');
    });
    it('shrink should obtain a short uri using a prefix', function() {
      assert.equal(ph.shrink('http://dbpedia.org/resource/Category/qwe/asd'), 'dbc:qwe/asd');
    });
    it('shrink should use the prefix with the longest matching uri', function() {
      assert.equal(ph.shrink('http://dbpedia.org/property/more/stuff'), 'dbl:stuff');
    });
    it('shrink should still work for shorter uri', function() {
      assert.equal(ph.shrink('http://dbpedia.org/property/grunge'), 'dbp:grunge');
    });
    it('shrink should peel <...> from uri', function() {
      assert.equal(ph.shrink('<http://dbpedia.org/property/grunge>'), 'dbp:grunge');
    });
  });
});
