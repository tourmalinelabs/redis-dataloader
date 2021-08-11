"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require('lodash');
const Promise = require('bluebird');
const chai = require('chai');
chai.use(require('chai-as-promised'));
const { expect } = chai;
const sinon = require('sinon');
const DataLoader = require('dataloader');
const createRedisDataLoader = require('./index');
const self = {};
module.exports = ({ name, redis }) => {
    const RedisDataLoader = createRedisDataLoader({
        redis
    });
    describe(name, () => {
        beforeEach(() => {
            const rDel = key => new Promise((resolve, reject) => redis.del(key, (err, resp) => (err ? reject(err) : resolve(resp))));
            self.rSet = (k, v) => new Promise((resolve, reject) => redis.set(k, v, (err, resp) => (err ? reject(err) : resolve(resp))));
            self.rGet = k => new Promise((resolve, reject) => {
                redis.get(k, (err, resp) => (err ? reject(err) : resolve(resp)));
            });
            self.keySpace = 'key-space';
            self.data = {
                json: {
                    foo: 'bar'
                },
                null: null
            };
            self.stubs = {};
            self.loadFn = sinon.stub();
            _.each(self.data, (v, k) => {
                self.loadFn.withArgs(k).returns(Promise.resolve(v));
            });
            self.loadFn
                .withArgs(sinon.match({
                a: 1,
                b: 2
            }))
                .returns(Promise.resolve({
                bar: 'baz'
            }));
            self.loadFn.withArgs(sinon.match([1, 2])).returns(Promise.resolve({
                ball: 'bat'
            }));
            self.userLoader = () => new DataLoader(keys => Promise.map(keys, self.loadFn), {
                cache: false
            });
            return Promise.map(_.keys(self.data).concat(['{"a":1,"b":2}', '[1,2]']), k => rDel(`${self.keySpace}:${k}`)).then(() => {
                self.loader = new RedisDataLoader(self.keySpace, self.userLoader());
                self.noCacheLoader = new RedisDataLoader(self.keySpace, self.userLoader(), {
                    cache: false
                });
            });
        });
        afterEach(() => {
            _.each(self.stubs, s => s.restore());
        });
        describe('load', () => {
            it('should load json value', () => self.loader.load('json').then(data => {
                expect(data).to.deep.equal(self.data.json);
            }));
            it('should allow for object key', () => self.loader
                .load({
                a: 1,
                b: 2
            })
                .then(data => {
                expect(data).to.deep.equal({
                    bar: 'baz'
                });
                return self.rGet(`${self.keySpace}:{"a":1,"b":2}`);
            })
                .then(data => {
                expect(JSON.parse(data)).to.deep.equal({
                    bar: 'baz'
                });
            }));
            it('should ignore key order on object key', () => self.loader
                .load({
                b: 2,
                a: 1
            })
                .then(data => {
                expect(data).to.deep.equal({
                    bar: 'baz'
                });
                return self.rGet(`${self.keySpace}:{"a":1,"b":2}`);
            })
                .then(data => {
                expect(JSON.parse(data)).to.deep.equal({
                    bar: 'baz'
                });
            }));
            it('should handle key that is array', () => self.loader
                .load([1, 2])
                .then(data => {
                expect(data).to.deep.equal({
                    ball: 'bat'
                });
                return self.rGet(`${self.keySpace}:[1,2]`);
            })
                .then(data => {
                expect(JSON.parse(data)).to.deep.equal({
                    ball: 'bat'
                });
            }));
            it('should require key', () => expect(self.loader.load()).to.be.rejectedWith(TypeError));
            it('should use local cache on second load', () => {
                self.stubs.redisMGet = sinon
                    .stub(redis, 'mget')
                    .callsFake((keys, cb) => {
                    cb(null, [JSON.stringify(self.data.json)]);
                });
                return self.loader
                    .load('json')
                    .then(data => {
                    expect(self.loadFn.callCount).to.equal(0);
                    expect(self.stubs.redisMGet.callCount).to.equal(1);
                    return self.loader.load('json');
                })
                    .then(data => {
                    expect(self.loadFn.callCount).to.equal(0);
                    expect(self.stubs.redisMGet.callCount).to.equal(1);
                });
            });
            it('should not use in memory cache if option is passed', () => {
                self.stubs.redisMGet = sinon
                    .stub(redis, 'mget')
                    .callsFake((keys, cb) => {
                    cb(null, [JSON.stringify(self.data.json)]);
                });
                return self.noCacheLoader
                    .load('json')
                    .then(data => {
                    expect(self.loadFn.callCount).to.equal(0);
                    expect(self.stubs.redisMGet.callCount).to.equal(1);
                    return self.noCacheLoader.load('json');
                })
                    .then(data => {
                    expect(self.loadFn.callCount).to.equal(0);
                    expect(self.stubs.redisMGet.callCount).to.equal(2);
                });
            });
            it('should load null values', () => self.loader
                .load('null')
                .then(data => {
                expect(data).to.be.null;
                return self.loader.load('null');
            })
                .then(data => {
                expect(data).to.be.null;
            }));
            it('should handle redis cacheing of null values', () => self.noCacheLoader
                .load('null')
                .then(data => {
                expect(data).to.be.null;
                return self.noCacheLoader.load('null');
            })
                .then(data => {
                expect(data).to.be.null;
            }));
            it('should handle redis key expiration if set', done => {
                const loader = new RedisDataLoader(self.keySpace, self.userLoader(), {
                    cache: false,
                    expire: 1
                });
                loader
                    .load('json')
                    .then(data => {
                    expect(data).to.deep.equal(self.data.json);
                    setTimeout(() => {
                        loader
                            .load('json')
                            .then(data => {
                            expect(data).to.deep.equal(self.data.json);
                            expect(self.loadFn.callCount).to.equal(2);
                            done();
                        })
                            .done();
                    }, 1100);
                })
                    .catch(done)
                    .done();
            });
            it('should handle custom serialize and deserialize method', () => {
                const loader = new RedisDataLoader(self.keySpace, self.userLoader(), {
                    serialize: v => 100,
                    deserialize: v => new Date(Number(v))
                });
                return loader.load('json').then(data => {
                    expect(data).to.be.instanceof(Date);
                    expect(data.getTime()).to.equal(100);
                });
            });
        });
        describe('loadMany', () => {
            it('should load multiple keys', () => self.loader.loadMany(['json', 'null']).then(results => {
                expect(results).to.deep.equal([self.data.json, self.data.null]);
            }));
            it('should handle object key', () => self.loader
                .loadMany([
                {
                    a: 1,
                    b: 2
                }
            ])
                .then(results => {
                expect(results).to.deep.equal([
                    {
                        bar: 'baz'
                    }
                ]);
            }));
            it('should handle empty array', () => self.loader.loadMany([]).then(results => {
                expect(results).to.deep.equal([]);
            }));
            it('should require array', () => expect(self.loader.loadMany()).to.be.rejectedWith(TypeError));
            it('should handle custom cacheKeyFn', () => {
                const loader = new RedisDataLoader(self.keySpace, self.userLoader(), {
                    cacheKeyFn: key => `foo-${key}`
                });
                loader.loadMany(['json', 'null']).then(results => {
                    expect(results).to.deep.equal([self.data.json, self.data.null]);
                });
            });
            it('should use local cache on second load when using custom cacheKeyFn', () => {
                self.stubs.redisMGet = sinon
                    .stub(redis, 'mget')
                    .callsFake((keys, cb) => {
                    cb(null, [JSON.stringify(self.data.json)]);
                });
                const loader = new RedisDataLoader(self.keySpace, self.userLoader(), {
                    cacheKeyFn: key => `foo-${key}`
                });
                return loader
                    .loadMany(['json'])
                    .then(data => {
                    expect(self.loadFn.callCount).to.equal(0);
                    expect(self.stubs.redisMGet.args[0][0]).to.deep.equal([
                        'key-space:foo-json'
                    ]);
                    expect(self.stubs.redisMGet.callCount).to.equal(1);
                    return loader.loadMany(['json']);
                })
                    .then(data => {
                    expect(self.loadFn.callCount).to.equal(0);
                    expect(self.stubs.redisMGet.callCount).to.equal(1);
                });
            });
        });
        describe('prime', () => {
            it('should set cache', () => self.loader
                .prime('json', {
                new: 'value'
            })
                .then(() => self.loader.load('json'))
                .then(data => {
                expect(data).to.deep.equal({
                    new: 'value'
                });
            }));
            it('should handle object key', () => self.loader
                .prime({
                a: 1,
                b: 2
            }, {
                new: 'val'
            })
                .then(() => self.loader.load({
                a: 1,
                b: 2
            }))
                .then(data => {
                expect(data).to.deep.equal({
                    new: 'val'
                });
            }));
            it('should handle primeing without local cache', () => self.noCacheLoader
                .prime('json', {
                new: 'value'
            })
                .then(() => self.noCacheLoader.load('json'))
                .then(data => {
                expect(data).to.deep.equal({
                    new: 'value'
                });
            }));
            it('should require key', () => expect(self.loader.prime(undefined, {
                new: 'value'
            })).to.be.rejectedWith(TypeError));
            it('should require value', () => expect(self.loader.prime('json')).to.be.rejectedWith(TypeError));
            it('should allow null for value', () => self.loader
                .prime('json', null)
                .then(() => self.loader.load('json'))
                .then(data => {
                expect(data).to.be.null;
            }));
        });
        describe('clear', () => {
            it('should clear cache', () => self.loader
                .load('json')
                .then(() => self.loader.clear('json'))
                .then(() => self.loader.load('json'))
                .then(data => {
                expect(data).to.deep.equal(self.data.json);
                expect(self.loadFn.callCount).to.equal(2);
            }));
            it('should handle object key', () => self.loader
                .load({
                a: 1,
                b: 2
            })
                .then(() => self.loader.clear({
                a: 1,
                b: 2
            }))
                .then(() => self.loader.load({
                a: 1,
                b: 2
            }))
                .then(data => {
                expect(data).to.deep.equal({
                    bar: 'baz'
                });
                expect(self.loadFn.callCount).to.equal(2);
            }));
            it('should require a key', () => expect(self.loader.clear()).to.be.rejectedWith(TypeError));
        });
        describe('clearAllLocal', () => {
            it('should clear all local in-memory cache', () => self.loader
                .loadMany(['json', 'null'])
                .then(() => self.loader.clearAllLocal())
                .then(() => self.rSet(`${self.keySpace}:json`, JSON.stringify({
                new: 'valeo'
            })))
                .then(() => self.rSet(`${self.keySpace}:null`, JSON.stringify({
                foo: 'bar'
            })))
                .then(() => self.loader.loadMany(['null', 'json']))
                .then(data => {
                expect(data).to.deep.equal([
                    {
                        foo: 'bar'
                    },
                    {
                        new: 'valeo'
                    }
                ]);
            }));
        });
        describe('clearLocal', () => {
            it('should clear local cache for a specific key', () => self.loader
                .loadMany(['json', 'null'])
                .then(() => self.loader.clearLocal('json'))
                .then(() => self.rSet(`${self.keySpace}:json`, JSON.stringify({
                new: 'valeo'
            })))
                .then(() => self.rSet(`${self.keySpace}:null`, JSON.stringify({
                foo: 'bar'
            })))
                .then(() => self.loader.loadMany(['null', 'json']))
                .then(data => {
                expect(data).to.deep.equal([
                    null,
                    {
                        new: 'valeo'
                    }
                ]);
            }));
        });
    });
};
//# sourceMappingURL=index.unit.js.map