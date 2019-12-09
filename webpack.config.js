const path = require('path');
const webpack = require('webpack');

module.exports = {
    mode: 'development',
    entry: './server/public/src/index.js',
    devtool: 'eval-source-map',
    output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'server/public/dist'),
        publicPath: '/'
    },
    plugins: [new webpack.HotModuleReplacementPlugin()],
    module: {
        rules: [{
            test: /node_modules\/jsonstream\/index\.js$/,
            loaders: ['shebang-loader']
        }]
    }
};