"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
require('./index.unit')({
    name: 'with driver "ioredis"',
    redis: new ioredis_1.default(),
});
//# sourceMappingURL=ioredis.unit.js.map