import L from 'leaflet';
import { getDistance, getGreatCircleBearing, computeDestinationPoint } from 'geolib';

export default async function createRasterOverlay(completedFeatures, map) {
    // units: meters
    const tileSize = 1000;
    // const minTileSize = 10;
    // let currentTileSize = maxTileSize;

    // const createTile = (i, tileSize) => {};

    const featsGeoJSON = {
        type: 'FeatureCollection',
        features: completedFeatures
    };

    const featsLeaflet = L.geoJson(featsGeoJSON);
    const featsBounds = featsLeaflet.getBounds(); // could just pull this directly from the map
    L.rectangle(featsBounds, { color: '#ffffff', fill: false }).addTo(map);

    window.featsBounds = featsBounds;

    const bearing = getGreatCircleBearing({
        latitude: featsBounds.getNorth(), longitude: featsBounds.getWest()
    }, {
        latitude: featsBounds.getNorth(), longitude: featsBounds.getEast()
    });

    const sleep = () => new Promise(resolve => setTimeout(resolve, 1000));
    const boundsNW = featsBounds.getNorthWest();
    const boundsWidth = getDistance(featsBounds.getNorthWest(), featsBounds.getNorthEast()), boundsHeight = getDistance(featsBounds.getNorthWest(), featsBounds.getSouthWest());
    const numWidthIntervals = Math.ceil(boundsWidth / tileSize), numHeightIntervals = Math.ceil(boundsHeight / tileSize);
    for (let i = 1; i < numWidthIntervals; i++) {
        for (let j = 1; j < numHeightIntervals; j++) {
            const corner1 = computeDestinationPoint({ latitude: boundsNW.lat, longitude: boundsNW.lng }, i * tileSize, bearing);
            const corner2 = computeDestinationPoint({ latitude: boundsNW.lat, longitude: boundsNW.lng }, j * tileSize, bearing + 90);
            console.log('New rectangle with corners', corner1, corner2);
            L.rectangle([[corner1.latitude, corner1.longitude], [corner2.latitude, corner2.longitude]], { color: '#ff0000', fillColor: '#00ee00'}).addTo(map);
            await sleep();
        }
    }

}