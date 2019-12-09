/* eslint-env node */
const express = require('express');
const router = express.Router();
const parse =  require('csv-parse');
const through2 = require('through2');
const fs = require('fs');
const path = require('path');
const JSONStream = require('jsonstream');

/**
 * JSON data API:
 * Access at data/json/shapefilePrefix/
 * URL options:
 * GISJOIN: array of features' GISJOINs to return data for
 * props: array of properties to return for each feature
 * Returns: {[GISJOIN]: { prop1: val1,  prop2: val2 }}
 */


const possibleShapefiles = fs.readdirSync(path.join(__dirname, '../data/shape'));

router.get('/:shapefilePrefix', (req, res) => {
    if (!possibleShapefiles.includes(req.params.shapefilePrefix + '_shape.geojson')) {
        res.status(404).send('Shapefile not found');
        console.log(req.params.shapefilePrefix);
    }
    else if (!req.query.GISJOIN || !req.query.props) {
        res.status(400).send('Must include GISJOIN and props');
    }
    else if (!Array.isArray(req.query.GISJOIN) || !Array.isArray(req.query.props)) {
        res.status(400).send('GISJOIN and props must be arrays');
    }
    else {
        let i = 0;
        let headerRow, propIndices = {};
        fs.createReadStream(path.join(__dirname, '../data/json', req.params.shapefilePrefix + '_data.csv'))
            .pipe(parse())
            .pipe(through2.obj(function(chunk, _enc, cb) {
                // chunk = [][966] from [GISJOIN, ...]
                if (i == 0) {
                    headerRow = chunk;
                    // map props to indexes
                    propIndices = req.query.props.reduce(
                            (acc, prop) => {
                                acc[prop] = headerRow.indexOf(prop);
                                return acc;
                            },
                            propIndices);
                }
                else {
                    // if this feature matches one of the GISJOINs
                    if (req.query.GISJOIN.includes(chunk[0])) {
                        // filter for the appropriate props
                        let propsObj = {};
                        for (let [name, index] of Object.entries(propIndices)) {
                            propsObj[name] = chunk[index];
                        }
                        this.push([chunk[0], propsObj]);
                    }
                }
                i++;
                cb();
            }))
            .pipe(JSONStream.stringifyObject())
            .pipe(res);
    }
});

module.exports = router;