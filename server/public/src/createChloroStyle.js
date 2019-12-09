import jenks from './jenks';
import colorbrewer from 'colorbrewer';

export default async function createChloroStyle(features, propName, propObj) {
    const featPropGetter = feat => {
        if (propObj.normalization && feat.properties[propObj.normalization]) {
            if (propObj.normalization === 'Shape_Area') {
                return +feat.properties[propName] / (+feat.properties[propObj.normalization] / 1e6);
            } // FIXME: bad
            else {
                return +feat.properties[propName] / +feat.properties[propObj.normalization];
            }
        }
        else {
            return +feat.properties[propName];
        }
    };
    const propValues = features.map(featPropGetter).filter(x => x != null);
    let propClasses;
    try {
        propClasses = jenks(propValues, 5);
    }
    catch (e) {
        console.error('Errored creating style for ' + propName);
        console.error(e);
        return {
            styleFn: () => ({ fillColor: 'blue', weight: 2, fillOpacity: 0.5 }),
            propClasses: [],
            getColorForValue: () => '#00f'
        }
    }

    let getColorForValue = v => {
        let colorBracket = 0;
        for (let i = 0; i < propClasses.length - 1; i++) {
            if (v > propClasses[i]) colorBracket = i;
        }
        return colorbrewer['RdPu'][5][colorBracket];
    };

    let featColorsByJoin = features.reduce((acc, feat) => {
        acc[feat.properties.GISJOIN] = getColorForValue(featPropGetter(feat));
        return acc;
    }, {});

    let style = feature => ({
        fillColor: featColorsByJoin[feature.properties.GISJOIN],
        weight: 2,
        fillOpacity: 0.5
    });

    // let onEachFeature = (feature, layer) => layer.bindPopup(`${1}: ${feature.properties[propName]}`);

    return { styleFn: style, propClasses, getColorForValue };
}