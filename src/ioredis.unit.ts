export {};

const Redis = require('ioredis');

require('./index.unit')({
  name: 'with driver "ioredis"',
  redis: new Redis(),
});
