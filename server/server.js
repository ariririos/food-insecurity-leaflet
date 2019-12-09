/* eslint-env node */
const express = require('express');
const path = require('path');
// const dataRoute = require('./routes/data');
// const shapeRoute = require('./routes/shape');
const joinRoute = require('./routes/join');
// const graphqlRoute = require('./routes/graphql');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// app.use('/data/json', dataRoute);
// app.use('/data/shape', shapeRoute);
joinRoute().then(router => app.use('/data/join', router));
// app.use('/data/graphql', graphqlRoute);

app.listen(port, () => console.log('Listening on :' + port));
