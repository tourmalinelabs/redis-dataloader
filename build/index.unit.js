"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = __importDefault(require("lodash"));
const chai_1 = __importStar(require("chai"));
const bluebird_1 = __importDefault(require("bluebird"));
const index_1 = __importDefault(require("./index"));
chai_1.default.use(require('chai-as-promised'));
const sinon = require('sinon');
const DataLoader = require('dataloader');
const self = {};
module.exports = ({ name, redis }) => {
    const RedisDataLoader = index_1.default({
        redis
    });
    describe(name, () => {
        beforeEach(() => {
            const rDel = key => new bluebird_1.default((resolve, reject) => redis.del(key, (err, resp) => (err ? reject(err) : resolve(resp))));
            self.rSet = (k, v) => new bluebird_1.default((resolve, reject) => redis.set(k, v, (err, resp) => (err ? reject(err) : resolve(resp))));
            self.rGet = k => new bluebird_1.default((resolve, reject) => {
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
            lodash_1.default.each(self.data, (v, k) => {
                self.loadFn.withArgs(k).returns(bluebird_1.default.resolve(v));
            });
            self.loadFn
                .withArgs(sinon.match({
                a: 1,
                b: 2
            }))
                .returns(bluebird_1.default.resolve({
                bar: 'baz'
            }));
            self.loadFn.withArgs(sinon.match([1, 2])).returns(bluebird_1.default.resolve({
                ball: 'bat'
            }));
            self.userLoader = () => new DataLoader(keys => bluebird_1.default.map(keys, self.loadFn), {
                cache: false
            });
            return bluebird_1.default.map(lodash_1.default.keys(self.data).concat(['{"a":1,"b":2}', '[1,2]']), k => rDel(`${self.keySpace}:${k}`)).then(() => {
                self.loader = new RedisDataLoader(self.keySpace, self.userLoader());
                self.noCacheLoader = new RedisDataLoader(self.keySpace, self.userLoader(), {
                    cache: false
                });
            });
        });
        afterEach(() => {
            lodash_1.default.each(self.stubs, s => s.restore());
        });
        describe('load', () => {
            it('should load json value', () => self.loader.load('json').then(data => {
                chai_1.expect(data).to.deep.equal(self.data.json);
            }));
            it('should allow for object key', () => self.loader
                .load({
                a: 1,
                b: 2
            })
                .then(data => {
                chai_1.expect(data).to.deep.equal({
                    bar: 'baz'
                });
                return self.rGet(`${self.keySpace}:{"a":1,"b":2}`);
            })
                .then(data => {
                chai_1.expect(JSON.parse(data)).to.deep.equal({
                    bar: 'baz'
                });
            }));
            it('should ignore key order on object key', () => self.loader
                .load({
                b: 2,
                a: 1
            })
                .then(data => {
                chai_1.expect(data).to.deep.equal({
                    bar: 'baz'
                });
                return self.rGet(`${self.keySpace}:{"a":1,"b":2}`);
            })
                .then(data => {
                chai_1.expect(JSON.parse(data)).to.deep.equal({
                    bar: 'baz'
                });
            }));
            it('should handle key that is array', () => self.loader
                .load([1, 2])
                .then(data => {
                chai_1.expect(data).to.deep.equal({
                    ball: 'bat'
                });
                return self.rGet(`${self.keySpace}:[1,2]`);
            })
                .then(data => {
                chai_1.expect(JSON.parse(data)).to.deep.equal({
                    ball: 'bat'
                });
            }));
            it('should require key', () => chai_1.expect(self.loader.load()).to.be.rejectedWith(TypeError));
            it('should use local cache on second load', () => {
                self.stubs.redisMGet = sinon
                    .stub(redis, 'mget')
                    .callsFake((keys, cb) => {
                    cb(null, [JSON.stringify(self.data.json)]);
                });
                return self.loader
                    .load('json')
                    .then(data => {
                    chai_1.expect(self.loadFn.callCount).to.equal(0);
                    chai_1.expect(self.stubs.redisMGet.callCount).to.equal(1);
                    return self.loader.load('json');
                })
                    .then(data => {
                    chai_1.expect(self.loadFn.callCount).to.equal(0);
                    chai_1.expect(self.stubs.redisMGet.callCount).to.equal(1);
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
                    chai_1.expect(self.loadFn.callCount).to.equal(0);
                    chai_1.expect(self.stubs.redisMGet.callCount).to.equal(1);
                    return self.noCacheLoader.load('json');
                })
                    .then(data => {
                    chai_1.expect(self.loadFn.callCount).to.equal(0);
                    chai_1.expect(self.stubs.redisMGet.callCount).to.equal(2);
                });
            });
            it('should load null values', () => self.loader
                .load('null')
                .then(data => {
                chai_1.expect(data).to.be.null;
                return self.loader.load('null');
            })
                .then(data => {
                chai_1.expect(data).to.be.null;
            }));
            it('should handle redis cacheing of null values', () => self.noCacheLoader
                .load('null')
                .then(data => {
                chai_1.expect(data).to.be.null;
                return self.noCacheLoader.load('null');
            })
                .then(data => {
                chai_1.expect(data).to.be.null;
            }));
            it('should handle redis key expiration if set', done => {
                const loader = new RedisDataLoader(self.keySpace, self.userLoader(), {
                    cache: false,
                    expire: 1
                });
                loader
                    .load('json')
                    .then(data => {
                    chai_1.expect(data).to.deep.equal(self.data.json);
                    setTimeout(() => {
                        loader
                            .load('json')
                            .then(data => {
                            chai_1.expect(data).to.deep.equal(self.data.json);
                            chai_1.expect(self.loadFn.callCount).to.equal(2);
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
                    chai_1.expect(data).to.be.instanceof(Date);
                    chai_1.expect(data.getTime()).to.equal(100);
                });
            });
        });
        describe('loadMany', () => {
            it('should load multiple keys', () => self.loader.loadMany(['json', 'null']).then(results => {
                chai_1.expect(results).to.deep.equal([self.data.json, self.data.null]);
            }));
            it('should handle object key', () => self.loader
                .loadMany([
                {
                    a: 1,
                    b: 2
                }
            ])
                .then(results => {
                chai_1.expect(results).to.deep.equal([
                    {
                        bar: 'baz'
                    }
                ]);
            }));
            it('should handle empty array', () => self.loader.loadMany([]).then(results => {
                chai_1.expect(results).to.deep.equal([]);
            }));
            it('should require array', () => chai_1.expect(self.loader.loadMany()).to.be.rejectedWith(TypeError));
            it('should handle custom cacheKeyFn', () => {
                const loader = new RedisDataLoader(self.keySpace, self.userLoader(), {
                    cacheKeyFn: key => `foo-${key}`
                });
                loader.loadMany(['json', 'null']).then(results => {
                    chai_1.expect(results).to.deep.equal([self.data.json, self.data.null]);
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
                    chai_1.expect(self.loadFn.callCount).to.equal(0);
                    chai_1.expect(self.stubs.redisMGet.args[0][0]).to.deep.equal([
                        'key-space:foo-json'
                    ]);
                    chai_1.expect(self.stubs.redisMGet.callCount).to.equal(1);
                    return loader.loadMany(['json']);
                })
                    .then(data => {
                    chai_1.expect(self.loadFn.callCount).to.equal(0);
                    chai_1.expect(self.stubs.redisMGet.callCount).to.equal(1);
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
                chai_1.expect(data).to.deep.equal({
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
                chai_1.expect(data).to.deep.equal({
                    new: 'val'
                });
            }));
            it('should handle primeing without local cache', () => self.noCacheLoader
                .prime('json', {
                new: 'value'
            })
                .then(() => self.noCacheLoader.load('json'))
                .then(data => {
                chai_1.expect(data).to.deep.equal({
                    new: 'value'
                });
            }));
            it('should require key', () => chai_1.expect(self.loader.prime(undefined, {
                new: 'value'
            })).to.be.rejectedWith(TypeError));
            it('should require value', () => chai_1.expect(self.loader.prime('json')).to.be.rejectedWith(TypeError));
            it('should allow null for value', () => self.loader
                .prime('json', null)
                .then(() => self.loader.load('json'))
                .then(data => {
                chai_1.expect(data).to.be.null;
            }));
        });
        describe('clear', () => {
            it('should clear cache', () => self.loader
                .load('json')
                .then(() => self.loader.clear('json'))
                .then(() => self.loader.load('json'))
                .then(data => {
                chai_1.expect(data).to.deep.equal(self.data.json);
                chai_1.expect(self.loadFn.callCount).to.equal(2);
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
                chai_1.expect(data).to.deep.equal({
                    bar: 'baz'
                });
                chai_1.expect(self.loadFn.callCount).to.equal(2);
            }));
            it('should require a key', () => chai_1.expect(self.loader.clear()).to.be.rejectedWith(TypeError));
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
                chai_1.expect(data).to.deep.equal([
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
                chai_1.expect(data).to.deep.equal([
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