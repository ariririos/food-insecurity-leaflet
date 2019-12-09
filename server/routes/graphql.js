/* eslint-env node */
/*
const express = require('express');
const router = express.Router();
const graphqlHTTP = require('express-graphql');
const { buildSchema } = require('graphql');
const performJoin = require('./join');

const schema = buildSchema(`
    type Query {
        hello: String
    }
`);

const root = {
    shape: () => {
        return 'Not implemented';
    },
    join: ({ name, ...filterProps }) => {

    }
};

router.use('/', graphqlHTTP({
    schema,
    rootValue: root,
    // graphiql: true
}));

module.exports = router;

*/

/**
 * Example GraphQL queries:
 * {
 *      shape(name: "FL_block_2010", COUNTYA: "111") {
 *          ALAND10
 *      },
 *      join(name: "FL_block_2010", COUNTYA: "111") {
 *          AHY1E001,
 *          AH1PE001
 *      }
 * }
 */
