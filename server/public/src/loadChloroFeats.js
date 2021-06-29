import filePaths from '../data/filePaths';
import propNames from '../data/propNames';
import L from 'leaflet';
import oboe from  'oboe';
import createChloroStyle from './createChloroStyle';
import callbackToAsyncIterator from '../lib/callback-to-async-iterator';

export default async function loadChloroFeats(map) {
    const chloroPropsByFilePath = {}, completedFeatures = [];
    // FIXME: instead of doing this in sequence, could do it in parallel (Promise?)
    // and return when the slowest layer has completed
    for (let fileObj of filePaths) {

        // const initProps = [];
        // for (let [propName, propObj] of Object.entries(props)) {
        //     if (propObj.onLoad) initProps[propName] = propObj;
        // }
        const feats = [], layerGroup = L.geoJSON({type: 'FeatureCollection', features: []}, {
            onEachFeature: (feat, layer) => layer.on('click', () => console.log(`${window.currDescription}: ${window.currNormalization ? (feat.properties[window.currPropName] / (feat.properties[window.currNormalization] / 1e6)) : feat.properties[window.currPropName]}`)) // FIXME: bad
        });
        chloroPropsByFilePath[fileObj.joinfile] = { layerGroup, props: {} };
        if (!propNames[fileObj.joinfile]) continue;
        const { filters, props } = propNames[fileObj.joinfile];
        layerGroup.addTo(map);

        const compareFn = (a, b) => {
            const valA = a[1], valB = b[1];
            if (valA < valB) return -1;
            if (valB < valA) return 1;
            return 0;
        };
        const outputtedProps = Object.entries(props).map(([k]) => [k, '']).sort(compareFn);
        const filterProps = Object.entries(filters).sort(compareFn);
        const paramMap = Object.assign({}, Object.fromEntries(outputtedProps), Object.fromEntries(filterProps));
        const params = Object.keys(paramMap).map(key => paramMap[key] === '' ? key : key + '=' + paramMap[key]).join('&');
        const reqSignature =`/data/join/${fileObj.joinfile}?${params}`;
        const features = callbackToAsyncIterator(async(cb, done) => {
            return oboe(reqSignature).node('features.*', cb).done(done);
        });

        for await (let feature of features) {
            feats.push(feature);
            // layerGroup.addData(feature); // FIXME: basic functionality
            completedFeatures.push(feature);
        }

        for (let [propName, propObj] of Object.entries(props)) {
            chloroPropsByFilePath[fileObj.joinfile].props[propName] = Object.assign({}, propObj, { style: await createChloroStyle(feats, propName, propObj) })
        }

    }
    return { chloroPropsByFilePath, completedFeatures };
}