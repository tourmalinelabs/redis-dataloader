require('./index.unit')({
  name: 'with driver "redis"',
  redis: require('redis').createClient(),
});
