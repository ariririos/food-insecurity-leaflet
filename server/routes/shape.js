/* eslint-env node */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

/**
 * Shapefile data API:
 * Access at /data/shape/shapefileName
 * URL options:
 * GISJOIN[]: GISJOINs to return
 * Currently only json is available
 * Returns: GeoJSON with only geometry and GISJOIN property
 */

const possibleShapefiles = fs.readdirSync(path.join(__dirname, '../data/shape'));

router.get('/:shapefile', (req, res) => {
    if (!possibleShapefiles.includes(req.params.shapefile + '_shape.geojson')) {
        res.status(404).send('Shapefile not found');
    }
    else {
        fs.readFile(path.join(__dirname, '../data/shape', req.params.shapefile + '_shape.geojson'), 'utf8', (err, data) => {
            if (err) {
                console.error(err);
                res.status(500).send('Server error');
            }
            else {
                let json = JSON.parse(data);
                let { GISJOIN } = req.query;

                if (!GISJOIN) return res.json(json);

                if (!Array.isArray(GISJOIN)) return res.status(400).send('GISJOIN must be array');

                const filteredFeatures = json.features
                    // filter for properties
                    .filter(feat => feat.properties.GISJOIN == GISJOIN)
                    // keep only GISJOIN property and geometry
                    .map(feat => ({
                        type: 'Feature',
                        id: feat.id,
                        geometry: feat.geometry,
                        // keep only GISJOIN
                        properties: {
                            GISJOIN: feat.properties.GISJOIN
                        }
                    }));

                const filteredGeoJSON = {
                    type: 'FeatureCollection',
                    features: filteredFeatures
                };

                res.json(filteredGeoJSON);
            }
        })
    }
});

module.exports = router;