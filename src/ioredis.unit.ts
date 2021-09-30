import Redis from 'ioredis';
require('./index.unit')({
  name: 'with driver "ioredis"',
  redis: new Redis(),
});
