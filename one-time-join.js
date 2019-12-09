/* eslint-env node */
// TODO: = lines to change between different geographies
const _ = require('highland');
const fs = require('fs');
const JSONStream = require('jsonstream');
const csvParse = require('csv-parse');
const through2 = require('through2');
const path = require('path');
const debugFn = require('debug');
const { DEBUG: debug } = process.env;
const geographyName = process.argv[2]; // e.g. "FL_block_2010"
const divisionName = process.argv[3]; // e.g. COUNTYA
const censusShape = fs.createReadStream(path.join(__dirname, `join/shape/${geographyName}_shape_census.geojson`)).pipe(JSONStream.parse('features.*'));
const nhgisShape = fs.createReadStream(path.join(__dirname, `join/shape/${geographyName}_shape_nhgis.geojson`)).pipe(JSONStream.parse('features.*'));
const data = fs.createReadStream(path.join(__dirname, `join/data/${geographyName}_data.csv`)).pipe(csvParse());
let i = 1;

process.stdout.write('Finding difference in Census / NHGIS blocks');
if (debug) process.stdout.write('\n');

// Step 1: Remove water-only blocks from NHGIS data by cross-referencing census data
let censusShapeBlocksBuffer = {}, nhgisShapeBlocksBuffer = {}; // blocks by GEOID10
let censusDeleted = 0, nhgisDeleted = 0;
const diffDebug = debugFn('diffBlocks');
_([censusShape, nhgisShape])
    .map(_)
    .merge()
    .each(function(chunk) {
        i++;
        if (i % 10000 === 0) {
            if (!debug) process.stdout.write('.');
            diffDebug(`Current buffer sizes: census: ${Object.keys(censusShapeBlocksBuffer).length}, nhgis: ${Object.keys(nhgisShapeBlocksBuffer).length}`);
            diffDebug(`Corresponding blocks deleted: census: ${censusDeleted}, nhgis: ${nhgisDeleted}`);
        };
        if (chunk.properties) {
            let { GEOID10 } = chunk.properties;
            if (!GEOID10) GEOID10 = chunk.properties.GEOID;
            if (chunk.properties.GISJOIN && GEOID10) { // nhgis block
                if (censusShapeBlocksBuffer[GEOID10]) { // if corresponding census block
                    delete censusShapeBlocksBuffer[GEOID10];
                    censusDeleted++;
                }
                else {
                    nhgisShapeBlocksBuffer[GEOID10] = chunk;
                }
            }
            else if (GEOID10) { // census block
                if (nhgisShapeBlocksBuffer[GEOID10]) { // if corresponding nhgis block
                    delete nhgisShapeBlocksBuffer[GEOID10];
                    nhgisDeleted++;
                }
                else {
                    censusShapeBlocksBuffer[GEOID10] = chunk;
                }
            }
            else {
                throw new ReferenceError('feature is not a nhgis or census block');
            }
        }
        else {
            throw new ReferenceError('feature missing properties field');
        }
    })
    .errors(err => console.error(err))
    .done(() => {
        diffDebug('Difference between census and nhgis blocks is:');
        diffDebug(Object.keys(censusShapeBlocksBuffer).length - Object.keys(nhgisShapeBlocksBuffer).length, 'elements');
        // console.log(censusShapeBlocksBuffer);
        const GISJOINFromShape = (shape) => {
            if (shape.properties.GISJOIN) { // if nhgis block
                return shape.properties.GISJOIN;
            }
            else if (shape.properties.GEOID10 || shape.properties.GEOID) { // if census block
                if (geographyName == "FL_block_2010") {
                    const { STATEFP10, COUNTYFP10, TRACTCE10, BLOCKCE10 } = shape.properties;
                    return `G${STATEFP10}0${COUNTYFP10}0${TRACTCE10}${BLOCKCE10}`;
                }
                else if (geographyName == "FL_blck_grp_2017") {
                    const { STATEFP, COUNTYFP, TRACTCE, BLKGRPCE } = shape.properties;
                    return `G${STATEFP}0${COUNTYFP}0${TRACTCE}${BLKGRPCE}`;
                }
                // TODO: add condition here for additional geographies
            }
        }
        const diffBlocks = Object.fromEntries(Object.entries(
            Object.assign({}, censusShapeBlocksBuffer, nhgisShapeBlocksBuffer))
                .map(([_k, shape]) => [GISJOINFromShape(shape), true])
            );
        // Free up buffer memory
        censusShapeBlocksBuffer = null;
        nhgisShapeBlocksBuffer = null;
        if (!debug) process.stdout.write('\n');

        process.stdout.write('Performing join' + (divisionName ? (' by ' + divisionName) : ''));
        if (debug) process.stdout.write('\n');


        // Step 2: Join all land data and land blocks
        const dataBuffer = {}, shapeBuffer = {};
        let numDataRows = 0, numShapes = 0, numJoins = 0;
        let headerRow;
        let foundHeaderRow = false;
        const csvColumnsToRemove = Object.fromEntries([ // extraneous stuff
            // not included here: COUNTYA, all census data
            'YEAR', 'REGIONA', 'DIVISIONA', 'STATE', 'STATEA', 'COUNTY', 'COUSUBA', 'PLACEA', 'TRACTA',
            'BLKGRPA', 'BLOCKA', 'CONCITA', 'AIANHHA', 'RES_ONLYA', 'TRUSTA', 'AITSCEA', 'TTRACTA', 'TBLKGRPA', 'ANRCA',
            'CBSAA', 'METDIVA', 'CSAA', 'NECTAA', 'NECTADIVA', 'CNECTAA', 'UAA', 'URBRURALA', 'CDA', 'SLDUA', 'SLDLA',
            'ZCTA5A', 'SUBMCDA', 'SDELMA', 'SDSECA', 'SDUNIA', 'NAME', 'SABINSA',
            'CDCURRA', 'PUMA5A', 'BTTRA', 'BTBGA', 'NAME_E', 'NAME_M'
        ].map(x => [x, true]));
        const shapeColumnsToRemove = Object.fromEntries([ // also extraneous stuff
            // not included here: Shape_Area
            'STATEFP', 'COUNTYFP', 'TRACTCE', 'BLKGRPCE', 'GEOID', 'NAMELSAD', 'MTFCC', 'FUNCSTAT', 'ALAND',
            'AWATER', 'INTPTLAT', 'INTPTLON', 'GISJOIN' /* to not duplicate from csv */, 'Shape_Leng', 'NAME_M'
        ].map(x => [x, true]));
        const joinDebug = debugFn('join');
        let fileWriteStreams = {}; // json will be written to the streams here by their divisionName values
        const nhgisShape2 = fs.createReadStream(path.join(__dirname, `join/shape/${geographyName}_shape_nhgis.geojson`)).pipe(JSONStream.parse('features.*')); // previous stream is already consumed
        _([data, nhgisShape2])
            .map(_)
            .merge()
            .through(through2.obj(function(chunk, _enc, cb) {
                i++;
                if (i % 10000 == 0) {
                    if (!debug) process.stdout.write('.');
                    joinDebug(`Read ${numDataRows} data rows and ${numShapes} shapes, performed ${numJoins} joins`);
                    joinDebug(`Current buffer sizes: data: ${Object.keys(dataBuffer).length}, shape: ${Object.keys(shapeBuffer).length}`);
                }
                if (Array.isArray(chunk)) { // csv chunk
                    if (!foundHeaderRow) { // first row of csv
                        const propNamesByIndex = [];
                        for (let i = 0; i < chunk.length; i++) { // creating a sparse array to keep indexes consistent
                            if (!csvColumnsToRemove[chunk[i]]) {
                                propNamesByIndex[i] = chunk[i];
                            }
                        }
                        headerRow = propNamesByIndex;
                        foundHeaderRow = true;
                        return cb();
                    }
                    numDataRows++;
                    if (chunk[0] in shapeBuffer && !diffBlocks[chunk[0]]) { // if exists matching shape by GISJOIN and is land block
                        const feat = Object.assign({}, shapeBuffer[chunk[0]]);
                        let props = {};
                        // assign props from data chunk (current)
                        for (let i = 0; i < headerRow.length; i++) {
                            if (headerRow[i] !== undefined) props[headerRow[i]] = chunk[i];
                        }
                        // assign props from assoc shape chunk
                        for (let [propName, val] of Object.entries(shapeBuffer[chunk[0]].properties)) {
                            if (!shapeColumnsToRemove[propName]) {
                                props[propName] = val;
                            }
                        }
                        const featWithProps = Object.assign(feat, { properties: props } );
                        this.push(featWithProps);
                        // free up the memory used for the shape
                        delete shapeBuffer[chunk[0]];
                        numJoins++;
                        return cb();
                    }
                    else if (diffBlocks[chunk[0]]) { // if this is a water data block
                        return cb();
                    }
                    else { // no matching feature yet
                        dataBuffer[chunk[0]] = chunk;
                        return cb();
                    }
                }
                else if (chunk.type == 'Feature') { // shape chunk
                    numShapes++;
                    if (chunk.properties.GISJOIN in dataBuffer && headerRow) { // if exists matching data by GISJOIN and we can match props by the headerRow
                        const feat = Object.assign({}, chunk);
                        let props = {};
                        // assign props from assoc data chunk
                        for (let i = 0; i < headerRow.length; i++) {
                            if (headerRow[i] !== undefined) props[headerRow[i]] = dataBuffer[chunk.properties.GISJOIN][i];
                        }
                        // assign props from shape chunk (current)
                        for (let [propName, val] of Object.entries(chunk.properties)) {
                            if (!shapeColumnsToRemove[propName]) {
                                props[propName] = val;
                            }
                        }
                        const featWithProps = Object.assign(feat, { properties:  props });
                        // free up the memory used for the data
                        delete dataBuffer[chunk.properties.GISJOIN];
                        this.push(featWithProps);
                        numJoins++;
                        return cb();
                    }
                    else { // no matching data yet
                        shapeBuffer[chunk.properties.GISJOIN] = chunk;
                        return cb();
                    }
                }
                else { // unknown chunk type
                    throw new ReferenceError('Unknown chunk type');
                }
            }))
            .errors(err => console.error(err))
            .pipe(through2.obj(function(chunk, _enc, cb) {
                if (divisionName) {
                    const propValue = chunk.properties[divisionName];
                    if (!fileWriteStreams[propValue]) {
                        // check if directory structure exists first and create if not
                        try {
                            fs.statSync(path.join(__dirname, `join/output/${geographyName}`));
                        }
                        catch (e) {
                            if (e.code === 'ENOENT') {
                                fs.mkdirSync(path.join(__dirname, `join/output/${geographyName}`));
                            }
                            else {
                                throw e;
                            }
                        }
                        try {
                            fs.statSync(path.join(__dirname, `join/output/${geographyName}/${divisionName}`));
                        }
                        catch (e) {
                            if (e.code === 'ENOENT') {
                                fs.mkdirSync(path.join(__dirname, `join/output/${geographyName}/${divisionName}`));
                            }
                            else {
                                throw e;
                            }
                        }
                        fileWriteStreams[propValue] = fs.createWriteStream(path.join(__dirname, `join/output/${geographyName}/${divisionName}/${propValue}.geojson`));
                        fileWriteStreams[propValue].write('{"type": "FeatureCollection", "features":[');
                        fileWriteStreams[propValue].write(JSON.stringify(chunk));
                    }
                    else {
                        fileWriteStreams[propValue].write(',' + JSON.stringify(chunk));
                    }
                }
                else {
                    if (Object.values(fileWriteStreams).length === 0) {
                        fileWriteStreams = fs.createWriteStream(path.join(__dirname, `join/output/${geographyName}_join.geojson`));
                        fileWriteStreams.write('{"type": "FeatureCollection", "features":[');
                        fileWriteStreams.write(JSON.stringify(chunk));
                    }
                    else {
                        fileWriteStreams.write(',' + JSON.stringify(chunk));
                    }
                }
                cb();
            }))
            .on('finish', () => {
                if (divisionName) {
                    for (let stream of Object.values(fileWriteStreams)) {
                        stream.write(']}');
                        stream.end();
                    }
                }
                else {
                    fileWriteStreams.write(']}');
                    fileWriteStreams.end();
                }
                if (!debug) {
                    process.stdout.write('\n');
                    if (divisionName) {
                        process.stdout.write(`Done! Find joined files at join/output/${geographyName}/${divisionName}/*.geojson\n`);
                    }
                    else {
                        process.stdout.write(`Done! Find joined file at join/output/${geographyName}_join.geojson\n`);
                    }
                }
                else {
                    const dataBufferPath = `join/output/${geographyName}_data_buffer.json`;
                    const shapeBufferPath = `join/output/${geographyName}_shape_buffer.json`;
                    // write data buffer in GeoJSON format:
                    const dataBufferGeoJSON = {
                        type: 'FeatureCollection',
                        features: Object.entries(dataBuffer).map(([GISJOIN, propsArr]) => {
                            return {
                                type: 'Feature',
                                properties: Object.assign({}, { GISJOIN }, headerRow.reduce(((acc, propName, i) => {
                                    acc[propName] = propsArr[i];
                                    return acc;
                                }), {}))
                            }
                        })
                    };
                    // write shape buffer in GeoJSON format:
                    const shapeBufferGeoJSON = {
                        type: 'FeatureCollection',
                        features: Object.values(shapeBuffer)
                    };
                    fs.writeFileSync(dataBufferPath, JSON.stringify(dataBufferGeoJSON));
                    fs.writeFileSync(shapeBufferPath, JSON.stringify(shapeBufferGeoJSON));
                    joinDebug('Done! Joins performed: ' + numJoins);
                    joinDebug(`${Object.keys(dataBuffer).length}/${numDataRows} unmatched data rows written to ${dataBufferPath} and ${Object.keys(shapeBuffer).length}/${numShapes} unmatched shapes written to ${shapeBufferPath}`);
                }
            });
    });
