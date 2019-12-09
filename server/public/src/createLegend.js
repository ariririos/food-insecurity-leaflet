import L from 'leaflet';

export default function createLegend(legendName, style, units) {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = () => {
        let div = L.DomUtil.create('div', 'info legend');
        let expanded = true;
        div.onclick = () => {
            expanded = !expanded;
            if (expanded) {
                Array.from(div.childNodes).filter(node => node.querySelector('i')).forEach(node => node.classList.remove('collapsed'))
            }
            else {
                Array.from(div.childNodes).filter(node => node.querySelector('i')).forEach(node => node.classList.add('collapsed'))
            }
        }
        let { propClasses, getColorForValue } = style;
        div.innerHTML += `<div>${legendName}<br/></div>`;
        if (units) {
            div.innerHTML += `<div><i class='unit'>(${units})</i><br/></div>`;
        }
        for (let i = 1; i < propClasses.length; i++) {
            div.innerHTML += `<div><i class='color' style="background: ${getColorForValue(propClasses[i])}"></i>${propClasses[i]}${propClasses[i+1] ? "-" + propClasses[i+1] + "<br>": "+"}</div>`.trim();
        }
        return div;
    }
    return legend;
}