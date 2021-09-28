const Redis = require('ioredis');
require('./index.unit')({
    name: 'with driver "ioredis"',
    redis: new Redis(),
});
//# sourceMappingURL=ioredis.unit.js.map