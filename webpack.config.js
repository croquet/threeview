const HtmlWebPackPlugin = require('html-webpack-plugin');

module.exports = {
    devtool: 'source-map',
    entry : './src/threeview.js',
    output: {
        filename: '[name]-[contenthash:8].js',
        chunkFilename: 'chunk-[name]-[contenthash:8].js',
        clean: true,
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
    ],
};
