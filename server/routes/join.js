/* eslint-env node */
const express = require('express');
const router = express.Router();
const through2 = require('through2');
const JSONStream = require('jsonstream');
const { pipeline } = require('stream');
const aws = require('aws-sdk');
const debugFn = require('debug')('server:routes:join');

aws.config.update({
    accessKeyId: process.env.S3_KEY,
    secretAccessKey: process.env.S3_SECRET
});

const s3 = new aws.S3({apiVersion: '2006-03-01'});
/**
 * GeoJSON data API:
 * Access at /data/join/shapefileName
 * URL options:
 * ?propName=propValue filters for only features with ALL the given props from their associated data
 * any propNames (incl. w/o assoc. propValues) will be outputted in the final GeoJSON
 * if no propNames w/o propValues are provided, all properties will be outputted
 * Returns: GeoJSON Feature with geometry and requested properties and GISJOIN
 */

module.exports = async() => {
    debugFn('Finding possible shapefiles');
    const topDirObjsReq = await s3.listObjectsV2({
        Bucket: 'food-insecurity-leaflet',
        Delimiter: '/'
    }).promise();
    const topDirObjs = topDirObjsReq.CommonPrefixes.map(obj => obj.Prefix);
    const topGeojsonObjs = topDirObjsReq.Contents.map(obj => obj.Key);

    router.get('/:shapefile', async (req, res) => {
        const debug = debugFn.extend(req.params.shapefile);
        debug('Request for shapefile ' + req.params.shapefile);
        if (!(topGeojsonObjs.includes(req.params.shapefile + '_join.geojson') || topDirObjs.includes(req.params.shapefile + '/'))) {
            res.status(404).send('Shapefile not found');
            debug('Shapefile not found');
        }
        else {
            // TODO: implement redis-based cache (redis + redis-streams)
            // Check cache first
            // if (Object.values(cache).includes())
            let i = 0, j = 0; // for debugging
            // TODO: this compare function could probably be improved to look at the structure of the request rather than the string representation
            const compareFn = (a, b) => {
                const valA = a[1], valB = b[1];
                if (valA < valB) return -1;
                if (valB < valA) return 1;
                return 0;
            };
            const outputtedProps = Object.entries(req.query).filter(([_propName, propValue]) => propValue === '').sort(compareFn);
            const filterProps = Object.entries(req.query).filter(([_propName, propValue]) => propValue !== '').sort(compareFn);
            /*
            const props = Object.assign({}, Object.fromEntries(outputtedProps), Object.fromEntries(filterProps));
            const params = Object.keys(props).map(key => props[key] === '' ? key : key + '=' + props[key]).join('&');
            const reqSignature =`/${req.params.shapefile}?${params}`; // signature: /:shapefile?propNameA=propValueA&propNameB=propValueB&propNameC&propNameD
            debug('Request signature:', reqSignature);
            // check cache:
            if (cache.getKey(reqSignature) !== undefined) {
                const cacheDebug = debug.extend('cache');
                cacheDebug('Found in cache, pushing all features');
                let k = 0;
                const cacheForReq = cache.getKey(reqSignature);
                const rs = new Readable({
                    objectMode: true,
                    read() {
                        if (k % 100 == 0) cacheDebug('Found ' + k + ' matching features so far');
                        this.push(cacheForReq[k]);
                        k++;
                        if (k === cacheForReq.length) {
                            cacheDebug('Found ' + k + ' total features');
                            this.push(null);
                        }
                    }
                });
                return rs.pipe(JSONStream.stringify('{"features":[', ',', ']}')).on('error', err => console.error(err)).pipe(res).on('error', err => console.error(err));
            }
            else {
                cache[reqSignature] = [];
            }

            */
            const streamDebug = debug.extend('stream');
            streamDebug('Finding matching features');

            const filterStream = through2.obj(function(feature, _enc, cb) {
                j++;
                if (j % 10000 === 0) streamDebug('Scanned ' + j + ' features');
                const matchesAll = filterProps.every(([propName, propValue]) => feature.properties[propName] === propValue);
                if (matchesAll) {
                    i++;
                    if (i % 100 === 0) streamDebug('Found ' + i + ' matching features so far');
                    let output;
                    // either only output filter props and outputted props
                    if (outputtedProps.length > 0) {
                        const propsObj = {};
                        for (let [propName] of outputtedProps) {
                            propsObj[propName] = feature.properties[propName];
                        }
                        for (let [propName, propValue] of filterProps)  {
                            propsObj[propName] = propValue;
                        }
                        propsObj.GISJOIN = feature.properties.GISJOIN;
                        const moddedFeature = Object.assign({}, feature);
                        moddedFeature.properties = propsObj;
                        output = moddedFeature;
                    }
                    // or just output all props
                    else {
                        output = feature;
                    }
                    // cache[reqSignature].push(output); FIXME: waiting on cache
                    this.push(output);
                }
                cb();
            });

            let filePath;

            // either choose a specific filestream based on the filterProps (if exists) or use the generic join geojson

            const fsDebug = debug.extend('filestream');
            try {
                fsDebug('Checking for shapefile top directory');
                const topDirObjsReq = await s3.listObjectsV2({
                    Bucket: 'food-insecurity-leaflet',
                    Delimiter: '/'
                }).promise();
                const topDirObjs = topDirObjsReq.CommonPrefixes.map(obj => obj.Prefix);
                if (!topDirObjs.includes(req.params.shapefile + '/')) throw 'nofile';
                fsDebug('Checking for any prop-specific directory');
                for (let [propName, propValue] of Object.entries(Object.fromEntries(filterProps))) {
                    const propDirObjsReq = await s3.listObjectsV2({ Bucket: 'food-insecurity-leaflet', Prefix: req.params.shapefile + '/' + propName}).promise();
                    const propDirObjs = propDirObjsReq.Contents.map(obj => obj.Key);
                    if (propDirObjs.length === 0) continue;
                    fsDebug('Found relevant directory for ' + propName);
                    const geojsonObjReq = await s3.listObjectsV2({ Bucket: 'food-insecurity-leaflet', Prefix: req.params.shapefile + '/' + propName + '/' + propValue + '.geojson'}).promise();
                    const geojsonObj = geojsonObjReq.Contents.map(obj => obj.Key);
                    if (geojsonObj.length !== 1) throw 'nofile';
                    fsDebug(`Found relevant geojson for ${propName}=${propValue}`);
                    filePath = req.params.shapefile + '/' + propName + '/' + propValue + '.geojson';
                }
                if (!filePath) throw 'nofile';
            }
            catch (e) {
                if (e === 'nofile') {
                    fsDebug('Using generic geojson');
                    filePath = req.params.shapefile + '_join.geojson';
                }
                else {
                    throw e;
                }
            }

            pipeline(
                s3.getObject({ Bucket: 'food-insecurity-leaflet', Key: filePath }).createReadStream(),
                JSONStream.parse('features.*'),
                filterStream,
                JSONStream.stringify('{"features":[', ',', ']}'),
                res,
                (err) => {
                    if (err) {
                        console.error('Pipeline failed:')
                        console.error(err);
                        // delete cache[reqSignature]; FIXME: waiting on cache
                    }
                    else {
                        streamDebug('Pipeline succeeded, scanned ' + j + ' features and found ' + i + ' matches');
                    }
                }
            );
        }
    });

    return router;
};
