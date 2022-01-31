const HtmlWebPackPlugin = require('html-webpack-plugin');
const path = require('path');
const webpack = require("webpack");

module.exports = {
    entry : './src/threeview.js',
    output: {
        path: path.join(__dirname, 'dist'),
        filename: '[name]-[contenthash:8].js',
        chunkFilename: 'chunk-[name]-[contenthash:8].js',
    },
    resolve: {
        fallback: {
            "crypto": false,
            buffer: require.resolve('buffer/'),
        }
    },
    devServer: {
        allowedHosts: "all",
        port: 9010
    },
    plugins: [
        new HtmlWebPackPlugin({
            template: 'src/index.html',   // input
            filename: 'index.html',   // output filename in dist/
        }),
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer']
        }),
    ],
};
