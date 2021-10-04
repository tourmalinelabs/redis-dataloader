"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = __importDefault(require("lodash"));
const bluebird_1 = __importDefault(require("bluebird"));
const dataloader_1 = __importDefault(require("dataloader"));
const stringify = require('json-stable-stringify');
const IORedis = require('ioredis');
const redisDataLoader = fig => {
    const redis = fig.redis;
    const isIORedis = redis instanceof IORedis;
    const parse = (resp, opt) => new bluebird_1.default((resolve, reject) => {
        try {
            if (resp === '' || resp === null) {
                resolve(resp);
            }
            else if (opt.deserialize) {
                resolve(opt.deserialize(resp));
            }
            else {
                resolve(JSON.parse(resp));
            }
        }
        catch (err) {
            reject(err);
        }
    });
    const toString = (val, opt) => {
        if (val === null) {
            return bluebird_1.default.resolve('');
        }
        else if (opt.serialize) {
            return bluebird_1.default.resolve(opt.serialize(val));
        }
        else if (lodash_1.default.isObject(val)) {
            return bluebird_1.default.resolve(JSON.stringify(val));
        }
        else {
            return bluebird_1.default.reject(new Error('Must be Object or Null'));
        }
    };
    const makeKey = (keySpace, key, cacheKeyFn) => `${keySpace}:${cacheKeyFn(key)}`;
    const rSetAndGet = (keySpace, key, rawVal, opt) => toString(rawVal, opt).then(val => new bluebird_1.default((resolve, reject) => {
        const fullKey = makeKey(keySpace, key, opt.cacheKeyFn);
        const multi = redis.multi();
        multi.set(fullKey, val);
        if (opt.expire) {
            multi.expire(fullKey, opt.expire);
        }
        multi.get(fullKey);
        multi.exec((err, replies) => {
            const lastReply = isIORedis
                ? lodash_1.default.last(lodash_1.default.last(replies))
                : lodash_1.default.last(replies);
            return err ? reject(err) : parse(lastReply, opt).then(resolve);
        });
    }));
    const rGet = (keySpace, key, opt) => new bluebird_1.default((resolve, reject) => redis.get(makeKey(keySpace, key, opt.cacheKeyFn), (err, result) => err ? reject(err) : parse(result, opt).then(resolve)));
    const rMGet = (keySpace, keys, opt) => new bluebird_1.default((resolve, reject) => redis.mget(lodash_1.default.map(keys, k => makeKey(keySpace, k, opt.cacheKeyFn)), (err, results) => {
        return err
            ? reject(err)
            : bluebird_1.default.map(results, r => parse(r, opt)).then(resolve);
    }));
    const rDel = (keySpace, key, opt) => new bluebird_1.default((resolve, reject) => redis.del(makeKey(keySpace, key, opt.cacheKeyFn), (err, resp) => err ? reject(err) : resolve(resp)));
    return class RedisDataLoader {
        constructor(ks, userLoader, opt = {}) {
            const customOptions = [
                'expire',
                'serialize',
                'deserialize',
                'cacheKeyFn'
            ];
            this.opt = lodash_1.default.pick(opt, customOptions) || {};
            this.opt.cacheKeyFn =
                this.opt.cacheKeyFn || (k => (lodash_1.default.isObject(k) ? stringify(k) : k));
            this.keySpace = ks;
            this.loader = new dataloader_1.default(keys => rMGet(this.keySpace, keys, this.opt).then(results => bluebird_1.default.map(results, (v, i) => {
                if (v === '') {
                    return bluebird_1.default.resolve(null);
                }
                else if (v === null) {
                    return userLoader
                        .load(keys[i])
                        .then(resp => rSetAndGet(this.keySpace, keys[i], resp, this.opt))
                        .then(r => (r === '' ? null : r));
                }
                else {
                    return bluebird_1.default.resolve(v);
                }
            })), lodash_1.default.chain(opt)
                .omit(customOptions)
                .extend({
                cacheKeyFn: this.opt.cacheKeyFn
            })
                .value());
        }
        load(key) {
            return key
                ? bluebird_1.default.resolve(this.loader.load(key))
                : bluebird_1.default.reject(new TypeError('key parameter is required'));
        }
        loadMany(keys) {
            return keys
                ? bluebird_1.default.resolve(this.loader.loadMany(keys))
                : bluebird_1.default.reject(new TypeError('keys parameter is required'));
        }
        prime(key, val) {
            if (!key) {
                return bluebird_1.default.reject(new TypeError('key parameter is required'));
            }
            else if (val === undefined) {
                return bluebird_1.default.reject(new TypeError('value parameter is required'));
            }
            else {
                return rSetAndGet(this.keySpace, key, val, this.opt).then(r => {
                    this.loader.clear(key).prime(key, r === '' ? null : r);
                });
            }
        }
        clear(key) {
            return key
                ? rDel(this.keySpace, key, this.opt).then(() => this.loader.clear(key))
                : bluebird_1.default.reject(new TypeError('key parameter is required'));
        }
        clearAllLocal() {
            return bluebird_1.default.resolve(this.loader.clearAll());
        }
        clearLocal(key) {
            return bluebird_1.default.resolve(this.loader.clear(key));
        }
    };
};
module.exports = redisDataLoader;
exports.default = redisDataLoader;
//# sourceMappingURL=index.js.map